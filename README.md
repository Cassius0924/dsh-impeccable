# dsh-impeccable

[![npm](https://img.shields.io/npm/v/dsh-impeccable?color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-impeccable)
[![license](https://img.shields.io/npm/l/dsh-impeccable?color=blue)](./LICENSE)

将 [Impeccable](https://github.com/pbakaus/impeccable)（v4.0.4）设计套件完整引入 [DSH](https://github.com/deepseek-ai)（DeepSeek Harness），补齐远程与 Web 环境下的四大核心能力：

1. **开箱即用的内置 Skill 与脚本路径自愈（`ctx.skills`）**：内置 Impeccable v4.0.4 的 `SKILL.md`、23 个子命令剧本（`reference/*.md`）与零依赖脚本（`scripts/*.mjs`），并在加载时动态将脚本路径重写为插件真实绝对路径，支持项目级 `.dsh/skills/impeccable` 覆盖。
2. **DSH 原生双阶段 UI 反模式守卫（`tools/post-execute` + `agent/turn-stopping`）**：
   - **改文件即时检查**：Agent 调用 `write`/`edit` 修改 `.tsx/.jsx/.css/.html/.vue/.svelte` 等 UI 文件后，进程内运行毫秒级 immediate 规则扫描，将 AI 俗套渐变、滥用字体、低对比度及 `design.json` Token 漂移随工具结果（`additionalContexts`）返回给模型当场自修。
   - **回合末深度兜底**：回合结束前运行全量规则去重扫描，若有漏网违例则单次 `steer` 提醒模型补修（内置 `TurnStopGuard` 单回合防死循环锁）。
3. **混合加速斜杠命令与热 Pin（`ctx.commands`）**：
   - 注册 `/impeccable` 主命令，并默认预 Pin `/critique`、`/audit`、`/polish`、`/shape` 四个高频顶层命令（支持在设置页随时勾选其余 18 个子命令，保存即刻热生效，无需重启 DSH）。
   - **0-Token 即时卡片诊断**：`/impeccable doctor [--fix]`、`/impeccable detect [target]`、`/impeccable hooks ...`、`/impeccable pin|unpin <cmd>` 直接在 Host 执行并秒级回显结果，不消耗大模型 Token。
   - **LLM 设计子命令预组装加速**：执行 `/critique`、`/polish`、`/audit` 等设计子命令时，Host 先自动运行 `context.mjs` 并拼好对应的 `reference/<cmd>.md` 与 `craft-floor.md` 剧本，一次性 `steer` 给模型，省去前 3 轮工具往返开销。
4. **DSH Web 视觉工作台面板（`conversation.view` + `settings.section`）**：
   - **会话顶栏「设计 / Design」Tab**：包含 **视觉规范画板**（渲染 `design.json` 的 North Star、OKLCH 8 阶色板色卡复制、排版/阴影/动效 Token、组件标本 HTML/CSS 沙盒预览、`mocks/` 视觉稿）、**体检与守卫**（Doctor 漂移自动修复、Detector 全量扫描与一键忽略/一键派发 Agent 修复、Critique 历史评分趋势）、**物料文档编辑**（在线编辑/预览 `PRODUCT.md` / `DESIGN.md` / `.impeccable/surfaces/*.md`）与 **动作发射台**（22 个子命令卡片一键派发），并原生代理 `serve-question.mjs` 的远程可视化方向选择卡片。
   - **设置页「Impeccable 设计」分区**：集中管理全局守卫开关、顶栏 Tab 显隐与 22 个子命令的 `/` 菜单热 Pin 矩阵。

## 安装

```sh
dsh plugin --profile web add dsh-impeccable
```

已验证宿主版本：`0.2.1-rc.3`。

## 配置

1. **全局配置**：`$DSH_HOME/impeccable.json`（默认 `~/.dsh/impeccable.json`），可在 Web 设置页或手改文件修改（支持文件监听热重载）：
   ```json
   {
     "hookEnabled": true,
     "stopDeepPass": true,
     "showConversationTab": true,
     "pinnedCommands": ["critique", "audit", "polish", "shape"]
   }
   ```
2. **项目级配置**：`<workspace>/.impeccable/config.json`，100% 兼容 Impeccable 原生 schema（`hook.enabled`、`detector.ignoreRules`、`detector.ignoreFiles`、`detector.ignoreValues`）。

## 开发与测试

```sh
pnpm install && pnpm build && pnpm test
```

## License

MIT（内置 Impeccable 资产遵循上游 Apache-2.0 协议）。
