# GOAL: dsh-impeccable 插件

将 [Impeccable](https://github.com/pbakaus/impeccable)（v4.0.4）完整引入 DeepSeek Harness（DSH），补齐其在 DSH 与远程 Web 环境下的四大断层：**内置 Skill 资产与脚本路径自愈 + DSH 原生双阶段 UI 反模式守卫（Detector Hook） + 混合加速斜杠命令与热 Pin + DSH Web 视觉工作台面板（会话顶栏「设计」Tab + 设置页全局分区 + `serve-question` 远程代理）**。

## 运行环境事实

- 宿主：`0.2.1-rc.3`，from-source：`/opt/deepseek-harness`（**严禁改动该工作树**）
- Profile：`~/.dsh/profiles/web`（`package.json` + `cordis.patch.yml`）
- 现有同仓库参考实现：
  - `dsh-slash-command`：`/data/root/cassdev/dsh-slash-command`（`ctx.commands.register`、`ctx.connection.fetch.register`、`settings.section`、esbuild 构建脚本）
  - `dsh-usage-dashboard`：`/data/root/cassdev/dsh-usage-dashboard`（`conversation.view` 会话顶栏 Tab 挂载）
  - `dsh-agents-desk`：`/data/root/cassdev/dsh-agents-desk`（工作区扫描、版本令牌保护文件读写、`.impeccable/design.json` 真实样本）
- Impeccable v4.0.4 源资产：`/root/.gemini/skills/impeccable`（`SKILL.md`、`reference/*.md`、`scripts/**`）

## 配置分层（唯一真实来源）

1. **全局配置**：`$DSH_HOME/impeccable.json`（默认 `~/.dsh/impeccable.json`）
   ```json
   {
     "hookEnabled": true,
     "stopDeepPass": true,
     "showConversationTab": true,
     "pinnedCommands": ["critique", "audit", "polish", "shape"]
   }
   ```
   - `hookEnabled`（布尔，默认 `true`）：全局是否启用 DSH 原生 Detector 守卫钩子。
   - `stopDeepPass`（布尔，默认 `true`）：是否在 `agent/turn-stopping` 执行回合末全量去重深度扫描。
   - `showConversationTab`（布尔，默认 `true`）：是否在会话顶栏展示「设计 / Design」视图 Tab。
   - `pinnedCommands`（字符串数组，默认 `["critique", "audit", "polish", "shape"]`）：除主命令 `/impeccable` 外，额外热注册为顶层 `/<cmd>` 的 Impeccable 子命令。
2. **项目级配置**：`<workspace>/.impeccable/config.json`
   - 100% 遵循 Impeccable 原生 schema（`hook.enabled`、`detector.ignoreRules`、`detector.ignoreFiles`、`detector.ignoreValues`、`detector.designSystem`）。

## 核心功能规格

### 1. 内置 Skill 资产与动态路径重写（`ctx.skills`）
- 将 Impeccable v4.0.4 的 `SKILL.md`、`reference/`、`scripts/` 完整打包在插件 `assets/impeccable/` 下。
- 通过 `ctx.skills.registerProvider` 注册 `dsh-impeccable` Provider（`rank: BUNDLED_SKILL_RANK = 600`，允许用户在项目 `.dsh/skills/impeccable` 或 `.agents/skills/impeccable` 覆盖）。
- `provider.get()` 加载正文时，将 `.gemini/skills/impeccable` 与 `<skill-base-dir>` 动态重写为插件 `assets/impeccable` 的真实绝对路径，确保模型在任意工作区直接执行 `node <abs>/scripts/context.mjs` 等脚本均不会找不到文件。

### 2. DSH 原生双阶段 Detector 守卫（`tools/post-execute` + `agent/turn-stopping`）
- **阶段一（改文件即时检查）**：监听 `tools/post-execute`，当工具名为 `write` / `edit`（或含 `file_path` / `path` 的 UI 文件写入）且目标文件属于 UI 后缀时，进程内调用 `hook-lib.mjs` 的 `runHook`。若产生新违例提醒，将其封装为 `createUserMessage` 追加到 `result.additionalContexts`，随工具结果零延迟返回给模型。
- **阶段二（回合末全量兜底）**：监听 `agent/turn-stopping`，当本回合触碰过 UI 文件且 `stopDeepPass` 开启时，调用 `runStopHook`（传入防重入标记 `stop_hook_active`）。若发现未处理的深层违例，通过 `agent.steer(...)` 单次提醒模型修复（每个会话每回合最多触发 1 次，杜绝死循环）。

### 3. 斜杠命令混合加速与热 Pin（`ctx.commands`）
- 始终注册 `/impeccable [subcommand] [target]`，并根据全局配置 `pinnedCommands` 动态热注册顶层 `/<subcmd> [target]`（重名冲突捕获 warn 跳过，修改配置即刻热重载，无需重启 DSH）。
- **0-Token 即时诊断命令**：
  - `/impeccable doctor [--fix]`：在 Host 直接调用 `doctor.mjs` 并在命令卡片回显健康度与漂移诊断。
  - `/impeccable detect [target]`：在 Host 直接调用 Detector 扫描指定文件或工作区 UI 文件，在卡片直接列出违例行号与规则 ID。
  - `/impeccable hooks [status|on|off|ignore-rule|ignore-file|ignore-value|reset] ...`：直接调用 `hook-admin.mjs` 修改项目 `.impeccable/config.json` 并回显结果。
  - `/impeccable pin <cmd>` / `/impeccable unpin <cmd>`：直接更新全局 `$DSH_HOME/impeccable.json` 的 `pinnedCommands` 并即时热生效。
- **LLM 设计子命令预组装加速**：
  - 对 `critique`、`audit`、`polish`、`shape`、`init`、`document`、`extract`、`bolder`、`quieter`、`distill`、`harden`、`onboard`、`animate`、`colorize`、`typeset`、`layout`、`delight`、`overdrive`、`clarify`、`adapt`、`optimize`、`live` 等子命令：Host 先在目标工作区运行 `context.mjs`，读取对应的 `reference/<cmd>.md`（及编辑类的 `craft-floor.md`），连同脚本绝对路径指引一次性组装成结构化 Prompt，`agent.steer` 给当前会话。

### 4. Host 认证 API（`ctx.connection.fetch.register`）
所有接口均挂载在 `/api/dsh-impeccable/*` 认证栅栏内：
- `GET /api/dsh-impeccable/overview?sessionId=...&cwd=...`：解析会话或指定工作区的 `projectRoot`，返回：
  - 工作区列表、当前 `cwd` / `projectRoot`
  - 全局配置（`impeccable.json`）与项目配置（`.impeccable/config.json`）
  - 物料概览：`PRODUCT.md`、`DESIGN.md`、`.impeccable/design.json`（完整解析对象）、`.impeccable/surfaces/*.md` 列表、`.impeccable/mocks/*` 列表、`.impeccable/critique/*` 历史评分趋势
  - `doctor` 体检结果摘要
  - 当前活跃的 `serve-question` 视觉方向选择任务（若有）
- `POST /api/dsh-impeccable/config`：保存全局配置 `impeccable.json`（触发命令热重载）或项目级 `.impeccable/config.json`（如增删 `ignoreRules` / `ignoreFiles` / `ignoreValues` / `hook.enabled`）。
- `POST /api/dsh-impeccable/scan`：对当前工作区（或指定文件）执行 Detector 静态扫描，返回分组违例详情，供面板展示、一键忽略或一键 Steer 修复。
- `POST /api/dsh-impeccable/doctor`：运行 `doctor.mjs`（支持 `fix: true` 自动修复 `auto` 级漂移）。
- `GET / POST /api/dsh-impeccable/artifact`：读取或保存工作区内的受控设计物料文件（仅限白名单：`PRODUCT.md`、`DESIGN.md`、`.impeccable/design.json`、`.impeccable/config.json`、`.impeccable/surfaces/*.md`），拒绝软链越界。
- `POST /api/dsh-impeccable/steer`：从 Web 面板向指定 `sessionId` 的 Agent 发送预组装的 Impeccable 子命令或 Detector 修复指令。
- `GET /api/dsh-impeccable/asset?cwd=...&path=...`：安全读取 `.impeccable/mocks/*` 或 `.impeccable/sketches/*` 图片供面板预览。
- `POST /api/dsh-impeccable/question/answer`：将用户在 Web 面板选择的视觉方向（或 Re-roll / Canon）写回 `.impeccable/questions/<key>.answer.json`，完成 `serve-question.mjs` 闭环。

### 5. Client Web 视觉面板（`conversation.view` + `settings.section`）
- **会话顶栏「设计 / Design」Tab（`conversation.view`）**：
  - 顶部栏：工作区选择器（自动跟随当前会话 `sessionId` 的工作区，也可切换其他工作区）、健康状态徽章、刷新按钮。
  - 若当前工作区有活跃的 `serve-question` 视觉方向选择任务，置顶展示 **Visual Direction Picker（方向选择画板）**：渲染各方向的 Thesis、OKLCH 色板胶囊、材质标签、草图/灵感图，支持一键选择、Re-roll 或 Canon。
  - **4 个核心子视图（Sub-tabs）**：
    1. **Design System（视觉规范画板）**：展示 `design.json` 的 North Star 与 Overview、Do's & Don'ts、OKLCH 色阶色卡（点击复制色值）、Typography / Shadows / Motion / Breakpoints Token 表、`components` 组件标本实时沙盒预览、以及 `mocks/` 视觉稿画廊；若未建档则展示引导卡一键触发 `init` / `document`。
    2. **Doctor & Detector（体检与守卫）**：展示 Doctor 漂移诊断（含一键 Auto-Fix）+ Detector 全项目扫描结果（按文件分组展示行号、规则 ID、修复建议，每项支持「忽略该规则/该文件」或「发给 Agent 修复」）+ `.impeccable/critique/` 历史评分趋势列表。
    3. **Artifacts（物料文档编辑）**：切换查看与在线编辑 `PRODUCT.md`、`DESIGN.md`、`.impeccable/surfaces/*.md`（支持 Edit / Preview 切换与一键新建 Surface 契约）。
    4. **Launchpad（动作发射台）**：按 Build / Evaluate / Refine / Enhance / Fix 分类展示 22 个子命令卡片，支持填写目标路径（`--target`）与补充要求，一键 Steer 到当前会话。
- **设置页分区（`settings.section`）**：
  - 管理全局 Detector 守卫开关、回合末 Deep Pass 开关、会话顶栏「设计」Tab 显隐开关，以及 22 个子命令的顶层 `/` 菜单 Pin 勾选矩阵（保存即刻热生效）。
- 全程双语字典（`zh` / `en`），样式隔离在 `.dsh-imp-*` 命名空间下，严格复用宿主 `--dsw-*` 主题变量适配亮色/暗色模式。

## 验收标准

1. `pnpm install && pnpm build` 产出 `lib/index.js`、`lib/core.js`、`lib/client.js` 及类型声明。
2. `pnpm test`（`node --test test/*.mjs`）覆盖：
   - 全局配置与项目配置校验/合并
   - Skill 正文加载与脚本绝对路径动态重写
   - Detector 即时守卫与回合末 Deep Pass 桥接（含单回合防死循环锁）
   - 斜杠命令参数解析、0-Token 诊断分支与 LLM 预组装 Prompt 生成
   - 受控设计物料文件路径白名单校验与防越界保护
   - `serve-question` 状态探测与答题回写闭环
3. 安装到本机 `web` profile 并验证（重启前先检查无 running 会话）。
