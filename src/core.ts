/**
 * dsh-impeccable 纯逻辑核心层（无 Cordis 运行时强耦合，供 Host 与单测直接调用）。
 */
import { execFile } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type CommandCategory = 'Build' | 'Evaluate' | 'Refine' | 'Enhance' | 'Fix' | 'Iterate'

export interface SubcommandMeta {
  name: string
  category: CommandCategory
  description: string
  descriptionZh: string
  argumentHint: string
  needsCraftFloor: boolean
}

export const IMPECCABLE_SUBCOMMANDS: readonly SubcommandMeta[] = [
  {
    name: 'init',
    category: 'Build',
    description: 'Capture durable product context in PRODUCT.md and bootstrap DESIGN.md.',
    descriptionZh: '初始化项目设计上下文（生成 PRODUCT.md 与 DESIGN.md）',
    argumentHint: '',
    needsCraftFloor: false,
  },
  {
    name: 'document',
    category: 'Build',
    description: 'Generate DESIGN.md and .impeccable/design.json from existing project code.',
    descriptionZh: '从现有代码提取生成 DESIGN.md 与 design.json 规范',
    argumentHint: '',
    needsCraftFloor: false,
  },
  {
    name: 'shape',
    category: 'Build',
    description: 'Plan UX and UI before writing code through discovery and visual probes.',
    descriptionZh: '编码前规划 UX/UI 方案并产出界面设计契约',
    argumentHint: '[feature]',
    needsCraftFloor: false,
  },
  {
    name: 'extract',
    category: 'Build',
    description: 'Pull reusable tokens and components into the design system.',
    descriptionZh: '抽离可复用的设计 Token 与公共组件到设计系统',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'craft',
    category: 'Build',
    description: 'Build or redesign a surface with full Impeccable new-work flow.',
    descriptionZh: '按 Impeccable 标准流程构建或重设计界面',
    argumentHint: '[feature]',
    needsCraftFloor: true,
  },
  {
    name: 'critique',
    category: 'Evaluate',
    description: 'UX design review with quantitative heuristic scoring and persona testing.',
    descriptionZh: '全方位 UX 设计评审（量化打分、反模式扫描与改进清单）',
    argumentHint: '[target]',
    needsCraftFloor: false,
  },
  {
    name: 'audit',
    category: 'Evaluate',
    description: 'Technical quality checks across accessibility, performance, theming, and responsive design.',
    descriptionZh: '技术质量审计（无障碍 a11y、性能、响应式、主题与反模式）',
    argumentHint: '[target]',
    needsCraftFloor: false,
  },
  {
    name: 'polish',
    category: 'Refine',
    description: 'Final quality pass fixing alignment, spacing, consistency, and micro-details before shipping.',
    descriptionZh: '上线前最终精修（对齐、间距、一致性与微交互细节）',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'bolder',
    category: 'Refine',
    description: 'Amplify safe or bland designs to increase visual impact and personality.',
    descriptionZh: '强化平庸保守的设计，提升视觉冲击力与个性张力',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'quieter',
    category: 'Refine',
    description: 'Tone down visually aggressive or overstimulating designs.',
    descriptionZh: '收敛过于喧宾夺主或刺眼的视觉元素，回归克制质感',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'distill',
    category: 'Refine',
    description: 'Strip designs to their essence by removing unnecessary complexity.',
    descriptionZh: '化繁为简，剔除冗余装饰与认知噪音',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'harden',
    category: 'Refine',
    description: 'Make interfaces production-ready: error states, i18n, text overflow, edge cases.',
    descriptionZh: '生产级加固（异常态、国际化长文本溢出、极端数据边界）',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'onboard',
    category: 'Refine',
    description: 'Design first-run flows, empty states, and user activation moments.',
    descriptionZh: '设计首次引导流、空状态（Empty States）与核心激活时刻',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'animate',
    category: 'Enhance',
    description: 'Add purposeful animations, transitions, and micro-interactions.',
    descriptionZh: '注入有意义的过渡动效与微交互反馈',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'colorize',
    category: 'Enhance',
    description: 'Add strategic color to monochromatic or dull UIs.',
    descriptionZh: '为单调沉闷的界面引入富有层次的策略性色彩',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'typeset',
    category: 'Enhance',
    description: 'Improve typography hierarchy, font choices, sizing, and readability.',
    descriptionZh: '优化字体搭配、字阶层级、行高字重与阅读韵律',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'layout',
    category: 'Enhance',
    description: 'Fix spacing, rhythm, alignment, and visual hierarchy.',
    descriptionZh: '重构空间网格、间距节奏与视觉主次层级',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'delight',
    category: 'Enhance',
    description: 'Add moments of joy, personality, and memorable touches.',
    descriptionZh: '打磨令人会心一笑的惊喜细节与品牌温度',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'overdrive',
    category: 'Enhance',
    description: 'Push interfaces past conventional limits with ambitious visual effects.',
    descriptionZh: '突破常规限制的高阶视觉表现（着色器、物理弹簧、60fps 滚动动效）',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'clarify',
    category: 'Fix',
    description: 'Improve UX copy, labels, instructions, and error messages.',
    descriptionZh: '润色界面文案、按钮标签、操作指引与错误提示',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'adapt',
    category: 'Fix',
    description: 'Adapt designs across screen sizes, devices, and platforms.',
    descriptionZh: '多端与多视口响应式适配（移动端、平板、触控热区）',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'optimize',
    category: 'Fix',
    description: 'Diagnose and fix UI rendering, animation, and loading performance.',
    descriptionZh: '诊断并修复前端渲染、动效卡顿与资源加载性能',
    argumentHint: '[target]',
    needsCraftFloor: true,
  },
  {
    name: 'live',
    category: 'Iterate',
    description: 'Interactive visual variant mode: pick elements in the browser and generate alternatives.',
    descriptionZh: '浏览器实时多方案变体试验模式',
    argumentHint: '[target]',
    needsCraftFloor: false,
  },
] as const

