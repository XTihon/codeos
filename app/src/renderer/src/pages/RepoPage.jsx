import React, { useState, useRef } from 'react'
import {
  GitBranch, FolderOpen, Search, Loader2, CheckCircle2,
  Code2, Package, Terminal, FileText, Zap, AlertTriangle,
  ChevronRight, Copy, Check, Plus, Bot
} from 'lucide-react'
import { api } from '../api'

const AGENT_INFO = {
  'developer':        { icon: '💻', desc: 'Пишет код, создаёт компоненты, реализует логику' },
  'tester':           { icon: '🧪', desc: 'Пишет тесты, находит баги, проверяет покрытие' },
  'code-reviewer':    { icon: '🔍', desc: 'Ревьюит код, ищет проблемы, предлагает улучшения' },
  'devops':           { icon: '⚙️', desc: 'CI/CD, Docker, деплой, инфраструктура' },
  'security-auditor': { icon: '🔒', desc: 'Аудит безопасности, уязвимости, OWASP' },
  'documenter':       { icon: '📝', desc: 'Документация, README, API-docs, комментарии' },
  'translator':       { icon: '🌐', desc: 'Локализация, перевод интерфейса и текстов' },
  'performance':      { icon: '⚡', desc: 'Профилирование, оптимизация скорости и памяти' },
  'business-analyst': { icon: '📊', desc: 'Анализ требований, декомпозиция задач' },
  'marketer':         { icon: '📣', desc: 'Тексты для продвижения, описания, рекламные материалы' },
  'seo':              { icon: '🔎', desc: 'SEO-оптимизация, мета-теги, структура для поиска' },
  'copywriter':       { icon: '✍️', desc: 'Продающие тексты, UX-копирайтинг, контент' },
  'ui-designer':      { icon: '🎨', desc: 'Дизайн-спецификации, цвета, компоненты, UX' },
  'investor-brief':   { icon: '💰', desc: 'Питч-дек, executive summary, метрики для инвесторов' },
  'video-editor':     { icon: '🎬', desc: 'Сценарии для видео, монтажные инструкции' },
  'orchestrator':     { icon: '🧠', desc: 'Оркестрирует цепочку агентов, строит план' },
}

