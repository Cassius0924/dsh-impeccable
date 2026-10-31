/**
 * dsh-impeccable Host 半边：
 * 1. 注册内置 Impeccable v4.0.4 Skill Provider（动态重写脚本绝对路径）
 * 2. 注册 DSH 原生双阶段 Detector 守卫（tools/post-execute + agent/turn-stopping）
 * 3. 注册 /impeccable 主命令与可热更新的 Pin 快捷命令（0-Token 诊断 + LLM 预组装加速）
 * 4. 通过 connection.fetch 暴露认证栅栏内的 /api/dsh-impeccable/* 接口供 Web 视觉面板调用
 */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { existsSync, readFileSync, statSync, watch } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import {
  assembleSubcommandPrompt,
  collectWorkspaceOverview,
  DEFAULT_GLOBAL_CONFIG,
  findProjectRoot,
  IMPECCABLE_SUBCOMMANDS,
  isAllowedArtifactPath,
  parseCommandInvocation,
  parseSkillMarkdown,
  resolveDefaultAssetRoot,
  rewriteImpeccablePaths,
  runBundledScript,
  runImmediateHookOnTool,
  runStopHookOnTurn,
  scanWorkspaceAntipatterns,
  SUBCOMMAND_MAP,
  submitVisualQuestionAnswer,
  TurnStopGuard,
  VALID_PINNABLE_COMMANDS,
  validateGlobalConfig,
  type GlobalImpeccableConfig,
} from './core.ts'

export const name = 'dsh-impeccable'
export const inject = ['commands', 'connection']

const BUNDLED_SKILL_RANK = 600
const API_BASE = '/api/dsh-impeccable'
const MAX_BODY_BYTES = 2 * 1024 * 1024

type CommandResult =
  | { kind: 'success'; text?: string; sourceEventSeq?: number }
  | { kind: 'error'; text: string }

interface AgentFace {
  id?: string
  steer(message: unknown): void
  ctx?: unknown
}

interface CommandInvocation {
  agent: AgentFace
  rawInput: string
  attachments?: readonly unknown[]
  signal: AbortSignal
}

interface CommandDef {
  name: string
  description: string
  input?: { hint: string; attachments?: boolean }
  handler: (inv: CommandInvocation) => CommandResult | Promise<CommandResult>
}

interface CommandsFace {
  register(def: CommandDef): () => void
  find?(agent: AgentFace, name: string): CommandDef | undefined
}

interface ConnectionFace {
  fetch: {
    register(route: {
      path: string
      methods: ('GET' | 'POST')[]
      requestBody?: 'buffered'
      fetch: (request: Request) => Promise<Response>
    }): () => Promise<void>
  }
}

interface WorkingDirectoryFace {
  ensure(agent: unknown, signal?: AbortSignal): Promise<string>
  get?(sessionOrId: unknown): string | undefined
}

interface WorkspaceRegistryFace {
  list(): Array<{ id: string; title: string; path: string }>
}

interface AgentsFace {
  get(id: unknown): AgentFace | undefined
}

interface SkillCandidate {
  name: string
  description: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  provider: string
  source: string
  rank: number
  resourceBase: { kind: 'directory'; path: string }
  locator: string
}

interface SkillsFace {
  registerProvider(factory: () => {
    name: string
    list: () => Promise<SkillCandidate[]>
    get: (candidate: SkillCandidate, options?: { signal?: AbortSignal }) => Promise<Record<string, unknown>>
  }): () => void
}

const globalConfigPath = (): string =>
  join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'impeccable.json')

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

interface PendingPlaybookInjection {
  name: string
  text: string
}

function steerText(
  agent: AgentFace,
  text: string,
  attachments: readonly unknown[] = [],
  source: Record<string, unknown> = { kind: 'user' },
): void {
  agent.steer(
    createUserMessage({
      content: [
        ...(attachments as never[]),
        ...(text ? [{ type: 'text' as const, text }] : []),
      ],
      source: source as never,
    }),
  )
}