export const SUBCOMMAND_MAP: ReadonlyMap<string, SubcommandMeta> = new Map(
  IMPECCABLE_SUBCOMMANDS.map(cmd => [cmd.name, cmd]),
)

export const VALID_PINNABLE_COMMANDS: ReadonlySet<string> = new Set(
  IMPECCABLE_SUBCOMMANDS.map(cmd => cmd.name),
)

export interface GlobalImpeccableConfig {
  hookEnabled: boolean
  stopDeepPass: boolean
  showConversationTab: boolean
  pinnedCommands: string[]
}

export const DEFAULT_GLOBAL_CONFIG: GlobalImpeccableConfig = {
  hookEnabled: true,
  stopDeepPass: true,
  showConversationTab: true,
  pinnedCommands: ['critique', 'audit', 'polish', 'shape'],
}

export interface ValidationError {
  field: string
  message: string
}

export function validateGlobalConfig(
  raw: unknown,
): { ok: true; value: GlobalImpeccableConfig } | { ok: false; errors: ValidationError[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: 'root', message: '配置必须是 JSON 对象' }] }
  }
  const obj = raw as Record<string, unknown>
  const errors: ValidationError[] = []

  const hookEnabled = obj.hookEnabled === undefined ? DEFAULT_GLOBAL_CONFIG.hookEnabled : obj.hookEnabled
  if (typeof hookEnabled !== 'boolean') {
    errors.push({ field: 'hookEnabled', message: 'hookEnabled 必须是布尔值' })
  }

  const stopDeepPass = obj.stopDeepPass === undefined ? DEFAULT_GLOBAL_CONFIG.stopDeepPass : obj.stopDeepPass
  if (typeof stopDeepPass !== 'boolean') {
    errors.push({ field: 'stopDeepPass', message: 'stopDeepPass 必须是布尔值' })
  }

  const showConversationTab = obj.showConversationTab === undefined
    ? DEFAULT_GLOBAL_CONFIG.showConversationTab
    : obj.showConversationTab
  if (typeof showConversationTab !== 'boolean') {
    errors.push({ field: 'showConversationTab', message: 'showConversationTab 必须是布尔值' })
  }

  const rawPinned = obj.pinnedCommands === undefined ? DEFAULT_GLOBAL_CONFIG.pinnedCommands : obj.pinnedCommands
  const pinnedCommands: string[] = []
  if (!Array.isArray(rawPinned)) {
    errors.push({ field: 'pinnedCommands', message: 'pinnedCommands 必须是字符串数组' })
  } else {
    const seen = new Set<string>()
    for (let i = 0; i < rawPinned.length; i++) {
      const item = rawPinned[i]
      if (typeof item !== 'string' || !VALID_PINNABLE_COMMANDS.has(item)) {
        errors.push({
          field: `pinnedCommands[${i}]`,
          message: `未知的可 Pin 子命令 "${String(item)}"`,
        })
      } else if (!seen.has(item)) {
        seen.add(item)
        pinnedCommands.push(item)
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      hookEnabled: hookEnabled as boolean,
      stopDeepPass: stopDeepPass as boolean,
      showConversationTab: showConversationTab as boolean,
      pinnedCommands,
    },
  }
}

/** 解析插件内置的 assets/impeccable 绝对目录。 */
export function resolveDefaultAssetRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '..', 'assets', 'impeccable'),
    resolve(here, 'assets', 'impeccable'),
  ]
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'SKILL.md'))) return candidate
  }
  return candidates[0]!
}

