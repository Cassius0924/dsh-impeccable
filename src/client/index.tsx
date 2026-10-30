/**
 * dsh-impeccable Client 半边入口：
 * 1. 注册中英文字典与插件作用域样式（复用宿主 --dsw-* 变量）
 * 2. 在会话顶栏挂载「设计 / Design」视图 Tab（conversation.view）
 * 3. 在设置页挂载「Impeccable 设计」全局配置分区（settings.section）
 * 4. 在 `/` 斜杠触发菜单挂载 `/impeccable <subcommand>` 快捷固定命令源（inputTriggers）
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ReactElement } from 'react'
import { en, NS, zh } from './locales.ts'
import {
  CONFIG_CHANGED_EVENT,
  ImpeccableSettingsSection,
  ImpeccableStudio,
  type Translate,
} from './studio.tsx'

export const name = 'dsh-impeccable'
export const inject = ['slots', 'locale']

interface SubcommandClientMeta {
  name: string
  description: string
  descriptionZh: string
  argumentHint: string
}

const DEFAULT_PINNED_COMMANDS = ['critique', 'audit', 'polish', 'shape']

const DEFAULT_SUBCOMMANDS: readonly SubcommandClientMeta[] = [
  { name: 'init', description: 'Capture durable product context in PRODUCT.md and bootstrap DESIGN.md.', descriptionZh: '初始化项目设计上下文（生成 PRODUCT.md 与 DESIGN.md）', argumentHint: '' },
  { name: 'document', description: 'Generate DESIGN.md and .impeccable/design.json from existing project code.', descriptionZh: '从现有代码提取生成 DESIGN.md 与 design.json 规范', argumentHint: '' },
  { name: 'shape', description: 'Plan UX and UI before writing code through discovery and visual probes.', descriptionZh: '编码前规划 UX/UI 方案并产出界面设计契约', argumentHint: '[feature]' },
  { name: 'extract', description: 'Pull reusable tokens and components into the design system.', descriptionZh: '抽离可复用的设计 Token 与公共组件到设计系统', argumentHint: '[target]' },
  { name: 'craft', description: 'Build or redesign a surface with full Impeccable design craft.', descriptionZh: '按 Impeccable 工艺标准从零构建或重构界面', argumentHint: '[feature]' },
  { name: 'critique', description: 'Evaluate design from both UX and visual craft lenses with quantitative scoring.', descriptionZh: '从 UX 与视觉精致度双维度进行设计评审与打分', argumentHint: '[target]' },
  { name: 'audit', description: 'Audit accessibility (A11y), performance, theming, and responsive quality.', descriptionZh: '全面审查无障碍（A11y）、性能、主题与响应式质量', argumentHint: '[target]' },
  { name: 'polish', description: 'Final pre-ship quality pass fixing alignment, spacing, consistency, and micro-details.', descriptionZh: '上市前对齐、间距、一致性与微细节终检', argumentHint: '[target]' },
  { name: 'typeset', description: 'Improve font choices, hierarchy, sizing, weight, and typographic rhythm.', descriptionZh: '优化字体选型、字号层级、字重对比与阅读韵律', argumentHint: '[target]' },
  { name: 'layout', description: 'Fix spacing, grid rhythm, visual hierarchy, and crowded or misaligned layouts.', descriptionZh: '重构空间网格、间距节奏、视觉主次与对齐关系', argumentHint: '[target]' },
  { name: 'colorize', description: 'Introduce strategic OKLCH color and tonal harmony to monochromatic or dull UIs.', descriptionZh: '运用 OKLCH 色彩科学为平淡界面注入层次色彩', argumentHint: '[target]' },
  { name: 'distill', description: 'Strip unnecessary complexity, chrome, and visual noise down to the essence.', descriptionZh: '剔除冗余装饰与认知噪音，提炼极简界面本质', argumentHint: '[target]' },
  { name: 'clarify', description: 'Improve UX copy, microcopy, labels, error messages, and instruction clarity.', descriptionZh: '优化按钮文案、错误提示、空状态引导与交互微文案', argumentHint: '[target]' },
  { name: 'animate', description: 'Enhance interfaces with purposeful micro-interactions, choreography, and motion.', descriptionZh: '补充契合品牌调性的微交互反馈与编排动效', argumentHint: '[target]' },
  { name: 'delight', description: 'Add moments of joy, personality, and memorable craft details.', descriptionZh: '注入令人印象深刻的品牌个性与情感化微细节', argumentHint: '[target]' },
  { name: 'bolder', description: 'Amplify safe, bland, or generic designs to feel more confident and distinctive.', descriptionZh: '打破平庸保守，强化视觉张力与设计辨识度', argumentHint: '[target]' },
  { name: 'quieter', description: 'Tone down overly aggressive or noisy designs while preserving craft quality.', descriptionZh: '收敛过度刺激的视觉元素，回归克制优雅', argumentHint: '[target]' },
  { name: 'overdrive', description: 'Push interfaces past conventional limits with shaders, spring physics, or 60fps effects.', descriptionZh: '突破常规边界，探索着色器、弹簧物理与高帧率特效', argumentHint: '[target]' },
  { name: 'adapt', description: 'Adapt designs across mobile, tablet, desktop, and touch/keyboard input modes.', descriptionZh: '适配多端视口尺寸、触控热区与响应式布局形态', argumentHint: '[target]' },
  { name: 'harden', description: 'Harden interfaces against empty states, errors, i18n text overflow, and edge cases.', descriptionZh: '加固空状态、异常报错、超长多语言文本与极端边界', argumentHint: '[target]' },
  { name: 'optimize', description: 'Diagnose and fix loading speed, rendering, layout shift (CLS), and bundle size.', descriptionZh: '诊断并优化渲染帧率、布局抖动（CLS）与加载性能', argumentHint: '[target]' },
  { name: 'live', description: 'Interactive live browser variant exploration and HMR hot-swap.', descriptionZh: '启动浏览器实时元素拾取与多方案变体热替换实验', argumentHint: '' },
  { name: 'teach', description: 'Alias for init: teach Impeccable your product context and design system.', descriptionZh: 'init 的别名：向 Impeccable 传授项目产品与视觉上下文', argumentHint: '' },
]

interface CommandClaim {
  readonly name: string
  readonly token: string
  readonly hint?: string
  readonly attachments?: boolean
  submit(
    args: string,
    actx: Context,
    attachments: readonly unknown[],
  ): Promise<{ readonly kind: 'success' | 'error'; readonly text?: string }>
}

interface InputTriggerCandidate {
  readonly name: string
  readonly label?: string
  readonly description?: string
  readonly hint?: string
  readonly section?: string
  readonly value?: string
}

interface InputTriggerPick {
  readonly candidate: InputTriggerCandidate
  readonly session: { readonly sessionId: string }
}

interface InputTriggerSource {
  readonly trigger: '/' | '@'
  readonly name: string
  readonly order?: number
  readonly showGroupTitle?: boolean
  candidates(
    session: { readonly sessionId: string },
    req: { readonly query: string; readonly position: 'leading' | 'inline'; readonly signal: AbortSignal },
  ): Promise<readonly InputTriggerCandidate[]>
  onPick(pick: InputTriggerPick): { readonly claim: CommandClaim } | undefined
  matchSpace?(
    session: { readonly sessionId: string },
    token: string,
  ): { readonly claim: CommandClaim } | undefined
  matchClaim?(
    session: { readonly sessionId: string },
    token: string,
    signal: AbortSignal,
  ): Promise<CommandClaim | undefined>
}

interface InputTriggersService {
  registerSource(src: InputTriggerSource): () => void
}

interface RemoteCommandsService {
  execute(
    sessionId: string,
    line: string,
    attachments: readonly unknown[],
  ): Promise<{
    ok: boolean
    error?: { code?: string; message?: string }
    value?: { result: { kind: 'success' | 'error'; text?: string } }
  }>
}

interface ClientContext extends Context {
  slots: {
    inject(key: string, callback: () => unknown): () => void
    register(
      options: {
        name: string
        id?: string
        key?: string
        order?: number
        locale?: string
        label?: () => string
      },
      component: unknown,
    ): () => void
  }
  locale: {
    register(
      ns: string,
      dictionaries: { zh: Record<string, string>; en: Record<string, string> },
    ): () => void
    bind(ns: string): Translate
  }
  inputTriggers?: InputTriggersService
  remote?: {
    commands?: RemoteCommandsService
    $on?(event: string, listener: (...args: unknown[]) => void): () => void
  }
}

const css = `
.dsh-imp-studio{display:flex;flex-direction:column;gap:16px;padding:18px 24px 32px;width:100%;box-sizing:border-box;overflow-y:auto;color:var(--dsw-alias-label-primary,#111827);font-size:14px;line-height:1.5}
.dsh-imp-settings{display:flex;flex-direction:column;gap:14px;max-width:760px;color:var(--dsw-alias-label-primary,#111827)}
.dsh-imp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.dsh-imp-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22))}
.dsh-imp-header-left,.dsh-imp-header-right,.dsh-imp-actions-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.dsh-imp-brand{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;font-weight:700;letter-spacing:.08em;padding:3px 8px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-primary-fill,#1677ff);color:var(--dsw-alias-label-primary-foreground,#fff)}
.dsh-imp-select,.dsh-imp-input{box-sizing:border-box;min-height:32px;padding:4px 10px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.3));border-radius:var(--dsw-alias-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;outline:none}
.dsh-imp-input{width:100%}
.dsh-imp-input-sm{width:190px}
.dsh-imp-select:focus,.dsh-imp-input:focus,.dsh-imp-editor-textarea:focus{border-color:var(--dsw-alias-state-business-primary,#1677ff)}
.dsh-imp-pills{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px}
.dsh-imp-pill,.dsh-imp-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));border-radius:var(--dsw-radius-xs,6px);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-imp-pill.is-ok{border-color:var(--dsw-alias-state-business-primary,#1677ff);color:var(--dsw-alias-label-primary,inherit)}
.dsh-imp-tag.is-accent{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#1677ff) 14%,transparent);border-color:var(--dsw-alias-state-business-primary,#1677ff);color:var(--dsw-alias-label-primary,inherit);font-weight:600}
code.dsh-imp-tag{font-family:var(--ds-font-family-code,ui-monospace,monospace)}
.dsh-imp-toast{font-size:12px;padding:3px 10px;border-radius:var(--dsw-radius-sm,6px);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#1677ff) 15%,transparent);color:var(--dsw-alias-label-primary,inherit)}
.dsh-imp-subtabs{display:flex;gap:20px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22))}
.dsh-imp-subtab{padding:8px 2px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font:inherit;font-size:13px;font-weight:500;cursor:pointer}
.dsh-imp-subtab[aria-selected=true]{color:var(--dsw-alias-label-primary,inherit);border-bottom-color:var(--dsw-alias-state-business-primary,#1677ff);font-weight:600}
.dsh-imp-pane{display:flex;flex-direction:column;gap:14px}
.dsh-imp-card{border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l3,rgba(128,128,128,.22)));background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-module-platform,rgba(128,128,128,.04)));border-radius:var(--dsw-radius-xl,12px);padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.dsh-imp-row-between{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.dsh-imp-h2{margin:0;font-size:18px;line-height:26px;font-weight:600}
.dsh-imp-h3{margin:0;font-size:15px;line-height:22px;font-weight:600}
.dsh-imp-eyebrow{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-imp-desc{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,inherit)}
.dsh-imp-preline{white-space:pre-line}
.dsh-imp-muted,.dsh-imp-muted-sm{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-imp-ok-msg{margin:0;padding:8px 12px;border-radius:var(--dsw-radius-md,8px);background:color-mix(in srgb,#16a34a 12%,transparent);font-size:13px}
.dsh-imp-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;font-weight:500;cursor:pointer}
.dsh-imp-btn:disabled{opacity:.45;cursor:default}
.dsh-imp-compact{height:28px;padding:0 10px;border-radius:var(--dsw-radius-sm,6px);font-size:12px}
.dsh-imp-primary{background:var(--dsw-alias-button-primary-fill,#1677ff);color:var(--dsw-alias-label-primary-foreground,#fff)}
.dsh-imp-secondary{border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));background:var(--dsw-alias-bg-layer-1,transparent)}
.dsh-imp-two-col{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.dsh-imp-rule-box,.dsh-imp-token-group,.dsh-imp-specimen,.dsh-imp-color-card{padding:10px 12px;border-radius:var(--dsw-radius-lg,10px);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));background:var(--dsw-alias-bg-layer-1,transparent);display:flex;flex-direction:column;gap:6px}
.dsh-imp-rule-box h4,.dsh-imp-token-group h4{margin:0 0 4px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-imp-rule-box ul{margin:0;padding-left:18px;font-size:12px;line-height:18px;display:flex;flex-direction:column;gap:4px}
.dsh-imp-color-grid,.dsh-imp-component-grid,.dsh-imp-cmd-grid,.dsh-imp-question-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.dsh-imp-ramp{display:grid;grid-template-columns:repeat(8,1fr);height:28px;border-radius:6px;overflow:hidden;border:.5px solid rgba(128,128,128,.25)}
.dsh-imp-ramp-step{border:0;padding:0;width:100%;height:100%;cursor:pointer}
.dsh-imp-token-row{display:flex;flex-direction:column;gap:2px;font-size:12px;padding:4px 0;border-bottom:.5px dashed var(--dsw-alias-border-l3,rgba(128,128,128,.16))}
.dsh-imp-token-row:last-child{border-bottom:0}
.dsh-imp-specimen-frame{width:100%;height:76px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));border-radius:6px;background:var(--dsw-alias-bg-base,#fff)}
.dsh-imp-mock-img{width:100%;max-height:200px;object-fit:cover;border-radius:6px}
.dsh-imp-scan-bar,.dsh-imp-artifact-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.dsh-imp-scan-bar .dsh-imp-input{flex:1;min-width:220px}
.dsh-imp-file-group{padding:10px 12px;border-radius:var(--dsw-radius-lg,10px);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));display:flex;flex-direction:column;gap:8px;margin-top:8px}
.dsh-imp-finding-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.dsh-imp-finding-item{padding:8px 10px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.18));display:flex;flex-direction:column;gap:4px}
.dsh-imp-editor-textarea{width:100%;min-height:380px;box-sizing:border-box;padding:12px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.3));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:13px;line-height:1.6;resize:vertical;outline:none}
.dsh-imp-preview-box{margin:0;padding:12px;min-height:240px;max-height:480px;overflow:auto;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:1.6;white-space:pre-wrap}
.dsh-imp-field{display:flex;flex-direction:column;gap:4px}
.dsh-imp-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-imp-cmd-card{justify-content:space-between}
.dsh-imp-cmd-name{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:14px;font-weight:600}
.dsh-imp-cmd-footer{display:flex;justify-content:flex-end;margin-top:4px}
.dsh-imp-toggle-row{display:flex;align-items:flex-start;gap:10px;padding:6px 0;cursor:pointer}
.dsh-imp-pin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-top:4px}
.dsh-imp-pin-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));border-radius:var(--dsw-radius-md,8px);cursor:pointer;font-size:12px}
.dsh-imp-pin-item.is-checked{border-color:var(--dsw-alias-state-business-primary,#1677ff);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#1677ff) 8%,transparent)}
.dsh-imp-question-banner{padding:14px 16px;border-radius:var(--dsw-radius-xl,12px);border:1.5px solid var(--dsw-alias-state-business-primary,#1677ff);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#1677ff) 6%,transparent);display:flex;flex-direction:column;gap:10px}
.dsh-imp-question-head,.dsh-imp-question-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.dsh-imp-swatch-strip{display:flex;align-items:center;gap:6px}
.dsh-imp-swatch-dot{width:18px;height:18px;border-radius:50%;border:1px solid rgba(128,128,128,.35)}
.dsh-imp-thesis{margin:0;font-size:13px;font-weight:500}
`

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-impeccable: dictionaries')
  const t = ctx.locale.bind(NS)

  if (typeof document !== 'undefined') {
    document.querySelectorAll('style[data-plugin="dsh-impeccable"]').forEach(node => node.remove())
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-impeccable'
    tag.textContent = css
    document.head.appendChild(tag)
  }

  // 客户端缓存的全局配置与子命令表（供 `/` 菜单及会话顶栏 Tab 实时读取）
  let pinnedCommands: string[] = [...DEFAULT_PINNED_COMMANDS]
  const subcommandMap = new Map<string, SubcommandClientMeta>(
    DEFAULT_SUBCOMMANDS.map(item => [item.name, item]),
  )

  const refreshGlobalConfig = async (): Promise<{ showConversationTab?: boolean } | null> => {
    if (typeof window === 'undefined') return null
    try {
      const res = await fetch('api/dsh-impeccable/config')
      if (!res.ok) return null
      const data = (await res.json()) as {
        ok?: boolean
        globalConfig?: { showConversationTab?: boolean; pinnedCommands?: string[] }
        subcommands?: SubcommandClientMeta[]
      }
      if (Array.isArray(data.subcommands)) {
        for (const item of data.subcommands) {
          if (item && typeof item.name === 'string') {
            subcommandMap.set(item.name, item)
          }
        }
      }
      if (Array.isArray(data.globalConfig?.pinnedCommands)) {
        pinnedCommands = data.globalConfig.pinnedCommands
      }
      return data.globalConfig ?? null
    } catch {
      return null
    }
  }

  // 1. 设置页挂载：Impeccable 设计全局设置
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'impeccable-settings',
        order: 26,
        locale: NS,
        label: () => t('settings.title'),
      },
      ({ t: slotT }: { t?: Translate }): ReactElement => (
        <ImpeccableSettingsSection t={slotT ?? t} />
      ),
    ),
  )

  // 2. 会话顶栏 Tab 挂载：Impeccable 设计工作台（支持在设置页动态开关）
  ctx.effect(() => {
    let disposeTab: (() => void) | null = null

    const mountTab = (show: boolean): void => {
      disposeTab?.()
      disposeTab = null
      if (!show) return
      disposeTab = ctx.slots.inject('conversation.view', () =>
        ctx.slots.register(
          {
            name: 'conversation.view',
            id: 'impeccable-design',
            order: 40,
            locale: NS,
            label: () => t('tab.title'),
          },
          ({
            t: slotT,
            sessionId,
            openView,
          }: {
            t?: Translate
            sessionId?: string
            openView?: (view: string, focus?: string) => void
          }): ReactElement => (
            <ImpeccableStudio
              t={slotT ?? t}
              sessionId={sessionId}
              openView={openView}
            />
          ),
        ),
      )
    }

    mountTab(true)
    if (typeof window !== 'undefined') {
      void refreshGlobalConfig().then((cfg) => {
        if (cfg && cfg.showConversationTab === false) {
          mountTab(false)
        }
      })

      const onChanged = (e: Event): void => {
        const detail = (e as CustomEvent<{ showConversationTab?: boolean; pinnedCommands?: string[] }>).detail
        if (detail) {
          if (Array.isArray(detail.pinnedCommands)) {
            pinnedCommands = detail.pinnedCommands
          }
          if (typeof detail.showConversationTab === 'boolean') {
            mountTab(detail.showConversationTab)
          }
        }
      }
      window.addEventListener(CONFIG_CHANGED_EVENT, onChanged)
      return () => {
        window.removeEventListener(CONFIG_CHANGED_EVENT, onChanged)
        disposeTab?.()
      }
    }

    return () => {
      disposeTab?.()
    }
  }, 'dsh-impeccable: conversation.view')

  // 3. 在 `/` 触发菜单注册 `/impeccable <subcommand>` 快捷固定命令源
  const mountSlashTriggerSource = (scope: ClientContext): (() => void) => {
    const inputTriggers = scope.inputTriggers ?? (scope.get?.('inputTriggers') as InputTriggersService | undefined)
    const remote = scope.remote ?? (scope.get?.('remote') as ClientContext['remote'] | undefined)
    const remoteCommands = remote?.commands
    if (!inputTriggers || !remoteCommands) return () => {}

    const createPinnedClaim = (sessionId: string, meta: SubcommandClientMeta): CommandClaim => ({
      name: 'impeccable',
      token: `/impeccable ${meta.name} `,
      hint: meta.argumentHint || '[target]',
      submit: async (args, _actx, attachments) => {
        const trimmedArgs = args.trim()
        const line = trimmedArgs
          ? `/impeccable ${meta.name} ${trimmedArgs}`
          : `/impeccable ${meta.name}`
        const result = await remoteCommands.execute(sessionId, line, attachments)
        if (!result.ok) {
          throw new Error(
            `command.execute failed: ${result.error?.code ?? 'ERR'}: ${result.error?.message ?? 'unknown error'}`,
          )
        }
        if (result.value === undefined) {
          return { kind: 'error', text: `unknown or malformed command: ${line}` }
        }
        if (attachments.length > 0 && result.value.result?.kind === 'error') {
          return { kind: 'error', text: result.value.result.text }
        }
        return { kind: 'success' }
      },
    })

    const disposeSource = inputTriggers.registerSource({
      trigger: '/',
      name: 'impeccable',
      order: 1,
      async candidates(_session, { query, position }) {
        if (position !== 'leading') return []
        const q = query.trim().toLowerCase()
        const pinned = pinnedCommands
          .map(cmdName => subcommandMap.get(cmdName))
          .filter((item): item is SubcommandClientMeta => item !== undefined)

        const matched = q === ''
          ? pinned
          : pinned
            .map((item) => {
              const full = `impeccable ${item.name}`
              const compact = `impeccable-${item.name}`
              if (full.startsWith(q) || compact.startsWith(q)) return { item, rank: 0 }
              if (item.name.startsWith(q)) return { item, rank: 1 }
              if (full.includes(q) || compact.includes(q) || item.name.includes(q)) return { item, rank: 2 }
              return null
            })
            .filter((entry): entry is { item: SubcommandClientMeta; rank: number } => entry !== null)
            .sort((a, b) => a.rank - b.rank)
            .map(entry => entry.item)

        return matched.map(item => ({
          name: `impeccable ${item.name}`,
          label: `impeccable ${item.name}`,
          description: item.descriptionZh,
          hint: item.argumentHint || '[target]',
          section: 'Impeccable',
          value: item.name,
        }))
      },
      onPick(pick) {
        const subName = pick.candidate.value ?? pick.candidate.name.replace(/^impeccable\s+/u, '')
        const meta = subcommandMap.get(subName)
        if (!meta) return undefined
        return {
          claim: createPinnedClaim(pick.session.sessionId, meta),
        }
      },
      matchSpace(session, token) {
        const raw = token.startsWith('/') ? token.slice(1).trim().toLowerCase() : ''
        if (!raw) return undefined
        const subName = raw.startsWith('impeccable-')
          ? raw.slice('impeccable-'.length)
          : pinnedCommands.includes(raw)
            ? raw
            : ''
        if (!subName) return undefined
        const meta = subcommandMap.get(subName)
        if (!meta) return undefined
        return {
          claim: createPinnedClaim(session.sessionId, meta),
        }
      },
      async matchClaim(session, token) {
        const m = /^\/impeccable\s+([a-z][a-z0-9_-]*)$/u.exec(token.trim())
        if (!m?.[1]) return undefined
        const meta = subcommandMap.get(m[1])
        if (!meta) return undefined
        return createPinnedClaim(session.sessionId, meta)
      },
    })

    const offRemoteChange = remote?.$on?.('commands/change', () => {
      void refreshGlobalConfig()
    })

    return () => {
      offRemoteChange?.()
      disposeSource()
    }
  }

  try {
    ctx.inject(['inputTriggers', 'remote', 'remote.commands'], (scope) => {
      scope.effect(() => mountSlashTriggerSource(scope as ClientContext), 'dsh-impeccable: slash source')
    })
  } catch {
    ctx.effect(() => mountSlashTriggerSource(ctx), 'dsh-impeccable: slash source fallback')
  }
}