function getService<T>(ctx: Context, key: string): T | undefined {
  try {
    const viaGet = (ctx as unknown as { get?: (k: string) => T | undefined }).get?.(key)
    if (viaGet !== undefined) return viaGet
    return Reflect.get(ctx, key) as T | undefined
  } catch {
    return undefined
  }
}

async function resolveAgentWorkspace(ctx: Context, agent: AgentFace | undefined, signal?: AbortSignal): Promise<string> {
  if (agent) {
    try {
      const wd = getService<WorkingDirectoryFace>(ctx, 'workingDirectory')
      if (wd) return await wd.ensure(agent, signal)
    } catch { /* fallback */ }
  }
  const registry = getService<WorkspaceRegistryFace>(ctx, 'workspaceRegistry')
  if (registry) {
    try {
      const first = registry.list()[0]
      if (first?.path && existsSync(first.path)) return first.path
    } catch { /* fallback */ }
  }
  return process.cwd()
}

function listKnownWorkspaces(ctx: Context): Array<{ id: string; title: string; path: string }> {
  const registry = getService<WorkspaceRegistryFace>(ctx, 'workspaceRegistry')
  if (!registry) return []
  try {
    return registry.list().map(w => ({ id: w.id, title: w.title, path: w.path }))
  } catch {
    return []
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw Object.assign(new Error('请求体过大'), { status: 413 })
  }
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('JSON 必须是对象')
    }
    return parsed as Record<string, unknown>
  } catch {
    throw Object.assign(new Error('请求体必须是合法 JSON 对象'), { status: 400 })
  }
}