/** 解析 SKILL.md 的 YAML frontmatter 与正文。 */
export function parseSkillMarkdown(raw: string, filePath = 'SKILL.md'): {
  name: string
  description: string
  content: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (!match || match[1] === undefined) {
    throw new Error(`dsh-impeccable: ${filePath} 缺少 YAML frontmatter`)
  }
  const frontmatter = match[1]
  let name = 'impeccable'
  let description = ''
  for (const line of frontmatter.split(/\r?\n/u)) {
    const m = /^([a-zA-Z0-9_-]+):\s*(.+)$/u.exec(line.trim())
    if (!m) continue
    const key = m[1]
    const val = m[2]!.replace(/^["']|["']$/gu, '').trim()
    if (key === 'name' && val) name = val
    if (key === 'description' && val) description = val
  }
  if (!description) {
    throw new Error(`dsh-impeccable: ${filePath} 缺少 description 字段`)
  }
  const content = raw.slice(match[0].length).trim()
  return { name, description, content }
}

/**
 * 将 SKILL.md / reference/*.md 中的相对脚本路径（如 `.gemini/skills/impeccable`）
 * 重写为插件内置资产的真实绝对路径，使模型在任意工作区直接运行 node 脚本均不报错。
 */
export function rewriteImpeccablePaths(markdown: string, assetDir: string): string {
  const normalized = assetDir.split(sep).join('/')
  return markdown
    .replace(/\.gemini\/skills\/impeccable/gu, normalized)
    .replace(/\.claude\/skills\/impeccable/gu, normalized)
    .replace(/\.agents\/skills\/impeccable/gu, normalized)
    .replace(/<skill-base-dir>/gu, normalized)
}

export type ParsedCommandAction =
  | { kind: 'doctor'; fix: boolean; target?: string }
  | { kind: 'detect'; target?: string }
  | { kind: 'hooks'; argv: string[] }
  | { kind: 'pin'; subcommand: string }
  | { kind: 'unpin'; subcommand: string }
  | { kind: 'subcommand'; subcommand: string; args: string }
  | { kind: 'general'; args: string }

/**
 * 解析 `/impeccable ...` 或已 Pin 快捷命令 `/<pinned> ...` 的输入参数。
 */
export function parseCommandInvocation(rawInput: string, pinnedSubcommand?: string): ParsedCommandAction {
  const trimmed = rawInput.trim()
  if (pinnedSubcommand) {
    const mapped = pinnedSubcommand === 'teach' ? 'init' : pinnedSubcommand
    return { kind: 'subcommand', subcommand: mapped, args: trimmed }
  }
  if (!trimmed) {
    return { kind: 'general', args: '' }
  }
  const tokens = trimmed.split(/\s+/u)
  const first = tokens[0]!.toLowerCase()
  const rest = trimmed.slice(tokens[0]!.length).trim()

  if (first === 'doctor') {
    const restTokens = rest ? rest.split(/\s+/u) : []
    const fix = restTokens.includes('--fix')
    const targetIdx = restTokens.indexOf('--target')
    const target = targetIdx >= 0 && restTokens[targetIdx + 1]
      ? restTokens[targetIdx + 1]
      : restTokens.find(t => !t.startsWith('-'))
    return { kind: 'doctor', fix, ...(target ? { target } : {}) }
  }

  if (first === 'detect' || first === 'scan') {
    return { kind: 'detect', ...(rest ? { target: rest } : {}) }
  }

  if (first === 'hooks' || first === 'hook') {
    const argv = rest ? rest.split(/\s+/u) : ['status']
    return { kind: 'hooks', argv: argv.length > 0 ? argv : ['status'] }
  }

  if (first === 'pin' && rest) {
    return { kind: 'pin', subcommand: rest.split(/\s+/u)[0]!.toLowerCase() }
  }

  if (first === 'unpin' && rest) {
    return { kind: 'unpin', subcommand: rest.split(/\s+/u)[0]!.toLowerCase() }
  }

  const normalizedSub = first === 'teach' ? 'init' : first
  if (SUBCOMMAND_MAP.has(normalizedSub)) {
    return { kind: 'subcommand', subcommand: normalizedSub, args: rest }
  }

  return { kind: 'general', args: trimmed }
}

/** 在指定 cwd 下执行内置 Impeccable 脚本并返回 stdout/stderr。 */
export function runBundledScript(
  assetDir: string,
  scriptRelPath: string,
  args: string[],
  cwd: string,
  timeoutMs = 20_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const scriptPath = join(assetDir, 'scripts', scriptRelPath)
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [scriptPath, ...args],
      { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) {
          resolvePromise({ exitCode: 0, stdout, stderr })
          return
        }
        const rawCode = (err as { code?: unknown }).code
        const code = typeof rawCode === 'number' ? rawCode : 1
        resolvePromise({ exitCode: code, stdout, stderr: stderr || err.message })
      },
    )
  })
}

/**
 * 预组装 Impeccable 子命令（或通用设计请求）的完整上下文 + 剧本 Prompt，
 * 省去模型在会话里反复调用 skill -> context.mjs -> read reference 的前 3 轮工具开销。
 */