const STEP_LABELS = [
  { key: 'clone',   icon: GitBranch, label: 'Клонирование' },
  { key: 'scan',    icon: Search,    label: 'Сканирование файлов' },
  { key: 'analyze', icon: Zap,       label: 'Анализ через Claude' },
  { key: 'done',    icon: CheckCircle2, label: 'Готово' },
]

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="text-muted hover:text-accent transition-colors">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function InfoCard({ icon: Icon, title, children, accent }) {
  return (
    <div className={`card p-4 ${accent ? 'border-accent/30 bg-accent-muted' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className={accent ? 'text-accent' : 'text-text-dim'} />
        <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function RepoPage() {
  const [input, setInput] = useState('')
  const [step, setStep] = useState(null)   // null | 'clone' | 'scan' | 'analyze' | 'done' | 'error'
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const logRef = useRef(null)
  const [logs, setLogs] = useState([])
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState(null)  // {connected_agents, already_existed, path}

  const addLog = (msg) => setLogs(p => [...p, msg])

  const addToLibrary = async () => {
    if (!result) return
    setAdding(true)
    try {
      const res = await api.post('/repo/add', {
        source: input.trim(),
        name: result.name,
        suggested_agents: result.suggested_agents || [],
        purpose: result.description?.slice(0, 80) || result.name,
        detail: result.description || '',
        tags: result.tags || [],
      })
      setAddResult(res)
    } catch (e) {
      setAddResult({ error: e.message })
    } finally {
      setAdding(false)
    }
  }

  const analyze = async () => {
    if (!input.trim()) return
    setResult(null)
    setError('')
    setLogs([])
    setAddResult(null)

    try {
      setStep('clone')
      addLog(`Источник: ${input.trim()}`)
      addLog('Подключаемся к репозиторию...')

      const res = await api.post('/repo/analyze', { source: input.trim() })

      if (res.error) { setError(res.error); setStep('error'); return }

      setStep('scan')
      addLog(`Найдено файлов: ${res.file_count}`)
      addLog(`Размер: ${res.size_kb} KB`)

      setStep('analyze')
      addLog('Claude анализирует структуру...')

      setStep('done')
      addLog('Анализ завершён ✓')
      setResult(res)

    } catch (e) {
      setError(`Ошибка: ${e.message}`)
      setStep('error')
    }
  }

  const isLoading = step && step !== 'done' && step !== 'error'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <h1 className="text-lg font-semibold text-text-base">Репозиторий</h1>
        <p className="text-xs text-muted mt-0.5">Клонируй и анализируй проект за секунды</p>

        {/* Input */}
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <GitBranch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isLoading && analyze()}
              placeholder="https://github.com/user/repo   или   C:\Dev\my-project"
              className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-base
                         placeholder-muted outline-none transition-all duration-150
                         focus:border-accent focus:shadow-warm"
            />
          </div>
          <button
            onClick={analyze}
            disabled={isLoading || !input.trim()}
            className="btn-primary disabled:opacity-50 whitespace-nowrap"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {isLoading ? 'Анализирую...' : 'Анализировать'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Steps progress */}
        {step && (
          <div className="px-6 pt-5">
            <div className="flex items-center gap-0 mb-6">
              {STEP_LABELS.map((s, i) => {
                const stepOrder = ['clone','scan','analyze','done']
                const currentIdx = stepOrder.indexOf(step)
                const thisIdx = stepOrder.indexOf(s.key)
                const done    = step === 'done' || thisIdx < currentIdx
                const active  = s.key === step && step !== 'done'
                return (
                  <React.Fragment key={s.key}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        done   ? 'bg-success text-white' :
                        active ? 'bg-accent text-white' :
                                 'bg-surface-2 text-muted border border-border'
                      }`}>
                        {active
                          ? <Loader2 size={11} className="animate-spin" />
                          : done
                            ? <CheckCircle2 size={11} />
                            : <s.icon size={11} />
                        }
                      </div>
                      <span className={`text-xs whitespace-nowrap ${
                        done ? 'text-success' : active ? 'text-accent' : 'text-muted'
                      }`}>{s.label}</span>
                    </div>
                    {i < STEP_LABELS.length - 1 && (
                      <div className={`flex-1 h-px mx-2 ${
                        thisIdx < currentIdx || step === 'done' ? 'bg-success/40' : 'bg-border'
                      }`} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>

            {/* Log */}
            <div className="card p-3 mb-5 font-mono text-xs space-y-0.5 max-h-28 overflow-y-auto" ref={logRef}>
              {logs.map((l, i) => (
                <div key={i} className="text-text-dim leading-5">
                  <span className="text-muted mr-2">{'>'}</span>{l}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="mx-6 p-4 bg-danger/10 border border-danger/30 rounded-xl flex items-start gap-3">
            <AlertTriangle size={15} className="text-danger mt-0.5 shrink-0" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="px-6 pb-6 space-y-4">
            {/* Summary hero */}
            <div className="card p-5 border-accent/30 bg-accent-muted">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-text-base mb-1">{result.name}</h2>
                  <p className="text-sm text-text-dim leading-relaxed">{result.description}</p>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {result.tags?.map(t => (
                      <span key={t} className="tag tag-orange">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0">
                  {addResult?.success ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/30 rounded-lg">
                      <CheckCircle2 size={13} className="text-success" />
                      <span className="text-xs text-success font-medium">
                        {addResult.already_existed ? 'Уже в библиотеке' : 'Добавлено'}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={addToLibrary}
                      disabled={adding}
                      className="btn-primary disabled:opacity-50"
                    >
                      {adding
                        ? <><Loader2 size={13} className="animate-spin" />Добавляю...</>
                        : <><Plus size={13} />Добавить в библиотеку</>
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Connected agents result */}
            {addResult?.success && !addResult.already_existed && (
              <div className="card p-4 border-success/30 bg-success/5">
                <div className="flex items-start gap-3">
                  <Bot size={15} className="text-success mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-success mb-2">
                      Репозиторий сохранён в <span className="font-mono">{addResult.path}</span>
                    </p>
                    {addResult.connected_agents?.length > 0 ? (
                      <>
                        <p className="text-xs text-text-dim mb-1.5">Подключён к агентам:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {addResult.connected_agents.map(a => (
                            <span key={a} className="tag tag-orange">{a}</span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted">Агенты не были подключены (уже подключены или не найдены)</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {addResult?.error && (
              <div className="card p-3 border-danger/30 bg-danger/5 flex items-center gap-2">
                <AlertTriangle size={13} className="text-danger shrink-0" />
                <p className="text-xs text-danger">{addResult.error}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Tech stack */}
              <InfoCard icon={Code2} title="Стек">
                <div className="flex flex-wrap gap-1.5">
                  {result.stack?.map(s => (
                    <span key={s} className="tag tag-muted">{s}</span>
                  ))}
                </div>
              </InfoCard>

              {/* Stats */}
              <InfoCard icon={Package} title="Статистика">
                <div className="space-y-1.5">
                  {[
                    { label: 'Файлов',   value: result.file_count },
                    { label: 'Размер',   value: `${result.size_kb} KB` },
                    { label: 'Язык',     value: result.primary_language },
                    { label: 'Лицензия', value: result.license || '—' },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between text-xs">
                      <span className="text-muted">{r.label}</span>
                      <span className="text-text-dim font-mono">{r.value}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>
            </div>

            {/* Install */}
            {result.install_steps?.length > 0 && (
              <InfoCard icon={Terminal} title="Установка и запуск" accent>
                <div className="space-y-2">
                  {result.install_steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-accent font-mono text-xs mt-0.5 shrink-0">{i + 1}.</span>
                      <div className="flex-1">
                        <p className="text-xs text-text-dim mb-1">{step.label}</p>
                        {step.cmd && (
                          <div className="flex items-center gap-2 bg-bg rounded-lg px-3 py-1.5 font-mono text-xs">
                            <span className="text-success flex-1">{step.cmd}</span>
                            <CopyBtn text={step.cmd} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </InfoCard>
            )}

            {/* Entry points */}
            {result.entry_points?.length > 0 && (
              <InfoCard icon={FileText} title="Точки входа">
                <div className="space-y-1">
                  {result.entry_points.map((ep, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <ChevronRight size={11} className="text-accent shrink-0" />
                      <span className="text-xs font-mono text-text-dim">{ep.path}</span>
                      <span className="text-xs text-muted">— {ep.desc}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>
            )}

            {/* Suggested agents */}
            {result.suggested_agents?.length > 0 && (
              <InfoCard icon={Zap} title="Рекомендуемые агенты для работы" accent>
                <div className="space-y-2">
                  {result.suggested_agents.map(a => {
                    const info = AGENT_INFO[a] || { icon: '🤖', desc: 'Специализированный агент' }
                    return (
                      <div key={a} className="flex items-center gap-3 p-2.5 bg-bg rounded-lg border border-border">
                        <span className="text-xl w-7 text-center shrink-0">{info.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-text-base">{a}</p>
                          <p className="text-xs text-muted mt-0.5">{info.desc}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted mt-3">
                  Оркестратор автоматически выберет этих агентов при создании проекта с этим репозиторием
                </p>
              </InfoCard>
            )}
          </div>
        )}

        {/* Empty state */}
        {!step && (
          <div className="flex flex-col items-center justify-center h-full py-24 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border
                            flex items-center justify-center mb-4">
              <GitBranch size={26} className="text-muted" />
            </div>
            <p className="text-text-dim text-sm font-medium mb-1">Вставь ссылку на репозиторий</p>
            <p className="text-muted text-xs leading-relaxed max-w-xs">
              GitHub URL или локальный путь. Claude проанализирует структуру, стек,
              скажет как установить и запустить.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
