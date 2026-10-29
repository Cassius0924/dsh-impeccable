/**
 * dsh-impeccable Web 视觉面板组件：
 * 1. ImpeccableStudio（挂在会话顶栏 conversation.view）
 * 2. ImpeccableSettingsSection（挂在设置页 settings.section）
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { LocaleKey } from './locales.ts'

export type Translate = (key: LocaleKey, params?: Record<string, unknown>) => string

export const CONFIG_CHANGED_EVENT = 'dsh-impeccable:config-changed'

const API_BASE = 'api/dsh-impeccable'

interface SubcommandItem {
  name: string
  category: string
  description: string
  descriptionZh: string
  argumentHint: string
}

interface GlobalConfig {
  hookEnabled: boolean
  stopDeepPass: boolean
  showConversationTab: boolean
  pinnedCommands: string[]
}

interface DetectorFinding {
  id: string
  category?: string
  severity?: string
  line?: number
  snippet?: string
  value?: string
  message?: string
  fix?: string
}

interface DetectorGroup {
  file: string
  relFile: string
  findings: DetectorFinding[]
}

interface VisualOption {
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
}

interface ActiveQuestion {
  key: string
  url?: string
  payload: {
    title?: string
    question?: string
    options: VisualOption[]
    reroll?: boolean
    canon?: boolean
    steer?: boolean
  }
}

interface OverviewPayload {
  ok: boolean
  cwd: string
  projectRoot: string
  globalConfig: GlobalConfig
  subcommands: SubcommandItem[]
  workspaces: Array<{ id: string; title: string; path: string }>
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
    critiques: Array<{
      file: string
      slug: string
      timestamp: string
      score: number | null
      p0: number | null
      p1: number | null
      excerpt: string
    }>
  }
  doctor: {
    findings?: Array<{ id?: string; severity?: string; file?: string; message?: string; fix?: string }>
    summary?: Record<string, unknown>
    raw?: string
  } | null
  activeQuestion: ActiveQuestion | null
}

function formatText(template: string, params?: Record<string, unknown>): string {
  if (!params) return template
  return template.replace(/\{([a-zA-Z0-9_]+)\}/gu, (_m, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  )
}

export function ImpeccableStudio({
  sessionId,
  openView,
  t,
}: {
  sessionId?: string
  openView?: (view: string, focus?: string) => void
  t: Translate
}): ReactElement {
  const [selectedCwd, setSelectedCwd] = useState<string>('')
  const [overview, setOverview] = useState<OverviewPayload | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<'system' | 'health' | 'artifacts' | 'launchpad'>('system')
  const [toast, setToast] = useState<string | null>(null)

  // Detector scan state
  const [scanning, setScanning] = useState<boolean>(false)
  const [scanTarget, setScanTarget] = useState<string>('')
  const [scanReport, setScanReport] = useState<{
    scannedFiles: number
    totalFindings: number
    groups: DetectorGroup[]
  } | null>(null)

  // Artifact editor state
  const [selectedArtifact, setSelectedArtifact] = useState<string>('DESIGN.md')
  const [artifactContent, setArtifactContent] = useState<string>('')
  const [artifactSavedContent, setArtifactSavedContent] = useState<string>('')
  const [artifactExists, setArtifactExists] = useState<boolean>(true)
  const [artifactMode, setArtifactMode] = useState<'edit' | 'preview'>('edit')
  const [savingArtifact, setSavingArtifact] = useState<boolean>(false)
  const [newSurfaceName, setNewSurfaceName] = useState<string>('')

  // Launchpad state
  const [launchCategory, setLaunchCategory] = useState<string>('All')
  const [launchTarget, setLaunchTarget] = useState<string>('')
  const [launchExtra, setLaunchExtra] = useState<string>('')

  // Visual Question state
  const [questionSteer, setQuestionSteer] = useState<string>('')

  const showNotice = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => {
      setToast(prev => (prev === msg ? null : prev))
    }, 3200)
  }, [])

  const fetchOverview = useCallback(
    async (cwdOverride?: string) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (sessionId) params.set('sessionId', sessionId)
        const targetCwd = cwdOverride !== undefined ? cwdOverride : selectedCwd
        if (targetCwd) params.set('cwd', targetCwd)
        const res = await fetch(`${API_BASE}/overview?${params.toString()}`)
        if (!res.ok) return
        const data = (await res.json()) as OverviewPayload
        if (data.ok) {
          setOverview(data)
          if (!targetCwd && data.projectRoot) {
            setSelectedCwd(data.projectRoot)
          }
        }
      } catch {
        /* ignore network errors */
      } finally {
        setLoading(false)
      }
    },
    [sessionId, selectedCwd],
  )

  useEffect(() => {
    void fetchOverview()
  }, [sessionId])

  // 加载选中的物料文档内容
  const loadArtifact = useCallback(
    async (relPath: string, rootDir?: string) => {
      const cwdToUse = rootDir || overview?.projectRoot || selectedCwd
      if (!cwdToUse) return
      try {
        const params = new URLSearchParams({ cwd: cwdToUse, path: relPath })
        const res = await fetch(`${API_BASE}/artifact?${params.toString()}`)
        if (!res.ok) return
        const data = (await res.json()) as { ok: boolean; exists: boolean; content: string }
        if (data.ok) {
          setSelectedArtifact(relPath)
          setArtifactExists(data.exists)
          setArtifactContent(data.content)
          setArtifactSavedContent(data.content)
        }
      } catch {
        /* ignore */
      }
    },
    [overview?.projectRoot, selectedCwd],
  )

  useEffect(() => {
    if (activeTab === 'artifacts' && overview?.projectRoot) {
      void loadArtifact(selectedArtifact, overview.projectRoot)
    }
  }, [activeTab, overview?.projectRoot])

  const handleSaveArtifact = async (): Promise<void> => {
    if (!overview?.projectRoot) return
    setSavingArtifact(true)
    try {
      const res = await fetch(`${API_BASE}/artifact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cwd: overview.projectRoot,
          path: selectedArtifact,
          content: artifactContent,
        }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (data.ok) {
        setArtifactSavedContent(artifactContent)
        setArtifactExists(true)
        showNotice(t('studio.artifacts.saved'))
        void fetchOverview(overview.projectRoot)
      } else if (data.error) {
        showNotice(data.error)
      }
    } finally {
      setSavingArtifact(false)
    }
  }

  const handleSteerCommand = async (subcommand?: string, args = '', rawPrompt?: string): Promise<void> => {
    if (!sessionId) {
      showNotice(t('studio.launchpad.noSession'))
      return
    }
    const res = await fetch(`${API_BASE}/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        cwd: overview?.projectRoot || selectedCwd,
        ...(subcommand ? { subcommand } : {}),
        args,
        ...(rawPrompt ? { rawPrompt } : {}),
      }),
    })
    const data = (await res.json()) as { ok: boolean; error?: string }
    if (data.ok) {
      showNotice(formatText(t('studio.launchpad.steered'), { cmd: subcommand ? `/${subcommand}` : 'Impeccable' }))
      try {
        openView?.('chat', '')
      } catch {
        /* stay in studio if openView not provided */
      }
    } else if (data.error) {
      showNotice(data.error)
    }
  }

  const handleRunScan = async (): Promise<void> => {
    setScanning(true)
    try {
      const res = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cwd: overview?.projectRoot || selectedCwd,
          sessionId,
          ...(scanTarget.trim() ? { target: scanTarget.trim() } : {}),
        }),
      })
      const data = (await res.json()) as {
        ok: boolean
        scannedFiles: number
        totalFindings: number
        groups: DetectorGroup[]
      }
      if (data.ok) {
        setScanReport({
          scannedFiles: data.scannedFiles,
          totalFindings: data.totalFindings,
          groups: data.groups,
        })
      }
    } finally {
      setScanning(false)
    }
  }

  const handleProjectHookAction = async (
    action: string,
    extra: { rule?: string; file?: string; value?: string } = {},
  ): Promise<void> => {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'project',
        cwd: overview?.projectRoot || selectedCwd,
        action,
        ...extra,
      }),
    })
    const data = (await res.json()) as { ok: boolean; output?: string }
    if (data.output) showNotice(data.output.split('\n')[0] || 'OK')
    void fetchOverview(overview?.projectRoot)
    if (scanReport) void handleRunScan()
  }

  const handleDoctorRun = async (fix: boolean): Promise<void> => {
    const res = await fetch(`${API_BASE}/doctor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: overview?.projectRoot || selectedCwd,
        fix,
      }),
    })
    const data = (await res.json()) as { ok: boolean }
    if (data.ok) {
      showNotice(fix ? 'Doctor --fix completed' : 'Doctor refreshed')
      void fetchOverview(overview?.projectRoot)
    }
  }

  const handleAnswerQuestion = async (key: string, optionId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/question/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: overview?.projectRoot || selectedCwd,
        key,
        optionId,
        steer: questionSteer,
      }),
    })
    const data = (await res.json()) as { ok: boolean; error?: string }
    if (data.ok) {
      showNotice(t('studio.question.submitted'))
      setQuestionSteer('')
      void fetchOverview(overview?.projectRoot)
    } else if (data.error) {
      showNotice(data.error)
    }
  }

  const designJson = overview?.artifacts.designJson ?? null
  const narrative = (designJson?.narrative as Record<string, unknown> | undefined) ?? null
  const extensions = (designJson?.extensions as Record<string, unknown> | undefined) ?? null
  const colorMeta = (extensions?.colorMeta as Record<string, Record<string, unknown>> | undefined) ?? null
  const typographyMeta = (extensions?.typographyMeta as Record<string, Record<string, unknown>> | undefined) ?? null
  const shadows = (extensions?.shadows as Array<Record<string, unknown>> | undefined) ?? []
  const motion = (extensions?.motion as Array<Record<string, unknown>> | undefined) ?? []
  const breakpoints = (extensions?.breakpoints as Array<Record<string, unknown>> | undefined) ?? []
  const components = (designJson?.components as Array<Record<string, unknown>> | undefined) ?? []

  const pinnedSet = useMemo(
    () => new Set(overview?.globalConfig.pinnedCommands ?? []),
    [overview?.globalConfig.pinnedCommands],
  )

  if (loading && !overview) {
    return (
      <div className="dsh-imp-studio">
        <p className="dsh-imp-muted">{t('studio.loading')}</p>
      </div>
    )
  }

  const activeQuestion = overview?.activeQuestion ?? null
  const doctorFindings = Array.isArray(overview?.doctor?.findings) ? overview!.doctor!.findings! : []
  const projectHookEnabled =
    (overview?.artifacts.projectConfig?.hook as { enabled?: boolean } | undefined)?.enabled !== false

  return (
    <div className="dsh-imp-studio" data-impeccable-studio="">
      {/* 顶栏：工作区切换 + 物料徽章 + 刷新 */}
      <header className="dsh-imp-header">
        <div className="dsh-imp-header-left">
          <span className="dsh-imp-brand">IMPECCABLE</span>
          <label className="dsh-imp-ws-picker">
            <span className="dsh-imp-sr">{t('studio.workspace')}</span>
            <select
              className="dsh-imp-select"
              value={overview?.projectRoot || selectedCwd}
              onChange={(e) => {
                setSelectedCwd(e.target.value)
                void fetchOverview(e.target.value)
              }}
            >
              {overview?.projectRoot &&
              !overview.workspaces.some(w => w.path === overview.projectRoot) ? (
                <option value={overview.projectRoot}>{overview.projectRoot}</option>
              ) : null}
              {(overview?.workspaces ?? []).map(ws => (
                <option key={ws.id} value={ws.path}>
                  {ws.title ? `${ws.title} (${ws.path})` : ws.path}
                </option>
              ))}
            </select>
          </label>
          <div className="dsh-imp-pills">
            <span className={`dsh-imp-pill ${overview?.artifacts.hasProductMd ? 'is-ok' : ''}`}>
              PRODUCT.md {overview?.artifacts.hasProductMd ? '✓' : '—'}
            </span>
            <span className={`dsh-imp-pill ${overview?.artifacts.hasDesignMd ? 'is-ok' : ''}`}>
              DESIGN.md {overview?.artifacts.hasDesignMd ? '✓' : '—'}
            </span>
            <span className={`dsh-imp-pill ${overview?.artifacts.hasDesignJson ? 'is-ok' : ''}`}>
              design.json {overview?.artifacts.hasDesignJson ? '✓' : '—'}
            </span>
          </div>
        </div>
        <div className="dsh-imp-header-right">
          {toast ? <span className="dsh-imp-toast">{toast}</span> : null}
          <button
            type="button"
            className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
            onClick={() => void fetchOverview(overview?.projectRoot)}
          >
            {t('studio.refresh')}
          </button>
        </div>
      </header>

      {/* 若存在活跃的 serve-question 视觉方向选择任务，置顶展示可视化选卡 */}
      {activeQuestion ? (
        <section className="dsh-imp-question-banner">
          <div className="dsh-imp-question-head">
            <span className="dsh-imp-tag is-accent">{t('studio.question.badge')}</span>
            <h3 className="dsh-imp-h3">{activeQuestion.payload.title || 'Choose Visual Direction'}</h3>
          </div>
          {activeQuestion.payload.question ? (
            <p className="dsh-imp-desc">{activeQuestion.payload.question}</p>
          ) : null}
          <div className="dsh-imp-question-grid">
            {activeQuestion.payload.options.map(opt => (
              <div key={opt.id} className="dsh-imp-card dsh-imp-direction-card">
                <div className="dsh-imp-row-between">
                  <strong>{opt.label}</strong>
                  {opt.kicker ? <span className="dsh-imp-tag is-accent">{opt.kicker}</span> : null}
                </div>
                {opt.lineage ? <div className="dsh-imp-muted-sm">{opt.lineage}</div> : null}
                {opt.thesis ? <p className="dsh-imp-thesis">{opt.thesis}</p> : null}
                {Array.isArray(opt.palette) && opt.palette.length > 0 ? (
                  <div className="dsh-imp-swatch-strip">
                    {opt.palette.map((color, idx) => (
                      <span
                        key={idx}
                        className="dsh-imp-swatch-dot"
                        style={{ background: color }}
                        title={color}
                      />
                    ))}
                  </div>
                ) : null}
                {Array.isArray(opt.materials) && opt.materials.length > 0 ? (
                  <div className="dsh-imp-pills">
                    {opt.materials.map(m => (
                      <span key={m} className="dsh-imp-tag">{m}</span>
                    ))}
                  </div>
                ) : null}
                {opt.viewport ? <div className="dsh-imp-muted-sm">Viewport: {opt.viewport}</div> : null}
                {opt.risk ? <div className="dsh-imp-muted-sm">Risk: {opt.risk}</div> : null}
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-primary dsh-imp-compact"
                  onClick={() => void handleAnswerQuestion(activeQuestion.key, opt.id)}
                >
                  {t('studio.question.choose')}
                </button>
              </div>
            ))}
          </div>
          <div className="dsh-imp-question-footer">
            {activeQuestion.payload.steer ? (
              <input
                type="text"
                className="dsh-imp-input"
                placeholder={t('studio.question.steerPlaceholder')}
                value={questionSteer}
                onChange={e => setQuestionSteer(e.target.value)}
              />
            ) : null}
            <div className="dsh-imp-actions-row">
              {activeQuestion.payload.reroll ? (
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
                  onClick={() => void handleAnswerQuestion(activeQuestion.key, 'reroll')}
                >
                  {t('studio.question.reroll')}
                </button>
              ) : null}
              {activeQuestion.payload.canon ? (
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
                  onClick={() => void handleAnswerQuestion(activeQuestion.key, 'canon')}
                >
                  {t('studio.question.canon')}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* 4 个核心子视图切换 Tab */}
      <nav className="dsh-imp-subtabs" role="tablist">
        {(
          [
            ['system', t('studio.subtab.system')],
            ['health', t('studio.subtab.health')],
            ['artifacts', t('studio.subtab.artifacts')],
            ['launchpad', t('studio.subtab.launchpad')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className="dsh-imp-subtab"
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* 子视图 1：Design System（视觉规范画板） */}
      {activeTab === 'system' ? (
        <div className="dsh-imp-pane">
          {!designJson && !overview?.artifacts.hasDesignMd ? (
            <div className="dsh-imp-card dsh-imp-empty-card">
              <h3 className="dsh-imp-h3">{t('studio.empty.title')}</h3>
              <p className="dsh-imp-desc">{t('studio.empty.desc')}</p>
              <div className="dsh-imp-actions-row">
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-primary"
                  onClick={() => void handleSteerCommand('init')}
                >
                  {t('studio.empty.initBtn')}
                </button>
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-secondary"
                  onClick={() => void handleSteerCommand('document')}
                >
                  {t('studio.empty.docBtn')}
                </button>
              </div>
            </div>
          ) : null}

          {narrative ? (
            <section className="dsh-imp-card">
              <div className="dsh-imp-row-between">
                <span className="dsh-imp-eyebrow">{t('studio.system.northStar')}</span>
                {typeof designJson?.title === 'string' ? (
                  <span className="dsh-imp-tag">{designJson.title}</span>
                ) : null}
              </div>
              <h2 className="dsh-imp-h2">{String(narrative.northStar ?? designJson?.title ?? 'Design System')}</h2>
              {typeof narrative.overview === 'string' ? (
                <p className="dsh-imp-desc dsh-imp-preline">{narrative.overview}</p>
              ) : null}
              {Array.isArray(narrative.keyCharacteristics) && narrative.keyCharacteristics.length > 0 ? (
                <div className="dsh-imp-pills">
                  {narrative.keyCharacteristics.map((item, i) => (
                    <span key={i} className="dsh-imp-tag">{String(item)}</span>
                  ))}
                </div>
              ) : null}
              <div className="dsh-imp-two-col">
                {Array.isArray(narrative.dos) && narrative.dos.length > 0 ? (
                  <div className="dsh-imp-rule-box is-do">
                    <h4>{t('studio.system.dos')}</h4>
                    <ul>
                      {narrative.dos.map((d, i) => (
                        <li key={i}>{String(d).replace(/\*\*/gu, '')}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(narrative.donts) && narrative.donts.length > 0 ? (
                  <div className="dsh-imp-rule-box is-dont">
                    <h4>{t('studio.system.donts')}</h4>
                    <ul>
                      {narrative.donts.map((d, i) => (
                        <li key={i}>{String(d).replace(/\*\*/gu, '')}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {colorMeta && Object.keys(colorMeta).length > 0 ? (
            <section className="dsh-imp-card">
              <h3 className="dsh-imp-h3">{t('studio.system.colors')}</h3>
              <div className="dsh-imp-color-grid">
                {Object.entries(colorMeta).map(([key, meta]) => {
                  const ramp = Array.isArray(meta.tonalRamp) ? (meta.tonalRamp as string[]) : []
                  return (
                    <div key={key} className="dsh-imp-color-card">
                      <div className="dsh-imp-row-between">
                        <strong>{String(meta.displayName ?? key)}</strong>
                        <code className="dsh-imp-tag">{key}</code>
                      </div>
                      {ramp.length > 0 ? (
                        <div className="dsh-imp-ramp">
                          {ramp.map((swatch, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="dsh-imp-ramp-step"
                              style={{ background: swatch }}
                              title={`${swatch} (click to copy)`}
                              onClick={() => {
                                void navigator.clipboard?.writeText(swatch)
                                showNotice(`${t('studio.system.copied')}: ${swatch}`)
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {typographyMeta || shadows.length > 0 || motion.length > 0 || breakpoints.length > 0 ? (
            <section className="dsh-imp-card">
              <h3 className="dsh-imp-h3">{t('studio.system.tokens')}</h3>
              <div className="dsh-imp-two-col">
                {typographyMeta && Object.keys(typographyMeta).length > 0 ? (
                  <div className="dsh-imp-token-group">
                    <h4>{t('studio.system.typography')}</h4>
                    {Object.entries(typographyMeta).map(([role, info]) => (
                      <div key={role} className="dsh-imp-token-row">
                        <code>{role}</code>
                        <span>{String(info.displayName ?? '')} — {String(info.purpose ?? '')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {shadows.length > 0 ? (
                  <div className="dsh-imp-token-group">
                    <h4>{t('studio.system.shadows')}</h4>
                    {shadows.map((s, i) => (
                      <div key={i} className="dsh-imp-token-row">
                        <code>{String(s.name ?? i)}</code>
                        <span>{String(s.purpose ?? s.value ?? '')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {motion.length > 0 ? (
                  <div className="dsh-imp-token-group">
                    <h4>{t('studio.system.motion')}</h4>
                    {motion.map((m, i) => (
                      <div key={i} className="dsh-imp-token-row">
                        <code>{String(m.name ?? i)}: {String(m.value ?? '')}</code>
                        <span>{String(m.purpose ?? '')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {breakpoints.length > 0 ? (
                  <div className="dsh-imp-token-group">
                    <h4>{t('studio.system.breakpoints')}</h4>
                    {breakpoints.map((b, i) => (
                      <div key={i} className="dsh-imp-token-row">
                        <code>{String(b.name ?? i)}</code>
                        <span>{String(b.value ?? '')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {components.length > 0 ? (
            <section className="dsh-imp-card">
              <h3 className="dsh-imp-h3">{t('studio.system.components')}</h3>
              <div className="dsh-imp-component-grid">
                {components.map((comp, idx) => {
                  const html = typeof comp.html === 'string' ? comp.html : ''
                  const cssText = typeof comp.css === 'string' ? comp.css : ''
                  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:12px;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:flex-start}${cssText}</style></head><body>${html}</body></html>`
                  return (
                    <div key={idx} className="dsh-imp-specimen">
                      <div className="dsh-imp-row-between">
                        <strong>{String(comp.name ?? `Component ${idx + 1}`)}</strong>
                        {comp.kind ? <code className="dsh-imp-tag">{String(comp.kind)}</code> : null}
                      </div>
                      {comp.description ? (
                        <p className="dsh-imp-muted-sm">{String(comp.description)}</p>
                      ) : null}
                      {html ? (
                        <iframe
                          title={String(comp.name ?? idx)}
                          sandbox=""
                          srcDoc={srcDoc}
                          className="dsh-imp-specimen-frame"
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {(overview?.artifacts.mocks.length ?? 0) > 0 ? (
            <section className="dsh-imp-card">
              <h3 className="dsh-imp-h3">{t('studio.system.mocks')}</h3>
              <div className="dsh-imp-component-grid">
                {overview!.artifacts.mocks.map(mock => {
                  const imgUrl = `${API_BASE}/asset?cwd=${encodeURIComponent(overview!.projectRoot)}&path=${encodeURIComponent(mock.relPath)}`
                  return (
                    <div key={mock.relPath} className="dsh-imp-specimen">
                      <div className="dsh-imp-row-between">
                        <strong>{mock.name}</strong>
                        {mock.approved ? (
                          <span className="dsh-imp-tag is-accent">{t('studio.system.approved')}</span>
                        ) : null}
                      </div>
                      <img src={imgUrl} alt={mock.name} className="dsh-imp-mock-img" loading="lazy" />
                      {mock.prompt ? <p className="dsh-imp-muted-sm">{mock.prompt}</p> : null}
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* 子视图 2：Doctor & Detector（体检与守卫） */}
      {activeTab === 'health' ? (
        <div className="dsh-imp-pane">
          {/* Doctor 健康度 */}
          <section className="dsh-imp-card">
            <div className="dsh-imp-row-between">
              <h3 className="dsh-imp-h3">{t('studio.health.doctorTitle')}</h3>
              <div className="dsh-imp-actions-row">
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
                  onClick={() => void handleDoctorRun(false)}
                >
                  {t('studio.health.runDoctor')}
                </button>
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-primary dsh-imp-compact"
                  onClick={() => void handleDoctorRun(true)}
                >
                  {t('studio.health.autoFix')}
                </button>
              </div>
            </div>
            {doctorFindings.length === 0 ? (
              <p className="dsh-imp-ok-msg">✓ {t('studio.health.doctorClean')}</p>
            ) : (
              <ul className="dsh-imp-finding-list">
                {doctorFindings.map((f, i) => (
                  <li key={i} className="dsh-imp-finding-item">
                    <div className="dsh-imp-row-between">
                      <code className="dsh-imp-tag">{String(f.id ?? 'drift')}</code>
                      {f.severity ? <span className="dsh-imp-tag">{String(f.severity)}</span> : null}
                    </div>
                    <p className="dsh-imp-desc">{String(f.message ?? '')}</p>
                    {f.fix ? <p className="dsh-imp-muted-sm">Fix: {String(f.fix)}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 静态反模式扫描器 + 项目级 Hook 开关 */}
          <section className="dsh-imp-card">
            <div className="dsh-imp-row-between">
              <h3 className="dsh-imp-h3">{t('studio.health.detectorTitle')}</h3>
              <div className="dsh-imp-actions-row">
                <span className="dsh-imp-muted-sm">{t('studio.health.projectHook')}:</span>
                <button
                  type="button"
                  className={`dsh-imp-btn dsh-imp-compact ${projectHookEnabled ? 'dsh-imp-primary' : 'dsh-imp-secondary'}`}
                  onClick={() => void handleProjectHookAction(projectHookEnabled ? 'off' : 'on')}
                >
                  {projectHookEnabled ? t('studio.health.hookOn') : t('studio.health.hookOff')}
                </button>
              </div>
            </div>
            <div className="dsh-imp-scan-bar">
              <input
                type="text"
                className="dsh-imp-input"
                placeholder={t('studio.health.scanTargetPlaceholder')}
                value={scanTarget}
                onChange={e => setScanTarget(e.target.value)}
              />
              <button
                type="button"
                className="dsh-imp-btn dsh-imp-primary"
                disabled={scanning}
                onClick={() => void handleRunScan()}
              >
                {scanning ? t('studio.health.scanning') : t('studio.health.scanNow')}
              </button>
            </div>

            {scanReport ? (
              scanReport.totalFindings === 0 ? (
                <p className="dsh-imp-ok-msg">
                  ✓ {formatText(t('studio.health.scanClean'), { count: scanReport.scannedFiles })}
                </p>
              ) : (
                <div className="dsh-imp-scan-results">
                  <p className="dsh-imp-desc">
                    {formatText(t('studio.health.scanSummary'), {
                      scanned: scanReport.scannedFiles,
                      total: scanReport.totalFindings,
                    })}
                  </p>
                  {scanReport.groups.map(group => (
                    <div key={group.relFile} className="dsh-imp-file-group">
                      <div className="dsh-imp-row-between">
                        <code>{group.relFile} ({group.findings.length})</code>
                        <div className="dsh-imp-actions-row">
                          <button
                            type="button"
                            className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
                            onClick={() => void handleProjectHookAction('ignore-file', { file: group.relFile })}
                          >
                            {t('studio.health.ignoreFile')}
                          </button>
                          <button
                            type="button"
                            className="dsh-imp-btn dsh-imp-primary dsh-imp-compact"
                            onClick={() => {
                              const summary = group.findings
                                .map(f => `- [L${f.line ?? '?'}] ${f.id}: ${f.message ?? ''}`)
                                .join('\n')
                              void handleSteerCommand(
                                'polish',
                                group.relFile,
                                `请修复 \`${group.relFile}\` 中由 Impeccable Detector 扫描出的以下 UI 设计反模式违例：\n\n${summary}`,
                              )
                            }}
                          >
                            {t('studio.health.fixWithAgent')}
                          </button>
                        </div>
                      </div>
                      <ul className="dsh-imp-finding-list">
                        {group.findings.map((f, idx) => (
                          <li key={idx} className="dsh-imp-finding-item">
                            <div className="dsh-imp-row-between">
                              <div>
                                <code className="dsh-imp-tag">L{f.line ?? '?'}</code>{' '}
                                <strong>{f.id}</strong>
                                {f.value ? <code className="dsh-imp-tag">{f.value}</code> : null}
                              </div>
                              <button
                                type="button"
                                className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
                                onClick={() => void handleProjectHookAction('ignore-rule', { rule: f.id })}
                              >
                                {t('studio.health.ignoreRule')}
                              </button>
                            </div>
                            {f.message ? <p className="dsh-imp-desc">{f.message}</p> : null}
                            {f.fix ? <p className="dsh-imp-muted-sm">Fix: {f.fix}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </section>

          {/* Critique 历史评分趋势 */}
          <section className="dsh-imp-card">
            <h3 className="dsh-imp-h3">{t('studio.health.critiqueHistory')}</h3>
            {(overview?.artifacts.critiques.length ?? 0) === 0 ? (
              <p className="dsh-imp-muted-sm">{t('studio.health.noCritique')}</p>
            ) : (
              <div className="dsh-imp-component-grid">
                {overview!.artifacts.critiques.map(c => (
                  <div key={c.file} className="dsh-imp-specimen">
                    <div className="dsh-imp-row-between">
                      <strong>{c.slug}</strong>
                      {c.score !== null ? <span className="dsh-imp-tag is-accent">Score: {c.score}</span> : null}
                    </div>
                    <div className="dsh-imp-muted-sm">
                      {c.timestamp} · P0: {c.p0 ?? 0} · P1: {c.p1 ?? 0}
                    </div>
                    <p className="dsh-imp-muted-sm">{c.excerpt}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* 子视图 3：Artifacts & Surfaces（物料文档编辑） */}
      {activeTab === 'artifacts' ? (
        <div className="dsh-imp-pane">
          <section className="dsh-imp-card">
            <div className="dsh-imp-artifact-bar">
              <div className="dsh-imp-pills">
                {['PRODUCT.md', 'DESIGN.md', '.impeccable/design.json', '.impeccable/config.json'].map(file => (
                  <button
                    key={file}
                    type="button"
                    className={`dsh-imp-btn dsh-imp-compact ${selectedArtifact === file ? 'dsh-imp-primary' : 'dsh-imp-secondary'}`}
                    onClick={() => void loadArtifact(file)}
                  >
                    {file}
                  </button>
                ))}
                {(overview?.artifacts.surfaces ?? []).map(s => (
                  <button
                    key={s.relPath}
                    type="button"
                    className={`dsh-imp-btn dsh-imp-compact ${selectedArtifact === s.relPath ? 'dsh-imp-primary' : 'dsh-imp-secondary'}`}
                    onClick={() => void loadArtifact(s.relPath)}
                  >
                    surface:{s.name}
                  </button>
                ))}
              </div>
              <div className="dsh-imp-actions-row">
                <input
                  type="text"
                  className="dsh-imp-input dsh-imp-input-sm"
                  placeholder={t('studio.artifacts.newSurfacePlaceholder')}
                  value={newSurfaceName}
                  onChange={e => setNewSurfaceName(e.target.value)}
                />
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
                  onClick={() => {
                    const slug = newSurfaceName.trim().replace(/[^a-zA-Z0-9_-]/gu, '-')
                    if (!slug) return
                    const rel = `.impeccable/surfaces/${slug}.md`
                    setNewSurfaceName('')
                    setSelectedArtifact(rel)
                    setArtifactExists(false)
                    setArtifactContent(`---\nmode: Operate\n---\n\n# Surface: ${slug}\n\n`)
                    setArtifactSavedContent('')
                  }}
                >
                  + {t('studio.artifacts.createSurface')}
                </button>
              </div>
            </div>

            <div className="dsh-imp-row-between">
              <div className="dsh-imp-actions-row">
                <code>{selectedArtifact}</code>
                {!artifactExists ? <span className="dsh-imp-tag">{t('studio.artifacts.missing')}</span> : null}
                {artifactContent !== artifactSavedContent ? (
                  <span className="dsh-imp-tag is-accent">{t('studio.artifacts.unsaved')}</span>
                ) : null}
              </div>
              <div className="dsh-imp-actions-row">
                <button
                  type="button"
                  className={`dsh-imp-btn dsh-imp-compact ${artifactMode === 'edit' ? 'dsh-imp-primary' : 'dsh-imp-secondary'}`}
                  onClick={() => setArtifactMode('edit')}
                >
                  {t('studio.artifacts.edit')}
                </button>
                <button
                  type="button"
                  className={`dsh-imp-btn dsh-imp-compact ${artifactMode === 'preview' ? 'dsh-imp-primary' : 'dsh-imp-secondary'}`}
                  onClick={() => setArtifactMode('preview')}
                >
                  {t('studio.artifacts.preview')}
                </button>
                <button
                  type="button"
                  className="dsh-imp-btn dsh-imp-primary dsh-imp-compact"
                  disabled={savingArtifact}
                  onClick={() => void handleSaveArtifact()}
                >
                  {savingArtifact ? t('studio.artifacts.saving') : t('studio.artifacts.save')}
                </button>
              </div>
            </div>

            {artifactMode === 'edit' ? (
              <textarea
                className="dsh-imp-editor-textarea"
                value={artifactContent}
                onChange={e => setArtifactContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault()
                    void handleSaveArtifact()
                  }
                }}
              />
            ) : (
              <pre className="dsh-imp-preview-box">{artifactContent}</pre>
            )}
          </section>
        </div>
      ) : null}

      {/* 子视图 4：Command Launchpad（动作发射台） */}
      {activeTab === 'launchpad' ? (
        <div className="dsh-imp-pane">
          <section className="dsh-imp-card">
            <div className="dsh-imp-two-col">
              <label className="dsh-imp-field">
                <span className="dsh-imp-label">{t('studio.launchpad.targetLabel')}</span>
                <input
                  type="text"
                  className="dsh-imp-input"
                  placeholder={t('studio.launchpad.targetPlaceholder')}
                  value={launchTarget}
                  onChange={e => setLaunchTarget(e.target.value)}
                />
              </label>
              <label className="dsh-imp-field">
                <span className="dsh-imp-label">{t('studio.launchpad.extraLabel')}</span>
                <input
                  type="text"
                  className="dsh-imp-input"
                  placeholder={t('studio.launchpad.extraPlaceholder')}
                  value={launchExtra}
                  onChange={e => setLaunchExtra(e.target.value)}
                />
              </label>
            </div>
            <div className="dsh-imp-pills">
              {['All', 'Build', 'Evaluate', 'Refine', 'Enhance', 'Fix', 'Iterate'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  className={`dsh-imp-btn dsh-imp-compact ${launchCategory === cat ? 'dsh-imp-primary' : 'dsh-imp-secondary'}`}
                  onClick={() => setLaunchCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          <div className="dsh-imp-cmd-grid">
            {(overview?.subcommands ?? [])
              .filter(c => launchCategory === 'All' || c.category === launchCategory)
              .map(cmd => {
                const combinedArgs = [launchTarget.trim(), launchExtra.trim()].filter(Boolean).join(' ')
                const isPinned = pinnedSet.has(cmd.name)
                return (
                  <div key={cmd.name} className="dsh-imp-card dsh-imp-cmd-card">
                    <div className="dsh-imp-row-between">
                      <code className="dsh-imp-cmd-name">/{cmd.name}</code>
                      <div className="dsh-imp-pills">
                        <span className="dsh-imp-tag">{cmd.category}</span>
                        {isPinned ? (
                          <span className="dsh-imp-tag is-accent">{t('studio.launchpad.pinned')}</span>
                        ) : null}
                      </div>
                    </div>
                    <p className="dsh-imp-desc">{cmd.descriptionZh}</p>
                    <p className="dsh-imp-muted-sm">{cmd.description}</p>
                    <div className="dsh-imp-cmd-footer">
                      <button
                        type="button"
                        className="dsh-imp-btn dsh-imp-primary dsh-imp-compact"
                        onClick={() => void handleSteerCommand(cmd.name, combinedArgs)}
                      >
                        {t('studio.launchpad.run')}
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 设置页分区（settings.section）：管理全局 Hook 开关、顶栏 Tab 开关与 Pin 命令勾选矩阵。
 */
export function ImpeccableSettingsSection({ t }: { t: Translate }): ReactElement {
  const [config, setConfig] = useState<GlobalConfig>({
    hookEnabled: true,
    stopDeepPass: true,
    showConversationTab: true,
    pinnedCommands: ['critique', 'audit', 'polish', 'shape'],
  })
  const [subcommands, setSubcommands] = useState<SubcommandItem[]>([])
  const [saving, setSaving] = useState<boolean>(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/config`)
        if (!res.ok) return
        const data = (await res.json()) as {
          ok: boolean
          globalConfig: GlobalConfig
          subcommands: SubcommandItem[]
        }
        if (data.ok) {
          setConfig(data.globalConfig)
          setSubcommands(data.subcommands)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const togglePinned = (name: string): void => {
    setConfig((prev) => {
      const set = new Set(prev.pinnedCommands)
      if (set.has(name)) set.delete(name)
      else set.add(name)
      return { ...prev, pinnedCommands: Array.from(set) }
    })
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setStatusMsg(null)
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ globalConfig: config }),
      })
      const data = (await res.json()) as { ok: boolean; globalConfig?: GlobalConfig }
      if (data.ok && data.globalConfig) {
        setConfig(data.globalConfig)
        setStatusMsg(t('settings.saved'))
        window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT, { detail: data.globalConfig }))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="dsh-imp-settings">
      <div className="dsh-imp-row-between">
        <div>
          <h3 className="dsh-imp-h3">{t('settings.title')}</h3>
          <p className="dsh-imp-muted-sm">{t('settings.subtitle')}</p>
        </div>
        <div className="dsh-imp-actions-row">
          {statusMsg ? <span className="dsh-imp-toast">{statusMsg}</span> : null}
          <button
            type="button"
            className="dsh-imp-btn dsh-imp-secondary dsh-imp-compact"
            onClick={() =>
              setConfig({
                hookEnabled: true,
                stopDeepPass: true,
                showConversationTab: true,
                pinnedCommands: ['critique', 'audit', 'polish', 'shape'],
              })
            }
          >
            {t('settings.resetDefault')}
          </button>
          <button
            type="button"
            className="dsh-imp-btn dsh-imp-primary dsh-imp-compact"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>

      <div className="dsh-imp-card">
        <label className="dsh-imp-toggle-row">
          <input
            type="checkbox"
            checked={config.hookEnabled}
            onChange={e => setConfig(prev => ({ ...prev, hookEnabled: e.target.checked }))}
          />
          <div>
            <strong>{t('settings.hookEnabled')}</strong>
            <p className="dsh-imp-muted-sm">{t('settings.hookEnabledDesc')}</p>
          </div>
        </label>

        <label className="dsh-imp-toggle-row">
          <input
            type="checkbox"
            checked={config.stopDeepPass}
            disabled={!config.hookEnabled}
            onChange={e => setConfig(prev => ({ ...prev, stopDeepPass: e.target.checked }))}
          />
          <div>
            <strong>{t('settings.stopDeepPass')}</strong>
            <p className="dsh-imp-muted-sm">{t('settings.stopDeepPassDesc')}</p>
          </div>
        </label>

        <label className="dsh-imp-toggle-row">
          <input
            type="checkbox"
            checked={config.showConversationTab}
            onChange={e => setConfig(prev => ({ ...prev, showConversationTab: e.target.checked }))}
          />
          <div>
            <strong>{t('settings.showTab')}</strong>
            <p className="dsh-imp-muted-sm">{t('settings.showTabDesc')}</p>
          </div>
        </label>
      </div>

      <div className="dsh-imp-card">
        <strong>{t('settings.pinnedTitle')}</strong>
        <p className="dsh-imp-muted-sm">{t('settings.pinnedDesc')}</p>
        <div className="dsh-imp-pin-grid">
          {subcommands.map((cmd) => {
            const checked = config.pinnedCommands.includes(cmd.name)
            return (
              <label key={cmd.name} className={`dsh-imp-pin-item ${checked ? 'is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePinned(cmd.name)}
                />
                <code>/{cmd.name}</code>
                <span className="dsh-imp-muted-sm">{cmd.descriptionZh}</span>
              </label>
            )
          })}
        </div>
      </div>
    </section>
  )
}