export async function assembleSubcommandPrompt(options: {
  assetDir: string
  cwd: string
  subcommand?: string
  args: string
}): Promise<string> {
  const { assetDir, cwd, subcommand, args } = options
  const normalizedAssetDir = assetDir.split(sep).join('/')

  // 1. 提取首个文件路径参数作为 context.mjs 的 --target（若存在）
  const firstToken = args.trim().split(/\s+/u)[0] ?? ''
  const contextArgs: string[] = []
  if (firstToken && !firstToken.startsWith('-') && (firstToken.includes('/') || firstToken.includes('.'))) {
    contextArgs.push('--target', firstToken)
  }
  const ctxOut = await runBundledScript(assetDir, 'context.mjs', contextArgs, cwd, 10_000)

  // 2. 加载对应的 reference 剧本
  const sections: string[] = []

  if (subcommand && SUBCOMMAND_MAP.has(subcommand)) {
    const meta = SUBCOMMAND_MAP.get(subcommand)!
    sections.push(`# Impeccable Command: \`/impeccable ${subcommand}\`${args ? ` ${args}` : ''}`)
    sections.push(`> Skill Base Directory: \`${normalizedAssetDir}\` (Working Directory: \`${cwd}\`)`)

    const refFile = join(assetDir, 'reference', `${subcommand}.md`)
    if (existsSync(refFile)) {
      const refContent = rewriteImpeccablePaths(readFileSync(refFile, 'utf8'), assetDir)
      sections.push(`## Playbook (${subcommand}.md)\n\n${refContent.trim()}`)
    }

    if (meta.needsCraftFloor) {
      const floorFile = join(assetDir, 'reference', 'craft-floor.md')
      if (existsSync(floorFile)) {
        const floorContent = rewriteImpeccablePaths(readFileSync(floorFile, 'utf8'), assetDir)
        sections.push(`## Craft Floor (craft-floor.md)\n\n${floorContent.trim()}`)
      }
    }
  } else {
    const skillFile = join(assetDir, 'SKILL.md')
    const rawSkill = existsSync(skillFile) ? readFileSync(skillFile, 'utf8') : ''
    const body = rawSkill ? rewriteImpeccablePaths(parseSkillMarkdown(rawSkill, skillFile).content, assetDir) : ''
    sections.push(`# Impeccable Design Request${args ? `: ${args}` : ''}`)
    sections.push(`> Skill Base Directory: \`${normalizedAssetDir}\` (Working Directory: \`${cwd}\`)`)
    if (body) sections.push(body)
    if (!args) {
      const routingFile = join(assetDir, 'reference', 'routing.md')
      if (existsSync(routingFile)) {
        sections.push(rewriteImpeccablePaths(readFileSync(routingFile, 'utf8'), assetDir).trim())
      }
    }
  }

  if (ctxOut.stdout.trim()) {
    sections.push(
      `## Pre-loaded Project Context (\`context.mjs\` output — already executed, do NOT re-run \`context.mjs\`)\n\n\`\`\`\n${ctxOut.stdout.trim()}\n\`\`\``,
    )
  }

  if (args.trim()) {
    sections.push(`## User Target & Instructions\n\n${args.trim()}`)
  }

  return sections.join('\n\n---\n\n')
}

/** 从工具调用参数中提取被修改的文件路径列表。 */
export function extractTouchedFilePaths(toolName: string, rawArgs: unknown, cwd: string): string[] {
  const lower = toolName.toLowerCase()
  const isWriteLike =
    lower === 'write' ||
    lower === 'edit' ||
    lower === 'write_file' ||
    lower === 'edit_file' ||
    lower === 'multi_edit' ||
    lower === 'multiedit' ||
    lower === 'create_file' ||
    lower === 'replace_in_file'
  if (!isWriteLike || typeof rawArgs !== 'object' || rawArgs === null) return []
  const obj = rawArgs as Record<string, unknown>
  const candidates: string[] = []
  for (const key of ['file_path', 'path', 'filePath', 'target_file', 'targetFile', 'Path']) {
    const val = obj[key]
    if (typeof val === 'string' && val.trim()) {
      candidates.push(isAbsolute(val) ? val : resolve(cwd, val))
    }
  }
  return Array.from(new Set(candidates))
}

/** 从 hook.mjs / hook-lib.mjs 的 JSON stdout 中提取 additionalContext 文本。 */
export function unwrapHookAdditionalContext(stdout: string): string | null {
  if (!stdout || !stdout.trim()) return null
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    if (typeof parsed.additionalContext === 'string' && parsed.additionalContext.trim()) {
      return parsed.additionalContext.trim()
    }
    if (typeof parsed.additional_context === 'string' && parsed.additional_context.trim()) {
      return parsed.additional_context.trim()
    }
    const specific = parsed.hookSpecificOutput as Record<string, unknown> | undefined
    if (specific && typeof specific.additionalContext === 'string' && specific.additionalContext.trim()) {
      return specific.additionalContext.trim()
    }
  } catch {
    return null
  }
  return null
}

/** 进程内调用 Impeccable 的 immediate Detector 守卫（对应 PostToolUse）。 */
export async function runImmediateHookOnTool(options: {
  assetDir: string
  cwd: string
  sessionId: string
  toolName: string
  toolArgs: unknown
}): Promise<{ emitted: boolean; contextText: string | null; kind?: string }> {
  const { assetDir, cwd, sessionId, toolName, toolArgs } = options
  const files = extractTouchedFilePaths(toolName, toolArgs, cwd)
  if (files.length === 0) return { emitted: false, contextText: null }

  const hookLibUrl = pathToFileURL(join(assetDir, 'scripts', 'hook-lib.mjs')).href
  const hookLib = (await import(hookLibUrl)) as {
    runHook: (deps: { stdinJson: string; env: Record<string, string>; cwd: string }) => Promise<{
      stdout?: string
      emission?: { kind?: string }
    }>
  }

  const eventPayload = {
    hook_event_name: 'PostToolUse',
    session_id: sessionId,
    cwd,
    tool_name: 'Edit',
    tool_input: {
      file_path: files[0],
      ...(files.length > 1 ? { edits: files.map(f => ({ file_path: f })) } : {}),
    },
  }

  const res = await hookLib.runHook({
    stdinJson: JSON.stringify(eventPayload),
    env: {},
    cwd,
  })
  const kind = res.emission?.kind
  // 在 DSH 中仅当有实质违例（fresh / pending / suppression）时注入提醒，避免 clean ack 浪费上下文
  if (kind === 'clean') {
    return { emitted: false, contextText: null, kind }
  }
  const contextText = unwrapHookAdditionalContext(res.stdout ?? '')
  return { emitted: Boolean(contextText), contextText, ...(kind ? { kind } : {}) }
}

