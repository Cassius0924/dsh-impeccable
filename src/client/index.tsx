/**
 * dsh-impeccable Client 半边入口：
 * 1. 注册中英文字典与插件作用域样式（复用宿主 --dsw-* 变量）
 * 2. 在会话顶栏挂载「设计 / Design」视图 Tab（conversation.view）
 * 3. 在设置页挂载「Impeccable 设计」全局配置分区（settings.section）
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
}

const css = `
.dsh-imp-studio{display:flex;flex-direction:column;gap:16px;padding:18px 24px 32px;width:100%;box-sizing:border-box;overflow-y:auto;color:var(--dsw-alias-label-primary,#111827);font-size:14px;line-height:1.5}
.dsh-imp-settings{display:flex;flex-direction:column;gap:14px;max-width:760px;color:var(--dsw-alias-label-primary,#111827)}
.dsh-imp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.dsh-imp-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22))}
.dsh-imp-header-left,.dsh-imp-header-right,.dsh-imp-actions-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.dsh-imp-brand{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;font-weight:700;letter-spacing:.08em;padding:3px 8px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-primary-fill,#1677ff);color:var(--dsw-alias-label-primary-foreground,#fff)}
.dsh-imp-select,.dsh-imp-input{box-sizing:border-box;min-height:32px;padding:4px 10px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.3));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;outline:none}
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
.dsh-imp-pin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-top:4px}
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

    // 默认先挂载，随后根据后端全局配置确认是否显示
    mountTab(true)
    if (typeof window !== 'undefined') {
      void fetch('api/dsh-impeccable/config')
        .then(r => (r.ok ? r.json() : null))
        .then((data: { globalConfig?: { showConversationTab?: boolean } } | null) => {
          if (data?.globalConfig && data.globalConfig.showConversationTab === false) {
            mountTab(false)
          }
        })
        .catch(() => {})

      const onChanged = (e: Event): void => {
        const detail = (e as CustomEvent<{ showConversationTab?: boolean }>).detail
        if (detail && typeof detail.showConversationTab === 'boolean') {
          mountTab(detail.showConversationTab)
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
}
