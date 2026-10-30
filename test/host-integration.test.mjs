import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// 在沙盒单测中提供 @deepseek-ai/dsh-llm 的轻量虚拟模块解析
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/dsh-llm') {
    return {
      shortCircuit: true,
      url: 'data:text/javascript,export function createUserMessage(msg) { return { ...msg, _created: true }; }',
    };
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`)

const { apply, name: pluginName } = await import('../lib/index.js')

test('Host 插件集成测试: SkillProvider + 斜杠命令 + 双阶段守卫 + 认证 HTTP 路由', async () => {
  assert.equal(pluginName, 'dsh-impeccable')

  const tmpHome = mkdtempSync(join(tmpdir(), 'dsh-imp-home-'))
  const tmpWs = mkdtempSync(join(tmpdir(), 'dsh-imp-ws-'))
  process.env.DSH_HOME = tmpHome

  try {
    mkdirSync(join(tmpWs, '.git'), { recursive: true })
    writeFileSync(join(tmpWs, 'PRODUCT.md'), '# Test Workspace Product\n', 'utf8')

    const registeredCommands = new Map()
    const registeredRoutes = new Map()
    const eventListeners = new Map()
    const effects = []
    let registeredSkillProvider = null
    const steeredMessages = []

    const mockAgent = {
      id: 'session-test-1',
      steer(msg) {
        steeredMessages.push(msg)
      },
    }

    const mockCtx = {
      logger: {
        warn() {},
        info() {},
        error() {},
      },
      commands: {
        register(def) {
          if (registeredCommands.has(def.name)) {
            throw new Error(`duplicate command: ${def.name}`)
          }
          registeredCommands.set(def.name, def)
          return () => registeredCommands.delete(def.name)
        },
      },
      connection: {
        fetch: {
          register(route) {
            registeredRoutes.set(route.path, route)
            return async () => {
              registeredRoutes.delete(route.path)
            }
          },
        },
      },
      skills: {
        registerProvider(factory) {
          registeredSkillProvider = factory()
          return () => {
            registeredSkillProvider = null
          }
        },
      },
      agents: {
        get(id) {
          return id === 'session-test-1' ? mockAgent : undefined
        },
      },
      workingDirectory: {
        async ensure() {
          return tmpWs
        },
        get() {
          return tmpWs
        },
      },
      workspaceRegistry: {
        list() {
          return [{ id: 'ws-1', title: 'Test WS', path: tmpWs }]
        },
      },
      on(event, fn) {
        eventListeners.set(event, fn)
        return () => eventListeners.delete(event)
      },
      effect(fn) {
        const cleanup = fn()
        if (typeof cleanup === 'function') effects.push(cleanup)
      },
    }

    apply(mockCtx)

    // 1. 验证 SkillProvider 注册与路径重写
    assert.ok(registeredSkillProvider, 'SkillProvider 应当已注册')
    const skillList = await registeredSkillProvider.list()
    assert.equal(skillList.length, 1)
    assert.equal(skillList[0].name, 'impeccable')
    const loadedSkill = await registeredSkillProvider.get(skillList[0])
    assert.ok(!loadedSkill.content.includes('.gemini/skills/impeccable'))

    // 2. 验证宿主只注册顶层 /impeccable，不污染裸 /polish、/critique 等顶层命名空间
    assert.equal(registeredCommands.has('impeccable'), true)
    assert.equal(registeredCommands.has('critique'), false)
    assert.equal(registeredCommands.has('audit'), false)
    assert.equal(registeredCommands.has('polish'), false)
    assert.equal(registeredCommands.has('shape'), false)

    // 3. 验证 /impeccable detect 走 0-Token 即时卡片返回
    const mainCmd = registeredCommands.get('impeccable')
    const detectRes = await mainCmd.handler({
      agent: mockAgent,
      rawInput: 'detect',
      signal: new AbortController().signal,
    })
    assert.equal(detectRes.kind, 'success')
    assert.ok(detectRes.text.includes('Impeccable Detector'))

    // 4. 验证 /impeccable pin bolder 热更新全局 Pin 列表（以 /impeccable bolder 呈现）
    const pinRes = await mainCmd.handler({
      agent: mockAgent,
      rawInput: 'pin bolder',
      signal: new AbortController().signal,
    })
    assert.equal(pinRes.kind, 'success')
    assert.ok(pinRes.text.includes('/impeccable bolder'))
    assert.equal(registeredCommands.has('bolder'), false)

    // 5. 验证 /impeccable critique src/App.tsx 子命令预组装并 steer 给 Agent
    const usedMainCmd = registeredCommands.get('impeccable')
    const critiqueRes = await usedMainCmd.handler({
      agent: mockAgent,
      rawInput: 'critique src/App.tsx',
      signal: new AbortController().signal,
    })
    assert.equal(critiqueRes.kind, 'success')
    assert.equal(steeredMessages.length, 1)
    assert.ok(steeredMessages[0].content[0].text.includes('Playbook (critique.md)'))

    // 6. 验证 HTTP API 路由 (/overview, /artifact, /config, /steer)
    const overviewRoute = registeredRoutes.get('/api/dsh-impeccable/overview')
    assert.ok(overviewRoute)
    const ovResp = await overviewRoute.fetch(
      new Request('http://dsh.local/api/dsh-impeccable/overview?sessionId=session-test-1&doctor=0'),
    )
    assert.equal(ovResp.status, 200)
    const ovJson = await ovResp.json()
    assert.equal(ovJson.ok, true)
    assert.equal(ovJson.projectRoot, tmpWs)
    assert.equal(ovJson.artifacts.hasProductMd, true)

    // 保存与读取 DESIGN.md
    const artifactRoute = registeredRoutes.get('/api/dsh-impeccable/artifact')
    const saveResp = await artifactRoute.fetch(
      new Request('http://dsh.local/api/dsh-impeccable/artifact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd: tmpWs, path: 'DESIGN.md', content: '# My Design System\n' }),
      }),
    )
    assert.equal(saveResp.status, 200)

    const readResp = await artifactRoute.fetch(
      new Request(`http://dsh.local/api/dsh-impeccable/artifact?cwd=${encodeURIComponent(tmpWs)}&path=DESIGN.md`),
    )
    const readJson = await readResp.json()
    assert.equal(readJson.exists, true)
    assert.equal(readJson.content, '# My Design System\n')

    // 7. 验证 tools/post-execute 钩子对违规 UI 文件的即时拦截提醒
    const postExec = eventListeners.get('tools/post-execute')
    assert.ok(postExec)
    const badUiFile = join(tmpWs, 'Slop.css')
    writeFileSync(
      badUiFile,
      '.slop { background: linear-gradient(90deg, #ff00cc, #333399); -webkit-background-clip: text; background-clip: text; color: transparent; }\n',
      'utf8',
    )
    const decision = await postExec(
      { name: 'write', args: { file_path: badUiFile }, agent: mockAgent },
      { isError: false },
      async () => ({ kind: 'accept' }),
    )
    assert.equal(decision.kind, 'accept')
    assert.ok(Array.isArray(decision.additionalContexts))
    assert.equal(decision.additionalContexts.length, 1)

    for (const cleanup of effects) cleanup()
  } finally {
    rmSync(tmpHome, { recursive: true, force: true })
    rmSync(tmpWs, { recursive: true, force: true })
  }
})