/**
 * 防死循环守卫：记录每个 (sessionId, turn) 是否已触发过 turn-stopping Deep Pass。
 * 确保单回合最多 steer 1 次。
 */
export class TurnStopGuard {
  private readonly fired = new Map<string, number>()

  shouldSkip(sessionId: string, turn: number): boolean {
    return this.fired.get(sessionId) === turn
  }

  markFired(sessionId: string, turn: number): void {
    this.fired.set(sessionId, turn)
    if (this.fired.size > 256) {
      const oldest = this.fired.keys().next().value
      if (oldest !== undefined) this.fired.delete(oldest)
    }
  }

  clearSession(sessionId: string): void {
    this.fired.delete(sessionId)
  }
}

/** 进程内调用 Impeccable 的回合末 Deep Pass 守卫（对应 Stop）。 */
export async function runStopHookOnTurn(options: {
  assetDir: string
  cwd: string
  sessionId: string
  turn: number
  guard: TurnStopGuard
}): Promise<{ emitted: boolean; contextText: string | null }> {
  const { assetDir, cwd, sessionId, turn, guard } = options
  if (guard.shouldSkip(sessionId, turn)) {
    return { emitted: false, contextText: null }
  }

  const hookLibUrl = pathToFileURL(join(assetDir, 'scripts', 'hook-lib.mjs')).href
  const hookLib = (await import(hookLibUrl)) as {
    runStopHook: (deps: { stdinJson: string; env: Record<string, string>; cwd: string }) => Promise<{
      stdout?: string
      emission?: { kind?: string }
    }>
  }

  const eventPayload = {
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd,
    stop_hook_active: false,
  }

  const res = await hookLib.runStopHook({
    stdinJson: JSON.stringify(eventPayload),
    env: {},
    cwd,
  })
  const contextText = unwrapHookAdditionalContext(res.stdout ?? '')
  if (contextText) {
    guard.markFired(sessionId, turn)
    return { emitted: true, contextText }
  }
  return { emitted: false, contextText: null }
}

