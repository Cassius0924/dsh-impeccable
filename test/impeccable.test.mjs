import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assembleSubcommandPrompt,
  collectWorkspaceOverview,
  DEFAULT_GLOBAL_CONFIG,
  extractTouchedFilePaths,
  getActiveVisualQuestion,
  isAllowedArtifactPath,
  parseCommandInvocation,
  parseSkillMarkdown,
  resolveDefaultAssetRoot,
  rewriteImpeccablePaths,
  runImmediateHookOnTool,
  runStopHookOnTurn,
  scanWorkspaceAntipatterns,
  submitVisualQuestionAnswer,
  TurnStopGuard,
  validateGlobalConfig,
  runBundledScript,
} from '../lib/core.js'

test('validateGlobalConfig: 默认值、去重与非法字段拦截', () => {
  const emptyRes = validateGlobalConfig({})
  assert.equal(emptyRes.ok, true)
  if (emptyRes.ok) {
    assert.deepEqual(emptyRes.value, DEFAULT_GLOBAL_CONFIG)
  }

  const dedupRes = validateGlobalConfig({
    hookEnabled: false,
    stopDeepPass: false,
    showConversationTab: true,
    pinnedCommands: ['critique', 'polish', 'critique', 'audit'],
  })
  assert.equal(dedupRes.ok, true)
  if (dedupRes.ok) {
    assert.deepEqual(dedupRes.value.pinnedCommands, ['critique', 'polish', 'audit'])
    assert.equal(dedupRes.value.hookEnabled, false)
  }

  const badRes = validateGlobalConfig({
    hookEnabled: 'yes',
    pinnedCommands: ['critique', 'not-a-valid-cmd'],
  })
  assert.equal(badRes.ok, false)
  if (!badRes.ok) {
    assert.equal(badRes.errors.length, 2)
  }
})

test('parseSkillMarkdown & rewriteImpeccablePaths: 解析内置 SKILL.md 并重写脚本绝对路径', () => {
  const assetDir = resolveDefaultAssetRoot()
  const raw = readFileSync(join(assetDir, 'SKILL.md'), 'utf8')
  const parsed = parseSkillMarkdown(raw, 'SKILL.md')
  assert.equal(parsed.name, 'impeccable')
  assert.ok(parsed.description.includes('frontend interface'))
  assert.ok(parsed.content.includes('context.mjs'))

  const rewritten = rewriteImpeccablePaths(parsed.content, '/custom/abs/impeccable')
  assert.ok(!rewritten.includes('.gemini/skills/impeccable'))
  assert.ok(!rewritten.includes('<skill-base-dir>'))
  assert.ok(rewritten.includes('/custom/abs/impeccable/scripts/context.mjs'))
})

test('parseCommandInvocation: 区分 0-Token 诊断命令、Pin/Unpin 与 LLM 设计子命令', () => {
  assert.deepEqual(parseCommandInvocation('doctor --fix --target packages/web'), {
    kind: 'doctor',
    fix: true,
    target: 'packages/web',
  })
  assert.deepEqual(parseCommandInvocation('detect src/App.tsx'), {
    kind: 'detect',
    target: 'src/App.tsx',
  })
  assert.deepEqual(parseCommandInvocation('hooks ignore-rule overused-font'), {
    kind: 'hooks',
    argv: ['ignore-rule', 'overused-font'],
  })
  assert.deepEqual(parseCommandInvocation('pin bolder'), {
    kind: 'pin',
    subcommand: 'bolder',
  })
  assert.deepEqual(parseCommandInvocation('unpin audit'), {
    kind: 'unpin',
    subcommand: 'audit',
  })
  assert.deepEqual(parseCommandInvocation('critique src/Header.tsx 重点看移动端'), {
    kind: 'subcommand',
    subcommand: 'critique',
    args: 'src/Header.tsx 重点看移动端',
  })
  assert.deepEqual(parseCommandInvocation('teach'), {
    kind: 'subcommand',
    subcommand: 'init',
    args: '',
  })
  assert.deepEqual(parseCommandInvocation('src/Button.tsx', 'polish'), {
    kind: 'subcommand',
    subcommand: 'polish',
    args: 'src/Button.tsx',
  })
})