export function apply(ctx: Context): void {
  const commands = Reflect.get(ctx, 'commands') as CommandsFace
  const connection = Reflect.get(ctx, 'connection') as ConnectionFace
  const assetDir = resolveDefaultAssetRoot()
  const turnStopGuard = new TurnStopGuard()

  let currentConfig: GlobalImpeccableConfig = { ...DEFAULT_GLOBAL_CONFIG }
  let registeredCommandDisposers: Array<() => void> = []
  let active = true

  // 按 Agent 队列缓存待在下一步 agent/pre-step 注入的 Playbook 上下文（避免直接放进 source.kind === 'user' 刷屏聊天气泡）
  const pendingPlaybooksByAgent = new WeakMap<object, PendingPlaybookInjection[]>()
  const pendingPlaybooksById = new Map<string, PendingPlaybookInjection[]>()

  const enqueuePlaybook = (agent: AgentFace, item: PendingPlaybookInjection): void => {
    const agentId = typeof agent?.id === 'string' && agent.id ? agent.id : ''
    if (agentId) {
      const list = pendingPlaybooksById.get(agentId) ?? []
      list.push(item)
      pendingPlaybooksById.set(agentId, list)
      return
    }
    if (agent && typeof agent === 'object') {
      const list = pendingPlaybooksByAgent.get(agent) ?? []
      list.push(item)
      pendingPlaybooksByAgent.set(agent, list)
    }
  }

  const drainPlaybooks = (agent: AgentFace | undefined): PendingPlaybookInjection[] => {
    if (!agent) return []
    const out: PendingPlaybookInjection[] = []
    const agentId = typeof agent.id === 'string' && agent.id ? agent.id : ''
    if (agentId) {
      const byId = pendingPlaybooksById.get(agentId)
      if (byId && byId.length > 0) {
        out.push(...byId.splice(0))
      }
      pendingPlaybooksById.delete(agentId)
    }
    if (typeof agent === 'object') {
      const byRef = pendingPlaybooksByAgent.get(agent)
      if (byRef && byRef.length > 0) {
        out.push(...byRef.splice(0))
      }
      pendingPlaybooksByAgent.delete(agent)
    }
    return out
  }

  const steerImpeccableSubcommand = (
    agent: AgentFace,
    opts: {
      subcommand?: string
      args?: string
      attachments?: readonly unknown[]
      playbookPrompt: string
    },
  ): void => {
    const skillName = opts.subcommand ? `impeccable-${opts.subcommand}` : 'impeccable-design'
    const trimmedArgs = (opts.args ?? '').trim()
    const userText = trimmedArgs ? `/${skillName} ${trimmedArgs}` : `/${skillName}`
    enqueuePlaybook(agent, { name: skillName, text: opts.playbookPrompt })
    steerText(agent, userText, opts.attachments ?? [], { kind: 'user' })
  }

  // 1. 注册内置 Impeccable Skill Provider
  const registerBundledSkill = (): (() => void) | undefined => {
    const skills = getService<SkillsFace>(ctx, 'skills')
    const skillPath = join(assetDir, 'SKILL.md')
    if (!skills || !existsSync(skillPath)) return undefined
    try {
      const parsed = parseSkillMarkdown(readFileSync(skillPath, 'utf8'), skillPath)
      const candidate: SkillCandidate = {
        name: 'impeccable',
        description: parsed.description,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: 'dsh-impeccable',
        source: 'bundled',
        rank: BUNDLED_SKILL_RANK,
        resourceBase: { kind: 'directory', path: assetDir.split(sep).join('/') },
        locator: skillPath,
      }
      return skills.registerProvider(() => ({
        name: 'dsh-impeccable',
        list: () => Promise.resolve([candidate]),
        async get(cand, options) {
          const { rank: _r, locator, ...summary } = cand
          const raw = await readFile(locator, { encoding: 'utf8', signal: options?.signal })
          const content = rewriteImpeccablePaths(parseSkillMarkdown(raw, locator).content, assetDir)
          return { ...summary, content }
        },
      }))
    } catch (err) {
      ctx.logger.warn(`dsh-impeccable: 注册内置 skill 失败: ${String(err)}`)
      return undefined
    }
  }

  let skillDisposer = registerBundledSkill()
  if (!skillDisposer) {
    // 若 skills 服务稍后就绪，尝试通过 ctx.inject 挂载
    try {
      ctx.inject(['skills'], () => {
        if (!skillDisposer && active) skillDisposer = registerBundledSkill()
      })
    } catch { /* ignore */ }
  }

  // 2. 保存与热加载全局配置
  const saveGlobalConfigToDisk = async (nextConfig: GlobalImpeccableConfig): Promise<void> => {
    const file = globalConfigPath()
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, JSON.stringify(nextConfig, null, 2) + '\n', 'utf8')
    await rename(tmp, file)
  }

  const executeImpeccableCommand = async (
    inv: CommandInvocation,
    pinnedSubcommand?: string,
  ): Promise<CommandResult> => {
    const cwd = await resolveAgentWorkspace(ctx, inv.agent, inv.signal)
    const projectRoot = findProjectRoot(cwd)
    const parsed = parseCommandInvocation(inv.rawInput, pinnedSubcommand)

    if (parsed.kind === 'doctor') {
      const args = [
        ...(parsed.fix ? ['--fix'] : []),
        ...(parsed.target ? ['--target', parsed.target] : []),
      ]
      const out = await runBundledScript(assetDir, 'doctor.mjs', args, projectRoot, 20_000)
      const text = (out.stdout || out.stderr || 'Impeccable Doctor: 未发现异常。').trim()
      return { kind: out.exitCode === 0 ? 'success' : 'error', text }
    }

    if (parsed.kind === 'detect') {
      const report = await scanWorkspaceAntipatterns({
        assetDir,
        cwd: projectRoot,
        ...(parsed.target ? { target: parsed.target } : {}),
      })
      if (report.totalFindings === 0) {
        return {
          kind: 'success',
          text: `✓ Impeccable Detector: 已扫描 ${report.scannedFiles} 个 UI 文件，未发现反模式违例。`,
        }
      }
      const lines: string[] = [
        `⚠ Impeccable Detector: 扫描 ${report.scannedFiles} 个文件，发现 ${report.totalFindings} 处违例：`,
      ]
      for (const group of report.groups.slice(0, 12)) {
        lines.push(`\n• ${group.relFile} (${group.findings.length})`)
        for (const f of group.findings.slice(0, 6)) {
          lines.push(`  - [L${f.line ?? '?'}] ${f.id}${f.message ? `: ${f.message}` : ''}`)
        }
      }
      return { kind: 'success', text: lines.join('\n') }
    }

    if (parsed.kind === 'hooks') {
      const out = await runBundledScript(assetDir, 'hook-admin.mjs', parsed.argv, projectRoot, 15_000)
      const text = (out.stdout || out.stderr || '已完成 hooks 操作').trim()
      return { kind: out.exitCode === 0 ? 'success' : 'error', text }
    }

    if (parsed.kind === 'pin' || parsed.kind === 'unpin') {
      const targetCmd = parsed.subcommand
      if (!VALID_PINNABLE_COMMANDS.has(targetCmd)) {
        return {
          kind: 'error',
          text: `未知子命令 "${targetCmd}"。可 Pin 子命令：${Array.from(VALID_PINNABLE_COMMANDS).join(', ')}`,
        }
      }
      const nextSet = new Set(currentConfig.pinnedCommands)
      if (parsed.kind === 'pin') nextSet.add(targetCmd)
      else nextSet.delete(targetCmd)
      const nextConfig: GlobalImpeccableConfig = {
        ...currentConfig,
        pinnedCommands: Array.from(nextSet),
      }
      await saveGlobalConfigToDisk(nextConfig)
      applyGlobalConfig(nextConfig)
      return {
        kind: 'success',
        text: parsed.kind === 'pin'
          ? `已将 /impeccable ${targetCmd} 固定到斜杠命令菜单。`
          : `已从斜杠命令菜单移除 /impeccable ${targetCmd}。`,
      }
    }

    if (parsed.kind === 'subcommand') {
      const prompt = await assembleSubcommandPrompt({
        assetDir,
        cwd: projectRoot,
        subcommand: parsed.subcommand,
        args: parsed.args,
      })
      steerImpeccableSubcommand(inv.agent, {
        subcommand: parsed.subcommand,
        args: parsed.args,
        attachments: inv.attachments,
        playbookPrompt: prompt,
      })
      return {
        kind: 'success',
        text: `已启动 /impeccable ${parsed.subcommand}${parsed.args ? ` (${parsed.args})` : ''}（已预注入项目上下文与设计剧本）`,
      }
    }

    // general
    const prompt = await assembleSubcommandPrompt({
      assetDir,
      cwd: projectRoot,
      args: parsed.args,
    })
    steerImpeccableSubcommand(inv.agent, {
      args: parsed.args,
      attachments: inv.attachments,
      playbookPrompt: prompt,
    })
    return {
      kind: 'success',
      text: parsed.args
        ? `已发送 Impeccable 设计请求：${parsed.args}`
        : '已加载 Impeccable 交互式路由菜单',
    }
  }

  const unregisterAllCommands = (): void => {
    for (const dispose of registeredCommandDisposers.splice(0)) {
      try { dispose() } catch { /* ignore */ }
    }
  }

  const applyGlobalConfig = (cfg: GlobalImpeccableConfig): void => {
    currentConfig = cfg
    unregisterAllCommands()
    if (!active) return

    // 始终注册主命令 /impeccable（重注册同时向客户端广播 commands/change，刷新 Pin 列表）
    try {
      registeredCommandDisposers.push(
        commands.register({
          name: 'impeccable',
          description: 'Impeccable 设计套件：/impeccable <subcommand|doctor|detect|hooks|pin|unpin> [target]',
          input: { hint: '[subcommand] [target]', attachments: true },
          handler: inv => executeImpeccableCommand(inv),
        }),
      )
    } catch (err) {
      ctx.logger.warn(`dsh-impeccable: 注册 /impeccable 失败: ${String(err)}`)
    }
  }

  const reloadGlobalConfig = async (): Promise<void> => {
    const file = globalConfigPath()
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        if (active) applyGlobalConfig({ ...DEFAULT_GLOBAL_CONFIG })
        return
      }
      ctx.logger.warn(`dsh-impeccable: 读取 ${file} 失败: ${String(err)}`)
      return
    }
    try {
      const res = validateGlobalConfig(JSON.parse(raw))
      if (!res.ok) {
        ctx.logger.warn(`dsh-impeccable: ${file} 校验未通过，保留当前配置`)
        return
      }
      if (active) applyGlobalConfig(res.value)
    } catch (err) {
      ctx.logger.warn(`dsh-impeccable: ${file} JSON 解析失败: ${String(err)}`)
    }
  }

  // 启动时初始化配置与命令
  applyGlobalConfig(currentConfig)
  void reloadGlobalConfig()

  // 2.5 在 agent/pre-step 中将 Playbook 作为 skill-invocation (form: 'instructions') 注入，不污染用户聊天气泡
  try {
    ctx.on(
      'agent/pre-step' as never,
      (async (
        payload: { agent?: AgentFace; messages?: unknown[]; signal?: AbortSignal },
        next: () => Promise<{ kind: string; messages?: unknown[] }>,
      ) => {
        const decision = await next()
        if (!decision || decision.kind === 'reject') return decision
        const items = drainPlaybooks(payload?.agent)
        if (items.length === 0) return decision
        const injections = items.map(item =>
          createUserMessage({
            content: [{ type: 'text', text: item.text }],
            source: {
              kind: 'skill-invocation',
              name: item.name,
              form: 'instructions',
            } as never,
          }),
        )
        return {
          ...decision,
          messages: [...(decision.messages ?? payload?.messages ?? []), ...injections],
        }
      }) as never,
    )
  } catch (err) {
    ctx.logger.warn(`dsh-impeccable: 挂载 agent/pre-step 失败: ${String(err)}`)
  }

  // 3. 原生双阶段 Detector 守卫钩子
  try {
    ctx.on(
      'tools/post-execute' as never,
      (async (
        exec: { name: string; args?: unknown; input?: unknown; agent?: AgentFace; signal?: AbortSignal },
        result: { isError?: boolean },
        next: () => Promise<{ kind: string; additionalContexts?: unknown[] }>,
      ) => {
        const decision = await next()
        if (!currentConfig.hookEnabled || result?.isError || decision?.kind === 'block') {
          return decision
        }
        try {
          const cwd = await resolveAgentWorkspace(ctx, exec.agent, exec.signal)
          const sessionId = String(exec.agent?.id ?? 'dsh-session')
          const hookRes = await runImmediateHookOnTool({
            assetDir,
            cwd,
            sessionId,
            toolName: exec.name,
            toolArgs: exec.args ?? exec.input,
          })
          if (hookRes.emitted && hookRes.contextText) {
            const reminder = createUserMessage({
              content: [{ type: 'text', text: hookRes.contextText }],
              source: { kind: 'dsh-impeccable', form: 'notice' } as never,
            })
            return {
              ...decision,
              additionalContexts: [...(decision.additionalContexts ?? []), reminder],
            }
          }
        } catch (err) {
          ctx.logger.warn(`dsh-impeccable: post-execute 守卫异常（已忽略）: ${String(err)}`)
        }
        return decision
      }) as never,
    )
  } catch (err) {
    ctx.logger.warn(`dsh-impeccable: 挂载 tools/post-execute 失败: ${String(err)}`)
  }

  try {
    ctx.on(
      'agent/turn-stopping' as never,
      (async (payload: { agent: AgentFace; turn: number; signal?: AbortSignal }) => {
        if (!currentConfig.hookEnabled || !currentConfig.stopDeepPass) return
        try {
          const cwd = await resolveAgentWorkspace(ctx, payload.agent, payload.signal)
          const sessionId = String(payload.agent?.id ?? 'dsh-session')
          const stopRes = await runStopHookOnTurn({
            assetDir,
            cwd,
            sessionId,
            turn: payload.turn,
            guard: turnStopGuard,
          })
          if (stopRes.emitted && stopRes.contextText) {
            steerText(payload.agent, stopRes.contextText, [], {
              kind: 'dsh-impeccable',
              form: 'notice',
            })
          }
        } catch (err) {
          ctx.logger.warn(`dsh-impeccable: turn-stopping 深度扫描异常（已忽略）: ${String(err)}`)
        }
      }) as never,
    )
  } catch (err) {
    ctx.logger.warn(`dsh-impeccable: 挂载 agent/turn-stopping 失败: ${String(err)}`)
  }

  // 4. 暴露 /api/dsh-impeccable/* 认证路由
  const resolveRequestedCwd = async (urlOrBodyCwd?: string | null, sessionId?: string | null): Promise<string> => {
    if (typeof urlOrBodyCwd === 'string' && urlOrBodyCwd.trim() && isAbsolute(urlOrBodyCwd.trim())) {
      const resolved = resolve(urlOrBodyCwd.trim())
      if (existsSync(resolved)) return resolved
    }
    if (typeof sessionId === 'string' && sessionId.trim()) {
      const agents = getService<AgentsFace>(ctx, 'agents')
      const agent = agents?.get(sessionId.trim())
      if (agent) {
        return await resolveAgentWorkspace(ctx, agent)
      }
      const wd = getService<WorkingDirectoryFace>(ctx, 'workingDirectory')
      const byId = wd?.get?.(sessionId.trim())
      if (typeof byId === 'string' && byId && existsSync(byId)) return byId
    }
    return await resolveAgentWorkspace(ctx, undefined)
  }

  const routeDisposers: Array<() => Promise<void>> = []
  const registerRoute = (
    subPath: string,
    methods: ('GET' | 'POST')[],
    handler: (request: Request) => Promise<Response>,
  ): void => {
    routeDisposers.push(
      connection.fetch.register({
        path: `${API_BASE}${subPath}`,
        methods,
        requestBody: 'buffered',
        fetch: async (req) => {
          try {
            return await handler(req)
          } catch (err) {
            const status = typeof (err as { status?: number })?.status === 'number'
              ? (err as { status: number }).status
              : 500
            return jsonResponse(status, {
              ok: false,
              error: String((err as Error)?.message ?? err),
            })
          }
        },
      }),
    )
  }

  // GET /api/dsh-impeccable/overview
  registerRoute('/overview', ['GET'], async (req) => {
    const url = new URL(req.url, 'http://dsh.local')
    const sessionId = url.searchParams.get('sessionId')
    const rawCwd = url.searchParams.get('cwd')
    const includeDoctor = url.searchParams.get('doctor') !== '0'
    const cwd = await resolveRequestedCwd(rawCwd, sessionId)
    const overview = await collectWorkspaceOverview({ assetDir, cwd, includeDoctor })
    return jsonResponse(200, {
      ok: true,
      globalConfig: currentConfig,
      subcommands: IMPECCABLE_SUBCOMMANDS,
      workspaces: listKnownWorkspaces(ctx),
      ...overview,
    })
  })

  // GET / POST /api/dsh-impeccable/config
  registerRoute('/config', ['GET', 'POST'], async (req) => {
    if (req.method === 'GET') {
      return jsonResponse(200, {
        ok: true,
        globalConfig: currentConfig,
        subcommands: IMPECCABLE_SUBCOMMANDS,
      })
    }
    const body = await readJsonBody(req)
    if (body.scope === 'project') {
      const cwd = await resolveRequestedCwd(body.cwd as string | undefined, body.sessionId as string | undefined)
      const projectRoot = findProjectRoot(cwd)
      const action = typeof body.action === 'string' ? body.action : 'status'
      const args: string[] = [action]
      if (typeof body.rule === 'string' && body.rule.trim()) args.push(body.rule.trim())
      if (typeof body.value === 'string' && body.value.trim()) args.push(body.value.trim())
      if (typeof body.file === 'string' && body.file.trim()) {
        if (action === 'ignore-file') args.push(body.file.trim())
        else args.push('--file', body.file.trim())
      }
      const out = await runBundledScript(assetDir, 'hook-admin.mjs', args, projectRoot, 15_000)
      return jsonResponse(out.exitCode === 0 ? 200 : 400, {
        ok: out.exitCode === 0,
        output: (out.stdout || out.stderr).trim(),
      })
    }

    const candidate = body.globalConfig ?? body
    const validated = validateGlobalConfig(candidate)
    if (!validated.ok) {
      return jsonResponse(400, { ok: false, errors: validated.errors })
    }
    await saveGlobalConfigToDisk(validated.value)
    applyGlobalConfig(validated.value)
    return jsonResponse(200, { ok: true, globalConfig: currentConfig })
  })

  // POST /api/dsh-impeccable/scan
  registerRoute('/scan', ['POST'], async (req) => {
    const body = await readJsonBody(req)
    const cwd = await resolveRequestedCwd(body.cwd as string | undefined, body.sessionId as string | undefined)
    const target = typeof body.target === 'string' ? body.target : undefined
    const report = await scanWorkspaceAntipatterns({
      assetDir,
      cwd,
      ...(target ? { target } : {}),
    })
    return jsonResponse(200, { ok: true, ...report })
  })

  // POST /api/dsh-impeccable/doctor
  registerRoute('/doctor', ['POST'], async (req) => {
    const body = await readJsonBody(req)
    const cwd = await resolveRequestedCwd(body.cwd as string | undefined, body.sessionId as string | undefined)
    const projectRoot = findProjectRoot(cwd)
    const fix = body.fix === true
    const args = ['--json', ...(fix ? ['--fix'] : [])]
    const out = await runBundledScript(assetDir, 'doctor.mjs', args, projectRoot, 20_000)
    let parsed: unknown = null
    try {
      parsed = JSON.parse(out.stdout.trim())
    } catch {
      parsed = { raw: (out.stdout || out.stderr).trim() }
    }
    return jsonResponse(200, { ok: out.exitCode === 0, doctor: parsed })
  })

  // GET / POST /api/dsh-impeccable/artifact
  registerRoute('/artifact', ['GET', 'POST'], async (req) => {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://dsh.local')
      const cwd = await resolveRequestedCwd(url.searchParams.get('cwd'), url.searchParams.get('sessionId'))
      const projectRoot = findProjectRoot(cwd)
      const relPath = url.searchParams.get('path') ?? ''
      const check = isAllowedArtifactPath(projectRoot, relPath)
      if (!check.allowed) {
        return jsonResponse(403, { ok: false, error: check.reason ?? '禁止访问该路径' })
      }
      if (!existsSync(check.resolvedPath)) {
        return jsonResponse(200, { ok: true, exists: false, relPath: check.relPath, content: '' })
      }
      const content = await readFile(check.resolvedPath, 'utf8')
      return jsonResponse(200, { ok: true, exists: true, relPath: check.relPath, content })
    }

    const body = await readJsonBody(req)
    const cwd = await resolveRequestedCwd(body.cwd as string | undefined, body.sessionId as string | undefined)
    const projectRoot = findProjectRoot(cwd)
    const relPath = typeof body.path === 'string' ? body.path : ''
    const content = typeof body.content === 'string' ? body.content : ''
    const check = isAllowedArtifactPath(projectRoot, relPath)
    if (!check.allowed) {
      return jsonResponse(403, { ok: false, error: check.reason ?? '禁止写入该路径' })
    }
    await mkdir(dirname(check.resolvedPath), { recursive: true })
    await writeFile(check.resolvedPath, content, 'utf8')
    return jsonResponse(200, { ok: true, relPath: check.relPath })
  })

  // POST /api/dsh-impeccable/steer
  registerRoute('/steer', ['POST'], async (req) => {
    const body = await readJsonBody(req)
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const agents = getService<AgentsFace>(ctx, 'agents')
    const agent = sessionId ? agents?.get(sessionId) : undefined
    if (!agent) {
      return jsonResponse(404, {
        ok: false,
        error: '未找到当前活跃会话（请先在会话视图中打开一个对话）',
      })
    }

    const cwd = await resolveRequestedCwd(body.cwd as string | undefined, sessionId)
    const projectRoot = findProjectRoot(cwd)

    if (typeof body.rawPrompt === 'string' && body.rawPrompt.trim()) {
      steerText(agent, body.rawPrompt.trim())
      return jsonResponse(200, { ok: true, steered: true })
    }

    const subcommand = typeof body.subcommand === 'string' ? body.subcommand.trim() : undefined
    const args = typeof body.args === 'string' ? body.args.trim() : ''
    const prompt = await assembleSubcommandPrompt({
      assetDir,
      cwd: projectRoot,
      ...(subcommand ? { subcommand } : {}),
      args,
    })
    steerImpeccableSubcommand(agent, {
      ...(subcommand ? { subcommand } : {}),
      args,
      playbookPrompt: prompt,
    })
    return jsonResponse(200, { ok: true, steered: true, subcommand: subcommand ?? 'general' })
  })

  // GET /api/dsh-impeccable/asset
  registerRoute('/asset', ['GET'], async (req) => {
    const url = new URL(req.url, 'http://dsh.local')
    const cwd = await resolveRequestedCwd(url.searchParams.get('cwd'), url.searchParams.get('sessionId'))
    const projectRoot = findProjectRoot(cwd)
    const relPath = url.searchParams.get('path') ?? ''
    const resolved = isAbsolute(relPath) ? resolve(relPath) : resolve(projectRoot, relPath)
    const allowedPrefix = join(projectRoot, '.impeccable') + sep
    if (!resolved.startsWith(allowedPrefix) || !existsSync(resolved)) {
      return new Response('Not found', { status: 404 })
    }
    const ext = extname(resolved).toLowerCase()
    const mime =
      ext === '.png' ? 'image/png'
        : ext === '.webp' ? 'image/webp'
        : ext === '.svg' ? 'image/svg+xml'
        : ext === '.gif' ? 'image/gif'
        : 'image/jpeg'
    const buf = await readFile(resolved)
    return new Response(buf, {
      status: 200,
      headers: { 'content-type': mime, 'cache-control': 'private, max-age=60' },
    })
  })

  // POST /api/dsh-impeccable/question/answer
  registerRoute('/question/answer', ['POST'], async (req) => {
    const body = await readJsonBody(req)
    const cwd = await resolveRequestedCwd(body.cwd as string | undefined, body.sessionId as string | undefined)
    const projectRoot = findProjectRoot(cwd)
    const key = typeof body.key === 'string' ? body.key.trim() : ''
    const optionId = typeof body.optionId === 'string' ? body.optionId.trim() : ''
    const steer = typeof body.steer === 'string' ? body.steer : ''
    if (!key || !optionId) {
      return jsonResponse(400, { ok: false, error: '缺少 key 或 optionId' })
    }
    const res = submitVisualQuestionAnswer({ projectRoot, key, optionId, steer })
    return jsonResponse(res.ok ? 200 : 400, res)
  })

  // 5. 监听全局配置文件热生效 + 插件卸载清理
  ctx.effect(() => {
    active = true
    const file = globalConfigPath()
    const dir = dirname(file)
    const targetName = basename(file)
    let timer: ReturnType<typeof setTimeout> | undefined
    let watcher: ReturnType<typeof watch> | undefined
    try {
      mkdirSyncForWatch(dir)
      watcher = watch(dir, (_event, filename) => {
        if (filename !== null && filename !== targetName && !filename.startsWith(targetName)) return
        clearTimeout(timer)
        timer = setTimeout(() => { void reloadGlobalConfig() }, 300)
        timer.unref?.()
      })
      watcher.unref?.()
      watcher.on('error', err => ctx.logger.warn(`dsh-impeccable: watch 错误: ${String(err)}`))
    } catch { /* ignore */ }

    return () => {
      active = false
      clearTimeout(timer)
      watcher?.close()
      unregisterAllCommands()
      skillDisposer?.()
      for (const disposeRoute of routeDisposers) {
        void disposeRoute()
      }
    }
  }, 'dsh-impeccable: lifecycle')
}

function mkdirSyncForWatch(dir: string): void {
  try {
    if (!existsSync(dir)) {
      statSync(dirname(dir))
    }
  } catch { /* ignore */ }
}