/** 向上查找最近的 .git 或 PRODUCT.md / DESIGN.md 作为项目根目录。 */
export function findProjectRoot(startCwd: string): string {
  let dir = resolve(startCwd)
  while (true) {
    if (
      existsSync(join(dir, '.git')) ||
      existsSync(join(dir, 'PRODUCT.md')) ||
      existsSync(join(dir, 'DESIGN.md')) ||
      existsSync(join(dir, '.impeccable'))
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(startCwd)
}

const ALLOWED_ROOT_FILES = new Set(['PRODUCT.md', 'DESIGN.md'])
const ALLOWED_IMPECCABLE_FILES = new Set(['design.json', 'config.json', 'config.local.json'])

/**
 * 严格校验可读写的设计物料路径白名单：
 * 仅允许 projectRoot 下的 `PRODUCT.md`、`DESIGN.md`、`.impeccable/design.json`、
 * `.impeccable/config.json`、`.impeccable/config.local.json` 以及 `.impeccable/surfaces/*.md`。
 * 拒绝任何软链接（symlink）或目录穿越。
 */
export function isAllowedArtifactPath(projectRoot: string, candidatePath: string): {
  allowed: boolean
  resolvedPath: string
  relPath: string
  reason?: string
} {
  const root = resolve(projectRoot)
  const resolvedPath = isAbsolute(candidatePath) ? resolve(candidatePath) : resolve(root, candidatePath)
  const rel = relative(root, resolvedPath).split(sep).join('/')

  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return { allowed: false, resolvedPath, relPath: rel, reason: '路径越出项目根目录' }
  }

  const matchesWhitelist =
    ALLOWED_ROOT_FILES.has(rel) ||
    (rel.startsWith('.impeccable/') && ALLOWED_IMPECCABLE_FILES.has(rel.slice('.impeccable/'.length))) ||
    /^\.impeccable\/surfaces\/[a-zA-Z0-9._-]+\.md$/u.test(rel)

  if (!matchesWhitelist) {
    return { allowed: false, resolvedPath, relPath: rel, reason: '路径不在允许的设计物料白名单内' }
  }

  // 检查从 root 到目标路径的每一级是否存在软链接
  const segments = rel.split('/')
  let cur = root
  for (const seg of segments) {
    cur = join(cur, seg)
    if (existsSync(cur)) {
      try {
        const st = lstatSync(cur)
        if (st.isSymbolicLink()) {
          return { allowed: false, resolvedPath, relPath: rel, reason: '拒绝读写符号链接文件或目录' }
        }
        const real = realpathSync(cur)
        const realRoot = existsSync(root) ? realpathSync(root) : root
        if (real !== realRoot && !real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) {
          return { allowed: false, resolvedPath, relPath: rel, reason: '真实路径越出项目根目录' }
        }
      } catch {
        return { allowed: false, resolvedPath, relPath: rel, reason: '无法校验文件状态' }
      }
    }
  }

  return { allowed: true, resolvedPath, relPath: rel }
}

export interface DetectorFindingGroup {
  file: string
  relFile: string
  findings: Array<{
    id: string
    category?: string
    severity?: string
    line?: number
    snippet?: string
    value?: string
    message?: string
    fix?: string
  }>
}

/** 扫描工作区（或指定目标文件/子目录）的 UI 反模式违例。 */
export async function scanWorkspaceAntipatterns(options: {
  assetDir: string
  cwd: string
  target?: string
  maxFiles?: number
}): Promise<{
  projectRoot: string
  scannedFiles: number
  totalFindings: number
  groups: DetectorFindingGroup[]
}> {
  const { assetDir, cwd, target, maxFiles = 60 } = options
  const projectRoot = findProjectRoot(cwd)

  const hookLibUrl = pathToFileURL(join(assetDir, 'scripts', 'hook-lib.mjs')).href
  const detUrl = pathToFileURL(join(assetDir, 'scripts', 'detector', 'detect-antipatterns.mjs')).href

  const hookLib = (await import(hookLibUrl)) as {
    readConfig: (dir: string) => {
      ignoreRules: string[]
      ignoreFiles: string[]
      ignoreValues: unknown[]
      designSystem?: { enabled?: boolean }
    }
    filterFindings: (findings: unknown[], content: string, ext: string, config: unknown) => Array<Record<string, unknown>>
    matchesAnyGlob: (filePath: string, globs: string[]) => boolean
    SENSITIVE_PATH: RegExp
    GENERATED_PATH: RegExp
  }

  const det = (await import(detUrl)) as {
    walkDir: (dir: string, fileList?: string[], depth?: number, maxDepth?: number) => string[]
    detectText: (content: string, filePath: string, opts?: unknown) => Promise<unknown[]> | unknown[]
    detectHtml: (filePath: string, opts?: unknown) => Promise<unknown[]> | unknown[]
    loadDesignSystemForCwd: (dir: string) => unknown
  }

  const config = hookLib.readConfig(projectRoot)
  const designSystem = config.designSystem?.enabled === false ? null : det.loadDesignSystemForCwd(projectRoot)
  const scanOptions = designSystem ? { designSystem } : {}

  let candidateFiles: string[] = []
  if (target && target.trim()) {
    const resolvedTarget = isAbsolute(target) ? resolve(target) : resolve(projectRoot, target)
    if (existsSync(resolvedTarget)) {
      const st = statSync(resolvedTarget)
      if (st.isDirectory()) {
        candidateFiles = det.walkDir(resolvedTarget, [], 0, 6)
      } else if (st.isFile()) {
        candidateFiles = [resolvedTarget]
      }
    }
  } else {
    candidateFiles = det.walkDir(projectRoot, [], 0, 6)
  }

  const groups: DetectorFindingGroup[] = []
  let scannedFiles = 0
  let totalFindings = 0

  for (const filePath of candidateFiles) {
    if (scannedFiles >= maxFiles) break
    if (hookLib.SENSITIVE_PATH.test(filePath) || hookLib.GENERATED_PATH.test(filePath)) continue
    const relFile = relative(projectRoot, filePath).split(sep).join('/')
    if (
      hookLib.matchesAnyGlob(relFile, config.ignoreFiles || []) ||
      hookLib.matchesAnyGlob(filePath, config.ignoreFiles || [])
    ) {
      continue
    }
    let content = ''
    try {
      const st = statSync(filePath)
      if (st.size > 512 * 1024) continue
      content = readFileSync(filePath, 'utf8')
    } catch {
      continue
    }

    scannedFiles += 1
    const ext = extname(filePath).toLowerCase()
    let rawFindings: unknown[] = []
    try {
      if ((ext === '.html' || ext === '.htm') && typeof det.detectHtml === 'function') {
        rawFindings = (await det.detectHtml(filePath, scanOptions)) || []
      } else {
        rawFindings = (await det.detectText(content, filePath, scanOptions)) || []
      }
    } catch {
      rawFindings = []
    }

    const filtered = hookLib.filterFindings(rawFindings, content, ext, config)
    if (filtered.length > 0) {
      const mapped = filtered.map(f => ({
        id: String(f.antipattern ?? f.id ?? f.rule ?? 'unknown'),
        ...(typeof f.category === 'string' ? { category: f.category } : {}),
        ...(typeof f.severity === 'string' ? { severity: f.severity } : {}),
        ...(typeof f.line === 'number' ? { line: f.line } : {}),
        ...(typeof f.snippet === 'string' ? { snippet: f.snippet.slice(0, 160) } : {}),
        ...(typeof f.value === 'string' ? { value: f.value } : {}),
        ...(typeof f.detail === 'string'
          ? { message: f.detail }
          : typeof f.description === 'string'
            ? { message: f.description }
            : typeof f.message === 'string'
              ? { message: f.message }
              : typeof f.why === 'string'
                ? { message: f.why }
                : {}),
        ...(typeof f.fix === 'string' ? { fix: f.fix } : {}),
      }))
      totalFindings += mapped.length
      groups.push({ file: filePath, relFile, findings: mapped })
    }
  }

  return { projectRoot, scannedFiles, totalFindings, groups }
}

export interface ActiveVisualQuestion {
  key: string
  url?: string
  startedAt?: number
  payload: {
    title?: string
    question?: string
    options: Array<{
      id: string
      label: string
      kicker?: string
      lineage?: string
      thesis?: string
      palette?: string[]
      materials?: string[]
      viewport?: string
      case?: string
      risk?: string
      body?: string
      sketch?: string
      hero?: string
      board?: string
    }>
    reroll?: boolean
    canon?: boolean
    canonCard?: Record<string, unknown>
    steer?: boolean
  }
}

/**
 * 探测 `<projectRoot>/.impeccable/questions/` 下是否有正在等待用户回答的视觉方向选择题，
 * 同时顺便刷新 state.json 的 `lastBeat` 心跳，防止后台 `serve-question.mjs --wait` 误判页面关闭。
 */
export function getActiveVisualQuestion(projectRoot: string, touchHeartbeat = true): ActiveVisualQuestion | null {
  const qDir = join(projectRoot, '.impeccable', 'questions')
  if (!existsSync(qDir)) return null
  try {
    const entries = readdirSync(qDir).filter(f => f.endsWith('.state.json')).sort()
    for (const stateName of entries) {
      const key = stateName.slice(0, -'.state.json'.length)
      const statePath = join(qDir, stateName)
      const answerPath = join(qDir, `${key}.answer.json`)
      if (existsSync(answerPath)) continue

      const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
        pid?: number
        url?: string
        startedAt?: number
        lastBeat?: number
      }

      // 检查进程是否存活
      if (typeof state.pid === 'number') {
        try {
          process.kill(state.pid, 0)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EPERM') {
            try { rmSync(statePath) } catch { /* ignore */ }
            continue
          }
        }
      }

      const nextPath = join(qDir, `${key}.next.json`)
      const payloadPath = existsSync(nextPath) ? nextPath : join(qDir, `${key}.payload.json`)
      if (!existsSync(payloadPath)) continue

      const payload = JSON.parse(readFileSync(payloadPath, 'utf8')) as ActiveVisualQuestion['payload']
      if (!payload || !Array.isArray(payload.options)) continue

      if (touchHeartbeat) {
        try {
          state.lastBeat = Date.now()
          writeFileSync(statePath, JSON.stringify(state))
        } catch { /* ignore */ }
      }

      return {
        key,
        ...(state.url ? { url: state.url } : {}),
        ...(state.startedAt ? { startedAt: state.startedAt } : {}),
        payload,
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * 将用户在 DSH Web 面板中点选的视觉方向写入 `<key>.answer.json`，
 * 使 `serve-question.mjs --wait --key <key>` 立即拿到结果并退回 Agent。
 */
export function submitVisualQuestionAnswer(options: {
  projectRoot: string
  key: string
  optionId: string
  steer?: string
}): { ok: boolean; answerFile?: string; error?: string } {
  const { projectRoot, key, optionId, steer = '' } = options
  if (!/^[a-zA-Z0-9_-]+$/u.test(key)) {
    return { ok: false, error: '非法 question key' }
  }
  const qDir = join(projectRoot, '.impeccable', 'questions')
  const statePath = join(qDir, `${key}.state.json`)
  if (!existsSync(statePath)) {
    return { ok: false, error: '该视觉选择任务已结束或不存在' }
  }

  const nextPath = join(qDir, `${key}.next.json`)
  const payloadPath = existsSync(nextPath) ? nextPath : join(qDir, `${key}.payload.json`)
  let chosen: Record<string, unknown> | undefined
  if (existsSync(payloadPath)) {
    try {
      const payload = JSON.parse(readFileSync(payloadPath, 'utf8')) as {
        options?: Array<Record<string, unknown>>
      }
      chosen = payload.options?.find(o => o.id === optionId)
    } catch { /* ignore */ }
  }

  const answerObj: Record<string, unknown> = {
    optionId,
    steer,
    ...(chosen && (chosen.hero || chosen.board) ? { hero: chosen.hero ?? null, board: chosen.board ?? null } : {}),
    ...(chosen && chosen.sketch ? { sketch: chosen.sketch } : {}),
  }

  mkdirSync(qDir, { recursive: true })
  const answerPath = join(qDir, `${key}.answer.json`)
  writeFileSync(answerPath, JSON.stringify(answerObj) + '\n', 'utf8')
  return { ok: true, answerFile: answerPath }
}

export interface CritiqueSnapshotSummary {
  file: string
  slug: string
  timestamp: string
  score: number | null
  p0: number | null
  p1: number | null
  excerpt: string
}

/** 读取 `.impeccable/critique/*.md` 历史评分快照。 */
export function readCritiqueHistory(projectRoot: string): CritiqueSnapshotSummary[] {
  const dir = join(projectRoot, '.impeccable', 'critique')
  if (!existsSync(dir)) return []
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.md') && f !== 'ignore.md')
      .sort()
      .reverse()
      .slice(0, 20)

    return files.map((file) => {
      const raw = readFileSync(join(dir, file), 'utf8')
      const sepIdx = file.indexOf('__')
      const timestamp = sepIdx > 0 ? file.slice(0, sepIdx) : file.replace(/\.md$/u, '')
      const slug = sepIdx > 0 ? file.slice(sepIdx + 2).replace(/\.md$/u, '') : 'default'
      let score: number | null = null
      let p0: number | null = null
      let p1: number | null = null
      let body = raw
      const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
      if (fm && fm[1]) {
        body = raw.slice(fm[0].length).trim()
        for (const line of fm[1].split(/\r?\n/u)) {
          const m = /^([a-zA-Z0-9_]+):\s*(.+)$/u.exec(line.trim())
          if (!m) continue
          const num = Number(m[2])
          if (m[1] === 'score' && Number.isFinite(num)) score = num
          if (m[1] === 'p0' && Number.isFinite(num)) p0 = num
          if (m[1] === 'p1' && Number.isFinite(num)) p1 = num
        }
      }
      return {
        file,
        slug,
        timestamp,
        score,
        p0,
        p1,
        excerpt: body.slice(0, 280),
      }
    })
  } catch {
    return []
  }
}

/** 采集指定工作区的完整 Impeccable 概览数据。 */
export async function collectWorkspaceOverview(options: {
  assetDir: string
  cwd: string
  includeDoctor?: boolean
}): Promise<{
  cwd: string
  projectRoot: string
  artifacts: {
    hasProductMd: boolean
    productMd: string | null
    hasDesignMd: boolean
    designMd: string | null
    hasDesignJson: boolean
    designJson: Record<string, unknown> | null
    projectConfig: Record<string, unknown> | null
    surfaces: Array<{ name: string; relPath: string; title: string; mode: string | null }>
    mocks: Array<{ name: string; relPath: string; approved: boolean; prompt: string | null }>
    critiques: CritiqueSnapshotSummary[]
  }
  doctor: Record<string, unknown> | null
  activeQuestion: ActiveVisualQuestion | null
}> {
  const { assetDir, cwd, includeDoctor = true } = options
  const projectRoot = findProjectRoot(cwd)

  const readSafe = (rel: string): string | null => {
    const check = isAllowedArtifactPath(projectRoot, rel)
    if (!check.allowed || !existsSync(check.resolvedPath)) return null
    try {
      return readFileSync(check.resolvedPath, 'utf8')
    } catch {
      return null
    }
  }

  const productMd = readSafe('PRODUCT.md')
  const designMd = readSafe('DESIGN.md')
  const designJsonRaw = readSafe('.impeccable/design.json')
  let designJson: Record<string, unknown> | null = null
  if (designJsonRaw) {
    try {
      designJson = JSON.parse(designJsonRaw) as Record<string, unknown>
    } catch {
      designJson = null
    }
  }

  const configRaw = readSafe('.impeccable/config.json')
  let projectConfig: Record<string, unknown> | null = null
  if (configRaw) {
    try {
      projectConfig = JSON.parse(configRaw) as Record<string, unknown>
    } catch {
      projectConfig = null
    }
  }

  // Surfaces
  const surfaces: Array<{ name: string; relPath: string; title: string; mode: string | null }> = []
  const surfacesDir = join(projectRoot, '.impeccable', 'surfaces')
  if (existsSync(surfacesDir)) {
    try {
      for (const f of readdirSync(surfacesDir).filter(x => x.endsWith('.md')).sort()) {
        const relPath = `.impeccable/surfaces/${f}`
        const text = readSafe(relPath) ?? ''
        const titleMatch = /^#\s+(.+)$/mu.exec(text)
        const modeMatch = /^mode:\s*(\S+)/imu.exec(text)
        surfaces.push({
          name: basename(f, '.md'),
          relPath,
          title: titleMatch?.[1]?.trim() || basename(f, '.md'),
          mode: modeMatch?.[1]?.trim() || null,
        })
      }
    } catch { /* ignore */ }
  }

  // Mocks
  const mocks: Array<{ name: string; relPath: string; approved: boolean; prompt: string | null }> = []
  const mocksDir = join(projectRoot, '.impeccable', 'mocks')
  if (existsSync(mocksDir)) {
    try {
      const files = readdirSync(mocksDir).filter(f => /\.(png|webp|jpg|jpeg|svg)$/iu.test(f)).sort()
      for (const f of files) {
        const base = f.replace(/\.(png|webp|jpg|jpeg|svg)$/iu, '')
        const sidecarPath = join(mocksDir, `${base}.json`)
        let approved = base.includes('approved')
        let prompt: string | null = null
        if (existsSync(sidecarPath)) {
          try {
            const meta = JSON.parse(readFileSync(sidecarPath, 'utf8')) as Record<string, unknown>
            if (meta.approved === true) approved = true
            if (typeof meta.prompt === 'string') prompt = meta.prompt
          } catch { /* ignore */ }
        }
        mocks.push({
          name: f,
          relPath: `.impeccable/mocks/${f}`,
          approved,
          prompt,
        })
      }
    } catch { /* ignore */ }
  }

  const critiques = readCritiqueHistory(projectRoot)

  let doctor: Record<string, unknown> | null = null
  if (includeDoctor) {
    try {
      const docOut = await runBundledScript(assetDir, 'doctor.mjs', ['--json'], projectRoot, 10_000)
      if (docOut.stdout.trim()) {
        doctor = JSON.parse(docOut.stdout.trim()) as Record<string, unknown>
      }
    } catch {
      doctor = null
    }
  }

  const activeQuestion = getActiveVisualQuestion(projectRoot, true)

  return {
    cwd,
    projectRoot,
    artifacts: {
      hasProductMd: productMd !== null,
      productMd,
      hasDesignMd: designMd !== null,
      designMd,
      hasDesignJson: designJson !== null,
      designJson,
      projectConfig,
      surfaces,
      mocks,
      critiques,
    },
    doctor,
    activeQuestion,
  }
}
