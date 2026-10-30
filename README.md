# dsh-impeccable

[![npm](https://img.shields.io/npm/v/dsh-impeccable?color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-impeccable)
[![license](https://img.shields.io/npm/l/dsh-impeccable?color=blue)](./LICENSE)

把 [Impeccable](https://github.com/pbakaus/impeccable)（v4.0.4）全套前端视觉设计体系深度集成进 [DSH](https://github.com/deepseek-ai)（DeepSeek Harness）：**内置 23 个设计剧本与工具链、原生双阶段 UI 反模式守卫、0-Token 诊断与预组装斜杠命令、以及会话顶栏「设计」可视化工作台**。

---

## 为什么需要做成 DSH 插件

如果只把 Impeccable 当作静态 `SKILL.md` 放进 `.dsh/skills/`，在 DSH 尤其是远程服务器 + Web GUI 场景下会遇到四处断层：

| 痛点 | 只装静态 Skill | 装上 `dsh-impeccable` 插件 |
|---|---|---|
| **安装与脚本路径** | 每个工作区都要手动拷文件；`SKILL.md` 里写死 `.gemini/skills/impeccable/scripts/...` 经常找不到脚本 | 随插件内置 Impeccable v4.0.4 资产，注册到 `ctx.skills` 并**动态把脚本路径重写为真实绝对路径**，装完即用 |
| **UI 反模式自动拦截** | Impeccable 的 `post-file.mjs` / `stop.mjs` 只认 Claude Code / Cursor 钩子协议，在 DSH 里完全静默 | 原生桥接 DSH `tools/post-execute` 与 `agent/turn-stopping`，**改完 UI 文件当场报出 AI 俗套配色与 Token 漂移** |
| **命令开销与反馈速度** | 每次敲命令都要模型先跑 2–3 轮工具去读 `context.mjs`、`reference/*.md`；跑个 `doctor` 也要烧 Token | **0-Token 即时卡片**跑 `doctor` / `detect` / `hooks`；LLM 设计命令由 **Host 预跑 `context.mjs` 并拼好剧本一次性送达** |
| **远程 Web 可视化与交互** | `design.json` 色板、组件标本、反模式报告全是冷冰冰的 JSON；`serve-question.mjs` 在服务端 `open` 浏览器导致远程用户根本点不到 | 会话顶栏新增**「设计」Tab**，可视化渲染 OKLCH 8 阶色板、组件沙盒、体检修复台，并**将视觉方向选择题直接代理进 Web 面板** |

---

## 四大核心能力

### 1. 内置 Impeccable v4.0.4 技能包与路径自愈（`ctx.skills`）

- 插件随包内置完整 Impeccable v4.0.4 资产（`SKILL.md`、23 份 `reference/*.md` 专项剧本、`scripts/**` 零依赖检测/色阶/体检工具链）。
- Host 启动时在 `ctx.skills` 上以 `BUNDLED_SKILL_RANK = 600` 注册 `SkillProvider`：
  - **开箱即用**：任何工作区无需手工初始化即可直接调用 `impeccable` 技能。
  - **支持项目级覆盖**：若工作区 `.dsh/skills/impeccable`（rank 200）或用户级 `~/.dsh/skills/impeccable`（rank 400）存在同名技能，自动按 DSH 优先级让位给用户自定义版本。
  - **脚本路径自愈**：读取 `SKILL.md` 与 `reference/*.md` 时，自动将文档中的 `.gemini/skills/impeccable`、`<skill-base-dir>` 等占位符重写为插件内置 `assets/impeccable` 的真实绝对路径。

### 2. DSH 原生双阶段 UI 反模式守卫（Detector Hook）

无需配置外部 Shell Hook，插件直接在 DSH 生命周期内运行双阶段 UI 质量守卫（可在设置页或命令行随时开关）：

- **第一阶段：改文件即时轻检（`tools/post-execute`）**
  - 当 Agent 调用 `write`、`edit`、`multi_edit` 等工具修改 `.tsx` / `.jsx` / `.html` / `.css` / `.scss` / `.vue` / `.svelte` 文件时，自动运行 Impeccable `runImmediateCheck`。
  - 毫秒级检测 AI 典型俗套设计（紫蓝渐变、滥用字体、违规边框、对比度不足）以及与项目 `.impeccable/design.json` 的 Token 漂移。
  - 发现违例时，通过 `PostToolDecision.additionalContexts` 将修复建议随工具结果一并返回给模型，让模型在当前思考链内顺手修好，不打断工作流。
- **第二阶段：回合结束深度扫描兜底（`agent/turn-stopping`）**
  - 当本回合改过 UI 文件且准备收尾时，自动触发 `runStopCheck` 全量规则去重扫描（利用 `.impeccable/.hook-seen.json` 跳过第一阶段已报过的同位置问题）。
  - 若仍有漏网问题，自动通过 `agent.steer(...)` 注入一次汇总修复提醒；内置 `TurnStopGuard` **严格限制每个回合最多拦截 1 次**，绝不产生死循环。

### 3. 混合加速斜杠命令与热 Pin（`ctx.commands` + `ctx.inputTriggers`）

插件始终注册主命令 `/impeccable`，并默认将最常用的 4 个子命令 Pin 到 `/` 菜单：`/impeccable critique`、`/impeccable audit`、`/impeccable polish`、`/impeccable shape`（可在设置页或用 `/impeccable pin <cmd>` 随时把其余子命令固定为 `/impeccable <cmd>` 快捷命令 chip，**保存即刻热生效，无需重启 DSH**）。

#### 0-Token 宿主即时命令（不调用模型、不耗 Token）

| 命令 | 作用 |
|---|---|
| `/impeccable doctor [--fix]` | 运行 `doctor.mjs`，检查 `PRODUCT.md` / `DESIGN.md` / `design.json` 漂移与过时配置，`--fix` 一键修复 |
| `/impeccable detect [target]` | 运行静态 UI 反模式与 Token 漂移扫描，直接在会话内回显违例文件、行号与修复建议 |
| `/impeccable hooks [status\|enable\|disable\|ignore-rule <id>\|ignore-file <glob>]` | 查看或修改当前项目的 `.impeccable/config.json` 守卫规则 |
| `/impeccable pin <subcommand>` | 将指定子命令固定为 `/impeccable <subcommand>` 快捷斜杠命令（热更新 `$DSH_HOME/impeccable.json`） |
| `/impeccable unpin <subcommand>` | 从 `/` 菜单移除指定的 `/impeccable <subcommand>` 快捷命令 |

#### LLM 设计子命令（Host 预组装加速）

执行任意设计子命令（如 `/impeccable critique` 或 `/impeccable typeset --target src/components/Header.tsx`）时，Host 会先在本地执行 `scripts/context.mjs` 收集当前工作区的设计系统摘要、守卫状态与最近评分，并自动把对应的 `reference/<subcommand>.md` 及（改代码类命令必带的）`reference/craft-floor.md` 一次性拼成结构化 Prompt 发送给模型，**省去模型前 2–3 轮调用工具读剧本的延迟与 Token**。

| 分类 | 子命令 | 说明 |
|---|---|---|
| **Build（构建）** | `init` | 采访提炼产品定位（`PRODUCT.md`）并初始化视觉规范（`DESIGN.md`） |
| | `document` | 从现有前端代码自动提取生成 `DESIGN.md` 与 `.impeccable/design.json` |
| | `shape [feature]` | 编码前进行多轮 UX/UI 探索与视觉方向对比，产出界面设计契约 |
| | `extract [target]` | 抽离可复用的设计 Token 与公共组件到设计系统 |
| | `craft [feature]` | 按 Impeccable 工艺标准从零构建或重构功能界面 |
| **Evaluate（评审）** | `critique [target]` | 从视觉层次、排版、色彩、情感共鸣进行全方位 UX/UI 评审与打分 |
| | `audit [target]` | 全面审计无障碍（a11y）、性能、主题兼容与响应式技术质量 |
| **Refine（精修）** | `polish [target]` | 上线前最终品质打磨：对齐、间距、细节一致性与交互微瑕修复 |
| | `distill [target]` | 删繁就简，剔除冗余装饰与视觉噪音，提炼核心界面结构 |
| | `clarify [target]` | 优化界面文案（UX Writing）、按钮标签、空状态与错误提示语 |
| | `typeset [target]` | 优化字体搭配、字阶层次、字重对比、行高与阅读舒适度 |
| | `layout [target]` | 重构网格系统、留白节奏、视觉对齐与信息密度平衡 |
| **Enhance（增强）** | `colorize [target]` | 引入有策略的色彩层次与语义强调色，拯救单调灰暗界面 |
| | `animate [target]` | 注入克制、自然的微交互动效、转场编排与状态反馈动画 |
| | `delight [target]` | 增添恰到好处的品牌个性、惊喜彩蛋与情感化交互细节 |
| | `bolder [target]` | 放大平淡保守的设计，提升视觉张力、戏剧感与排版气势 |
| | `quieter [target]` | 收敛过度刺眼或浮夸的视觉表达，回归沉稳精致的质感 |
| | `overdrive [target]` | 突破常规限制的高阶实现（Shader、物理弹簧、60fps 滚动视差等） |
| **Fix（修复）** | `harden [target]` | 强化边界容错：超长文本溢出、国际化折行、加载失败与极端数据态 |
| | `adapt [target]` | 适配多端屏幕尺寸、移动端触控热区、安全区域与容器查询 |
| | `optimize [target]` | 诊断并优化渲染性能、动画掉帧、资源体积与首屏加载体验 |
| | `onboard [target]` | 设计首次引导流、渐进式功能揭示与有价值的空状态页面 |
| **Iterate（迭代）** | `live` | 交互式实时变体模式（配合本地运行中的开发服进行浏览器热替换实验） |

### 4. DSH Web「设计」视觉工作台（`Design Studio`）

安装后，进入任意会话即可在顶栏看到 `Chat / Trajectory / 设计`（英文环境为 `Design`），完全采用 DSH 原生 `--dsw-alias-*` 主题变量，自适应浅色与深色模式：

1. **视觉规范画板（Design System）**
   - **设计北极星（North Star）**：展示 `.impeccable/design.json` 中的审美定位、反模式红线与字体栈角色预览。
   - **调色板与 OKLCH 8 阶色阶**：渲染核心色板及 Host 实时调用 `color-scale.mjs` 生成的 `50–900` OKLCH 等感知亮度色阶，点击任意色块即刻复制 HEX 值。
   - **设计 Tokens 速览**：集中展示间距、圆角、阴影、边框与动效 Token。
   - **组件标本室（Specimens）与视觉稿（Mocks）**：通过隔离沙盒 `<iframe sandbox="allow-same-origin">` 实时渲染 `design.json` 中的组件 HTML/CSS 标本与 `.impeccable/mocks/*.html` 批准方案。
2. **体检与守卫（Doctor & Detector）**
   - **Doctor 规范健康度**：可视化展示 `doctor.mjs --json` 的逐项检查结果，发现配置漂移时可点击「一键自动修复 (`--fix`)」。
   - **静态反模式扫描器**：一键扫描工作区全部 UI 文件，按文件分组展示违例详情；每条违例均支持**「忽略此规则」「忽略此文件」**（自动写入 `.impeccable/config.json`）或**「让 Agent 修复」**（直接带精确行号与修复建议 steer 当前会话）。
   - **项目级守卫配置与 Critique 历史曲线**：切换项目级 Hook 开关，查看 `.impeccable/context.md` 记录的历次 `/critique` 评分演进。
3. **物料文档（Artifacts）**
   - 在线查看与编辑 `PRODUCT.md`、`DESIGN.md`、`.impeccable/design.json`、`.impeccable/config.json`、`.impeccable/context.md` 以及 `.impeccable/surfaces/*.md` 界面契约（支持新建 `surfaces/<name>.md`，`Ctrl/Cmd + S` 快捷保存）。
4. **动作发射台（Command Launchpad）**
   - 按 6 大分类陈列全部 23 个子命令卡片，支持顶部填写可选 `--target`（文件、组件或页面描述）后一键派发给当前会话。
5. **远程可视化方向选择题代理（Visual Direction Picker）**
   - 当 Agent 在 `/shape` 或 `/init` 过程中调用 `serve-question.mjs` 发起多方案视觉对比时，「设计」Tab 顶部自动弹出可视化方向选择卡片（展示每个方案的定位、色板、草图与利弊），用户在 Web 端点击选择后直接写回状态文件并唤醒 CLI 子进程继续执行，**彻底解决远程服务器无法弹窗浏览器的痛点**。

---

## 安装

```sh
# 从 npm 安装
dsh plugin --profile web add dsh-impeccable

# 或从 GitHub 安装
dsh plugin --profile web add github:Cassius0924/dsh-impeccable

# 或安装本地目录
dsh plugin --profile web add link:/path/to/dsh-impeccable
```

安装后重启 DSH 服务（如 `systemctl restart dsh`）生效。

卸载：

```sh
dsh plugin --profile web remove dsh-impeccable
```

已验证宿主版本：`0.2.1-rc.3`、`0.2.2-alpha.2`。

---

## 配置

### 1. 全局配置（`$DSH_HOME/impeccable.json`）

默认位于 `~/.dsh/impeccable.json`，可在 **设置 → Impeccable 设计** 中可视化修改，也可直接编辑文件（插件监听文件变更，300ms 防抖热生效）：

```json
{
  "hookEnabled": true,
  "stopDeepPass": true,
  "showConversationTab": true,
  "pinnedCommands": ["critique", "audit", "polish", "shape"]
}
```

- `hookEnabled`：是否启用 `tools/post-execute` 改文件即时反模式守卫（默认 `true`）。
- `stopDeepPass`：是否启用 `agent/turn-stopping` 回合结束深度扫描兜底（默认 `true`）。
- `showConversationTab`：是否在会话顶栏挂载「设计」视图 Tab（默认 `true`）。
- `pinnedCommands`：固定到 `/` 菜单为 `/impeccable <cmd>` 快捷命令的子命令数组（默认 `["critique", "audit", "polish", "shape"]`）。

### 2. 项目级配置（`<workspace>/.impeccable/config.json`）

与上游 Impeccable 100% 兼容，可在「设计 → 体检与守卫」中通过按钮管理，或使用 `/impeccable hooks ...` 命令修改：

```json
{
  "hook": {
    "enabled": true
  },
  "detector": {
    "ignoreRules": ["purple-gradient"],
    "ignoreFiles": ["src/legacy/**"],
    "ignoreValues": ["#6366f1"]
  }
}
```

---

## 安全说明

- **认证栅栏内接口**：插件所有 HTTP 路由（`/api/dsh-impeccable/*`）均通过 `ctx.connection.fetch.register` 注册在 DSH 认证栅栏内，享有宿主的同源检查、会话 Cookie 鉴权与防 DNS 重绑定保护。
- **严格的文件读写白名单**：物料读写接口（`/api/dsh-impeccable/artifact`）在服务端强制校验路径白名单，仅允许读写当前工作区根目录下的 `PRODUCT.md`、`DESIGN.md` 及 `.impeccable/` 子目录下的受管文件；写入前执行 `realpath` 与 `lstat` 符号链接逃逸检查，拒绝任何软链越界。
- **沙盒预览**：组件标本与视觉稿预览统一运行在 `<iframe sandbox="allow-same-origin">` 沙盒内，禁止执行外部内联脚本。

---

## 开发与测试

```sh
pnpm install
pnpm build   # esbuild 打包 lib/index.js + lib/core.js + lib/client.js，tsc 生成 lib/types/
pnpm test    # 运行单元与 Host 集成测试（node --test test/*.mjs）
```

目录结构：

```
dsh-impeccable/
├── assets/impeccable/          # 内置 Impeccable v4.0.4 技能包（SKILL.md + reference/ + scripts/）
├── src/
│   ├── core.ts                 # 核心逻辑层（配置校验、路径重写、Prompt 预组装、双阶段守卫、静态扫描）
│   ├── index.ts                # Host 插件入口（SkillProvider、斜杠命令、钩子、/api/dsh-impeccable/* 路由）
│   └── client/
│       ├── index.tsx           # Client 插件入口（注册 conversation.view 与 settings.section）
│       ├── studio.tsx          # 「设计」工作台 4 子视图 + 远程视觉方向选择卡 + 设置面板
│       └── locales.ts          # 中英文双语词典（zh / en）
├── test/
│   ├── impeccable.test.mjs     # 核心层单元测试
│   └── host-integration.test.mjs # Host 插件全链路集成测试
├── cordis.patch.yml
├── build.mjs
└── RELEASING.md                # GitHub Actions OIDC 自动发布 npm 说明
```

发版流程见 [RELEASING.md](./RELEASING.md)。

---

## License

插件代码采用 [MIT](./LICENSE) 许可证；`assets/impeccable/` 下随包内置的 Impeccable 技能与脚本遵循上游 [Apache-2.0](https://github.com/pbakaus/impeccable/blob/main/LICENSE) 许可证。