test('assembleSubcommandPrompt: 预跑 context.mjs 并拼装对应 reference 与 craft-floor', async () => {
  const assetDir = resolveDefaultAssetRoot()
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-imp-prompt-'))
  try {
    mkdirSync(join(tmp, '.git'), { recursive: true })
    writeFileSync(join(tmp, 'PRODUCT.md'), '# Test Product\n\n- Platform: web\n', 'utf8')
    const prompt = await assembleSubcommandPrompt({
      assetDir,
      cwd: tmp,
      subcommand: 'polish',
      args: 'src/App.tsx',
    })
    assert.ok(prompt.includes('# Impeccable Command: `/impeccable polish` src/App.tsx'))
    assert.ok(prompt.includes('## Playbook (polish.md)'))
    assert.ok(prompt.includes('## Craft Floor (craft-floor.md)'))
    assert.ok(prompt.includes('Pre-loaded Project Context'))
    assert.ok(!prompt.includes('.gemini/skills/impeccable'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('isAllowedArtifactPath: 严格白名单与防符号链接越界', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-imp-path-'))
  const outside = mkdtempSync(join(tmpdir(), 'dsh-imp-outside-'))
  try {
    assert.equal(isAllowedArtifactPath(tmp, 'PRODUCT.md').allowed, true)
    assert.equal(isAllowedArtifactPath(tmp, 'DESIGN.md').allowed, true)
    assert.equal(isAllowedArtifactPath(tmp, '.impeccable/design.json').allowed, true)
    assert.equal(isAllowedArtifactPath(tmp, '.impeccable/config.json').allowed, true)
    assert.equal(isAllowedArtifactPath(tmp, '.impeccable/surfaces/main-dashboard.md').allowed, true)

    assert.equal(isAllowedArtifactPath(tmp, '../secret.txt').allowed, false)
    assert.equal(isAllowedArtifactPath(tmp, 'src/index.ts').allowed, false)
    assert.equal(isAllowedArtifactPath(tmp, '.env').allowed, false)

    // 符号链接攻击拦截
    const secretFile = join(outside, 'secret.md')
    writeFileSync(secretFile, 'top-secret', 'utf8')
    symlinkSync(secretFile, join(tmp, 'DESIGN.md'))
    const symCheck = isAllowedArtifactPath(tmp, 'DESIGN.md')
    assert.equal(symCheck.allowed, false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('Detector 双阶段守卫与静态扫描: immediate post-execute + TurnStopGuard 防死循环', async () => {
  const assetDir = resolveDefaultAssetRoot()
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-imp-hook-'))
  try {
    mkdirSync(join(tmp, '.git'), { recursive: true })
    const badCssFile = join(tmp, 'BadCard.css')
    // 构造触发 immediate-tier 规则（gradient-text: background-clip: text + color: transparent）的样式
    writeFileSync(
      badCssFile,
      [
        '.hero-title {',
        '  background: linear-gradient(90deg, #ff00cc, #333399);',
        '  -webkit-background-clip: text;',
        '  background-clip: text;',
        '  color: transparent;',
        '  font-size: 9px;',
        '}',
      ].join('\n'),
      'utf8',
    )

    const touched = extractTouchedFilePaths('write', { file_path: 'BadCard.css' }, tmp)
    assert.deepEqual(touched, [badCssFile])

    // 1. 工作区扫描能够检出违例
    const scan = await scanWorkspaceAntipatterns({ assetDir, cwd: tmp })
    assert.ok(scan.scannedFiles >= 1)
    assert.ok(scan.totalFindings >= 1)

    // 2. Immediate Hook 在 write 工具调用后返回 additionalContext
    const imm = await runImmediateHookOnTool({
      assetDir,
      cwd: tmp,
      sessionId: 'test-session-1',
      toolName: 'write',
      toolArgs: { file_path: badCssFile },
    })
    assert.equal(imm.emitted, true)
    assert.ok(imm.contextText && imm.contextText.length > 0)

    // 3. TurnStopGuard 防死循环校验
    const guard = new TurnStopGuard()
    assert.equal(guard.shouldSkip('test-session-1', 1), false)
    guard.markFired('test-session-1', 1)
    assert.equal(guard.shouldSkip('test-session-1', 1), true)
    assert.equal(guard.shouldSkip('test-session-1', 2), false)

    const skippedStop = await runStopHookOnTurn({
      assetDir,
      cwd: tmp,
      sessionId: 'test-session-1',
      turn: 1,
      guard,
    })
    assert.equal(skippedStop.emitted, false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('serve-question 远程代理与 collectWorkspaceOverview 闭环', async () => {
  const assetDir = resolveDefaultAssetRoot()
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-imp-overview-'))
  try {
    mkdirSync(join(tmp, '.git'), { recursive: true })
    mkdirSync(join(tmp, '.impeccable', 'questions'), { recursive: true })
    mkdirSync(join(tmp, '.impeccable', 'surfaces'), { recursive: true })
    writeFileSync(join(tmp, 'PRODUCT.md'), '# Demo Product\n', 'utf8')
    writeFileSync(
      join(tmp, '.impeccable', 'design.json'),
      JSON.stringify({ schemaVersion: 2, title: 'Demo System', narrative: { northStar: 'Crisp Craft' } }),
      'utf8',
    )
    writeFileSync(
      join(tmp, '.impeccable', 'surfaces', 'home.md'),
      '---\nmode: Persuade\n---\n\n# Home Surface\n',
      'utf8',
    )

    // 模拟一个活跃的 serve-question 任务（使用当前存活 pid）
    const qKey = 'demo1234'
    writeFileSync(
      join(tmp, '.impeccable', 'questions', `${qKey}.state.json`),
      JSON.stringify({ pid: process.pid, port: 49999, url: 'http://127.0.0.1:49999/' }),
      'utf8',
    )
    writeFileSync(
      join(tmp, '.impeccable', 'questions', `${qKey}.payload.json`),
      JSON.stringify({
        title: 'Choose the visual world',
        options: [
          { id: 'swiss-grid', label: 'Swiss Grid', palette: ['#111111', '#ff3300'], sketch: '.impeccable/sketches/swiss.webp' },
        ],
        reroll: true,
        canon: true,
        steer: true,
      }),
      'utf8',
    )

    const overview = await collectWorkspaceOverview({ assetDir, cwd: tmp, includeDoctor: false })
    assert.equal(overview.artifacts.hasProductMd, true)
    assert.equal(overview.artifacts.hasDesignJson, true)
    assert.equal(overview.artifacts.surfaces.length, 1)
    assert.equal(overview.activeQuestion?.key, qKey)
    assert.equal(overview.activeQuestion?.payload.options[0]?.id, 'swiss-grid')

    // 提交选择后应生成 .answer.json，且 activeQuestion 变为空
    const ans = submitVisualQuestionAnswer({
      projectRoot: tmp,
      key: qKey,
      optionId: 'swiss-grid',
      steer: 'Keep borders 1px solid',
    })
    assert.equal(ans.ok, true)
    const writtenAnswer = JSON.parse(
      readFileSync(join(tmp, '.impeccable', 'questions', `${qKey}.answer.json`), 'utf8'),
    )
    assert.equal(writtenAnswer.optionId, 'swiss-grid')
    assert.equal(writtenAnswer.steer, 'Keep borders 1px solid')
    assert.equal(writtenAnswer.sketch, '.impeccable/sketches/swiss.webp')
    assert.equal(getActiveVisualQuestion(tmp), null)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('hook-admin.mjs 与 doctor.mjs 脚本联动: 忽略规则写入 .impeccable/config.json 后扫描生效', async () => {
  const assetDir = resolveDefaultAssetRoot()
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-imp-admin-'))
  try {
    mkdirSync(join(tmp, '.git'), { recursive: true })
    writeFileSync(
      join(tmp, 'Tiny.css'),
      [
        '.hero {',
        '  background: linear-gradient(90deg, #ff00cc, #333399);',
        '  -webkit-background-clip: text;',
        '  background-clip: text;',
        '  color: transparent;',
        '}',
      ].join('\n'),
      'utf8',
    )

    const beforeScan = await scanWorkspaceAntipatterns({ assetDir, cwd: tmp })
    const rulesFound = beforeScan.groups.flatMap(g => g.findings.map(f => f.id))
    assert.ok(rulesFound.length >= 1)
    const firstRule = rulesFound[0]

    // 通过 hook-admin.mjs 忽略该规则
    const adminOut = await runBundledScript(assetDir, 'hook-admin.mjs', ['ignore-rule', firstRule], tmp)
    assert.equal(adminOut.exitCode, 0)

    const afterScan = await scanWorkspaceAntipatterns({ assetDir, cwd: tmp })
    const afterRules = afterScan.groups.flatMap(g => g.findings.map(f => f.id))
    assert.ok(!afterRules.includes(firstRule))

    // 运行 doctor.mjs --json
    const docOut = await runBundledScript(assetDir, 'doctor.mjs', ['--json'], tmp)
    assert.equal(docOut.exitCode, 0)
    const docJson = JSON.parse(docOut.stdout.trim())
    assert.equal(typeof docJson, 'object')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

