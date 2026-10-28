import React, { useState, useEffect, useRef } from 'react'
import { Play, FileText, Loader2, CheckCircle2, Circle, Terminal, Save, FolderOpen, Sparkles, Send } from 'lucide-react'
import { api, WS_BASE } from '../api'

const CLI_HELP = [
  { cmd: '/plan',   desc: 'Построить план проекта' },
  { cmd: '/run',    desc: 'Запустить цепочку агентов' },
  { cmd: '/status', desc: 'Показать статус агентов' },
  { cmd: '/clear',  desc: 'Очистить логи' },
  { cmd: '/help',   desc: 'Список команд' },
]

const AGENT_ICONS = {
  'business-analyst':'📊', developer:'💻', tester:'🧪',
  'code-reviewer':'🔍', devops:'⚙️', 'security-auditor':'🔒',
  documenter:'📝', translator:'🌐', performance:'⚡',
  'investor-brief':'💰', marketer:'📣', seo:'🔎',
  copywriter:'✍️', 'ui-designer':'🎨', 'video-editor':'🎬',
  orchestrator:'🧠',
}

const DRAFT_KEY = (id) => `codeos_draft_${id}`

export default function ProjectView({ project, isActive }) {
  const [plan, setPlan]                   = useState(null)
  const [logs, setLogs]                   = useState({})
  const [activeAgent, setActiveAgent]     = useState(null)
  const [completedAgents, setCompleted]   = useState(new Set())
  const [finalPath, setFinalPath]         = useState(project?.final_path || null)
  const [status, setStatus]               = useState(project?.status === 'done' ? 'done' : 'idle')
  const [buildingPlan, setBuildingPlan]   = useState(false)
  const [draftSaved, setDraftSaved]       = useState(false)
  const [cliInput, setCliInput]           = useState('')
  const [cliHistory, setCliHistory]       = useState([])
  const [cliHistIdx, setCliHistIdx]       = useState(-1)
  const [cliOutput, setCliOutput]         = useState([])
  const [showHelp, setShowHelp]           = useState(false)
  const [clarifyMode, setClarifyMode]     = useState(false)
  const [clarifyAnswers, setClarifyAnswers] = useState({})
  const [clarifying, setClarifying]       = useState(false)
  const logsEndRef  = useRef(null)
  const wsRef       = useRef(null)
  const cliRef      = useRef(null)
  const projectId   = project?.project_id || project?.id

  // Загружаем план + восстанавливаем прогресс из чекпоинтов
  useEffect(() => {
    if (!project) return

    if (project.plan_json) {
      try { setPlan(JSON.parse(project.plan_json)) } catch {}
    } else {
      const draft = localStorage.getItem(DRAFT_KEY(projectId))
      if (draft) {
        try { setPlan(JSON.parse(draft)); setDraftSaved(true) } catch {}
      }
    }

    // Восстанавливаем завершённые агенты и final_path из БД
    api.get(`/projects/${projectId}/checkpoints`).then(data => {
      if (data?.completed?.length) setCompleted(new Set(data.completed))
      if (data?.final_path) setFinalPath(data.final_path)
    }).catch(() => {})

    connectWs()
    return () => wsRef.current?.close()
  }, [projectId])

  useEffect(() => {
    if (!plan || !projectId) return
    localStorage.setItem(DRAFT_KEY(projectId), JSON.stringify(plan))
    setDraftSaved(true)
  }, [plan])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, activeAgent])

  useEffect(() => {
    const h = () => { if (isActive) cliRef.current?.focus() }
    window.addEventListener('codeos:focus-cli', h)
    return () => window.removeEventListener('codeos:focus-cli', h)
  }, [isActive])

  const connectWs = () => {
    const ws = new WebSocket(`${WS_BASE}/ws/${projectId}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'log') {
          setLogs(p => ({ ...p, [msg.agent]: [...(p[msg.agent] || []), msg.line] }))
          setActiveAgent(msg.agent)
        } else if (msg.type === 'agent_done') {
          setCompleted(prev => new Set([...prev, msg.agent]))
        } else if (msg.type === 'project_done') {
          setStatus('done')
          if (msg.final_path) setFinalPath(msg.final_path)
          localStorage.removeItem(DRAFT_KEY(projectId))
          setDraftSaved(false)
        }
      } catch {}
    }

    ws.onclose = () => {
      setTimeout(() => { if (wsRef.current === ws) connectWs() }, 2000)
    }
    ws.onerror = () => ws.close()
  }

  const openOutputFolder = () => {
    window.electronAPI?.openFolder(finalPath || '')
  }

  const cliPrint = (msg, type = 'info') => {
    setCliOutput(p => [...p, {
      msg, type,
      ts: new Date().toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    }])
  }

  const execCli = async (raw) => {
    const input = raw.trim()
    if (!input) return
    setCliHistory(h => [input, ...h.filter(x => x !== input)].slice(0, 50))
    setCliHistIdx(-1)
    cliPrint(`› ${input}`, 'cmd')

    const [cmd] = input.split(/\s+/)

    if (cmd === '/help' || cmd === 'help') {
      CLI_HELP.forEach(c => cliPrint(`${c.cmd.padEnd(12)} — ${c.desc}`, 'info'))
      return
    }
    if (cmd === '/plan') {
      if (plan) { cliPrint('Plan already built. Run /run to execute.', 'warn'); return }
      cliPrint('Building plan...', 'info')
      setBuildingPlan(true)
      try {
        const result = await api.post('/plan', { project_id: projectId })
        setPlan(result)
        cliPrint(`Plan ready: ${result.chain?.length} agents, ~${result.estimated_time_min}min`, 'ok')
      } catch (e) { cliPrint(`Error: ${e.message}`, 'err') }
      finally { setBuildingPlan(false) }
      return
    }
    if (cmd === '/run') {
      if (!plan) { cliPrint('No plan. Run /plan first.', 'warn'); return }
      if (isRunning) { cliPrint('Already running.', 'warn'); return }
      cliPrint('Starting agent chain...', 'info')
      setStatus('running')
      setLogs({})
      setCompleted(new Set())
      try {
        await api.post(`/run/${projectId}`, {})
        cliPrint('Chain started. Watch the log panel.', 'ok')
      } catch (e) { cliPrint(`Error: ${e.message}`, 'err'); setStatus('idle') }
      return
    }
    if (cmd === '/status') {
      if (!plan) { cliPrint('No plan built yet.', 'warn'); return }
      cliPrint(`Status: ${status}  ${completedAgents.size}/${plan.chain.length} agents done`, 'info')
      plan.chain.forEach(step => {
        const done    = completedAgents.has(step.agent_id)
        const running = activeAgent === step.agent_id && isRunning
        const icon    = running ? '⏳' : done ? '✅' : '⬜'
        cliPrint(`  ${icon} ${step.agent_id}`, 'info')
      })
      return
    }
    if (cmd === '/clear') {
      setCliOutput([])
      setLogs({})
      cliPrint('Cleared.', 'info')
      return
    }
    cliPrint(`Unknown command: ${cmd}. Type /help for commands.`, 'err')
  }

  const handleCliKey = (e) => {
    if (e.key === 'Enter') {
      execCli(cliInput); setCliInput(''); setShowHelp(false)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(cliHistIdx + 1, cliHistory.length - 1)
      setCliHistIdx(next); setCliInput(cliHistory[next] || '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(cliHistIdx - 1, -1)
      setCliHistIdx(next); setCliInput(next === -1 ? '' : cliHistory[next])
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const match = CLI_HELP.find(c => c.cmd.startsWith(cliInput))
      if (match) setCliInput(match.cmd)
    } else if (e.key === 'Escape') {
      setShowHelp(false); cliRef.current?.blur()
    }
  }

  const buildPlan = async () => {
    setBuildingPlan(true)
    try {
      const result = await api.post('/plan', { project_id: projectId })
      if (result?.chain) {
        setPlan(result)
        cliPrint(`Plan ready: ${result.chain.length} agents, ~${result.estimated_time_min}min`, 'ok')
      } else {
        cliPrint(`Ошибка: ${JSON.stringify(result)}`, 'err')
      }
    } catch (e) {
      cliPrint(`Ошибка построения плана: ${e.message}`, 'err')
    } finally {
      setBuildingPlan(false)
    }
  }

  const submitClarifications = async () => {
    const answers = (plan.clarifications || [])
      .map((q, i) => ({ question: q, answer: clarifyAnswers[i] || '' }))
      .filter(a => a.answer.trim())
    if (answers.length === 0) {
      cliPrint('Заполни хотя бы один ответ, чтобы уточнить ТЗ', 'warn')
      return
    }
    setClarifying(true)
    try {
      const result = await api.post('/plan/clarify', { project_id: projectId, answers })
      setPlan(result)
      setClarifyMode(false)
      setClarifyAnswers({})
      cliPrint(`ТЗ уточнено, план перестроен: ${result.chain?.length} агентов`, 'ok')
    } catch (e) {
      cliPrint(`Ошибка уточнения: ${e.message}`, 'err')
    } finally {
      setClarifying(false)
    }
  }

  const runProject = async () => {
    setStatus('running')
    setLogs({})
    setCompleted(new Set())
    try {
      const result = await api.post(`/run/${projectId}`, {})
      if (result?.error) {
        cliPrint(`Ошибка запуска: ${result.error}`, 'err')
        setStatus('idle')
      } else {
        cliPrint('Цепочка агентов запущена', 'ok')
      }
    } catch (e) {
      cliPrint(`Ошибка: ${e.message}`, 'err')
      setStatus('idle')
    }
  }

  const currentLogs = activeAgent ? (logs[activeAgent] || []) : []
  const isRunning   = status === 'running'

  // Прогресс
  const totalAgents     = plan?.chain?.length || 0
  const doneCount       = completedAgents.size
  const progressPercent = totalAgents > 0 ? Math.round((doneCount / totalAgents) * 100) : 0

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Top bar */}
      <div className="px-5 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-base truncate">{project?.name}</h2>
              {draftSaved && !isRunning && status !== 'done' && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Save size={10} />черновик
                </span>
              )}
              {status === 'done' && <span className="tag tag-green text-xs">готово</span>}
            </div>
            <p className="text-xs text-muted font-mono">{projectId}</p>
          </div>

          <div className="flex items-center gap-2">
            {status === 'done' && (
              <button onClick={openOutputFolder} className="btn-ghost text-success hover:text-success">
                <FolderOpen size={13} />Открыть результат
              </button>
            )}
            {!plan && (
              <button onClick={buildPlan} disabled={buildingPlan} className="btn-ghost">
                {buildingPlan
                  ? <><Loader2 size={13} className="animate-spin" />Строю план...</>
                  : <><FileText size={13} />Построить план</>}
              </button>
            )}
            {plan && !isRunning && (
              <button onClick={runProject} className="btn-primary">
                <Play size={13} />
                {status === 'done' ? 'Запустить снова' : 'Запустить'}
              </button>
            )}
            {isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-accent">
                <Loader2 size={13} className="animate-spin" />Выполняется...
              </div>
            )}
          </div>
        </div>

        {/* Progress bar (только когда есть план и идёт работа или готово) */}
        {plan && (isRunning || status === 'done') && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted">
                {status === 'done'
                  ? `Все агенты завершены · ${totalAgents} / ${totalAgents}`
                  : `Агент ${doneCount + 1} из ${totalAgents} · ${activeAgent || '...'}`}
              </span>
              <span className="text-xs font-mono font-semibold text-accent">{progressPercent}%</span>
            </div>
            <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-700"
                style={{ width: `${status === 'done' ? 100 : progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Clarification questions */}
      {plan?.clarifications?.length > 0 && !isRunning && status !== 'done' && (
        <div className="mx-4 mt-3 shrink-0 max-h-[45vh] overflow-y-auto bg-warning/10 border border-warning/20 rounded-lg">
          <div className="p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-xs text-warning font-semibold">❓ Уточняющие вопросы от оркестратора</p>
              {!clarifyMode && (
                <button onClick={() => setClarifyMode(true)} className="btn-primary text-xs py-1 px-2.5 shrink-0">
                  <Sparkles size={11} />Уточнить ТЗ
                </button>
              )}
            </div>

            {!clarifyMode ? (
              <>
                <ul className="space-y-1">
                  {plan.clarifications.map((q, i) => (
                    <li key={i} className="text-xs text-text-dim">• {q}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted mt-2">
                  Нажми «Уточнить ТЗ» и ответь на вопросы — план станет детальнее. Или запусти как есть.
                </p>
              </>
            ) : (
              <div className="space-y-2.5">
                {plan.clarifications.map((q, i) => (
                  <div key={i}>
                    <label className="text-xs text-text-dim font-medium block mb-1">{i + 1}. {q}</label>
                    <textarea
                      value={clarifyAnswers[i] || ''}
                      onChange={e => setClarifyAnswers(p => ({ ...p, [i]: e.target.value }))}
                      rows={2}
                      placeholder="Твой ответ…"
                      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs
                                 text-text-base placeholder-muted outline-none focus:border-accent
                                 transition-colors resize-none"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-0.5">
                  <button onClick={submitClarifications} disabled={clarifying} className="btn-primary text-xs py-1.5 px-3">
                    {clarifying
                      ? <><Loader2 size={12} className="animate-spin" />Перестраиваю…</>
                      : <><Send size={12} />Перестроить план</>}
                  </button>
                  <button onClick={() => { setClarifyMode(false); setClarifyAnswers({}) }}
                          className="text-xs text-muted hover:text-text-dim transition-colors">
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3-column */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left agents */}
        <div className="w-44 border-r border-border overflow-y-auto py-2 shrink-0">
          <p className="text-xs text-muted uppercase tracking-wider px-3 pb-2">Агенты</p>
          {plan ? plan.chain.map((step, idx) => {
            const done    = completedAgents.has(step.agent_id)
            const running = activeAgent === step.agent_id && isRunning
            return (
              <button key={step.agent_id}
                onClick={() => setActiveAgent(step.agent_id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-all duration-150
                  ${activeAgent === step.agent_id
                    ? 'bg-accent/10 text-accent border-r-2 border-accent'
                    : done ? 'text-success/80 hover:bg-surface-2'
                    : 'text-text-dim hover:text-text-base hover:bg-surface-2'}`}
              >
                <span className="text-base w-5 text-center shrink-0">{AGENT_ICONS[step.agent_id] || '🤖'}</span>
                <span className="flex-1 text-left truncate">{step.agent_id}</span>
                {running && <Loader2 size={9} className="animate-spin text-accent shrink-0" />}
                {done && !running && <CheckCircle2 size={9} className="text-success shrink-0" />}
                {!done && !running && (
                  <span className="text-muted text-[10px] shrink-0 font-mono">{idx + 1}</span>
                )}
              </button>
            )
          }) : <p className="text-xs text-muted px-3">Нет плана</p>}
        </div>

        {/* Center log */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface shrink-0">
            <Terminal size={12} className="text-muted" />
            <span className="text-xs text-muted">
              {activeAgent
                ? `${AGENT_ICONS[activeAgent] || '🤖'} ${activeAgent}`
                : 'Выбери агента слева'}
            </span>
            {activeAgent && completedAgents.has(activeAgent) && (
              <span className="tag tag-green text-xs ml-auto">готово</span>
            )}
            {activeAgent === activeAgent && isRunning && !completedAgents.has(activeAgent) && (
              <span className="tag tag-orange text-xs ml-auto flex items-center gap-1">
                <Loader2 size={9} className="animate-spin" />в работе
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
            {currentLogs.length === 0
              ? <p className="text-muted opacity-40">{plan ? 'Нажми Запустить' : 'Сначала построй план'}</p>
              : currentLogs.map((line, i) => (
                  <div key={i} className="text-text-dim leading-5 whitespace-pre-wrap">
                    <span className="text-accent/50 mr-2 select-none">›</span>{line}
                  </div>
                ))
            }
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Right chain */}
        <div className="w-80 border-l border-border overflow-y-auto py-3 shrink-0">
          <div className="flex items-center justify-between px-4 pb-2">
            <p className="text-xs text-muted uppercase tracking-wider">Цепочка</p>
            {plan && (
              <span className="text-xs text-muted font-mono">
                {doneCount}/{totalAgents}
              </span>
            )}
          </div>

          {plan ? (
            <>
              <div className="px-4 mb-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Время</span>
                  <span className="text-text-dim font-mono">~{plan.estimated_time_min} мин</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Токены</span>
                  <span className="text-text-dim font-mono">~{plan.estimated_tokens_k}k</span>
                </div>
                {isRunning && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Прогресс</span>
                    <span className="text-accent font-mono font-semibold">{progressPercent}%</span>
                  </div>
                )}
              </div>

              {plan.risks?.length > 0 && (
                <div className="mx-3 mb-3 p-2.5 bg-warning/10 border border-warning/20 rounded-lg">
                  <p className="text-xs text-warning font-semibold mb-1">⚠ Риски</p>
                  {plan.risks.map((r, i) => (
                    <p key={i} className="text-xs text-text-dim leading-relaxed">• {r}</p>
                  ))}
                </div>
              )}

              <div className="px-4 space-y-3">
                {plan.chain.map((step, i) => {
                  const done    = completedAgents.has(step.agent_id)
                  const running = activeAgent === step.agent_id && isRunning
                  const pending = !done && !running
                  return (
                    <div key={step.agent_id} className="relative">
                      {/* connector line */}
                      {i < plan.chain.length - 1 && (
                        <div className={`absolute left-[7px] top-5 w-px h-full ${done ? 'bg-success/40' : 'bg-border'}`} />
                      )}
                      <div className="flex gap-2.5">
                        {/* dot */}
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center mt-0.5 shrink-0 transition-all duration-300 ${
                          done    ? 'bg-success' :
                          running ? 'bg-accent ring-2 ring-accent/30' :
                          'bg-surface-2 border border-border'
                        }`}>
                          {running && <Loader2 size={7} className="animate-spin text-white" />}
                          {done    && <CheckCircle2 size={7} className="text-white" />}
                        </div>
                        {/* info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-xs font-medium ${
                              done ? 'text-success' : running ? 'text-accent' : 'text-text-dim'
                            }`}>{step.agent_id}</p>
                            {running && (
                              <span className="text-[10px] text-accent font-mono">в работе</span>
                            )}
                            {done && (
                              <span className="text-[10px] text-success font-mono">готово</span>
                            )}
                          </div>
                          <p className="text-xs text-muted leading-relaxed truncate">{step.task?.slice(0, 55)}…</p>
                          <p className="text-xs text-muted font-mono mt-0.5">~{step.estimated_time_min}м · {step.estimated_tokens_k}k</p>
                        </div>
                        {/* step number */}
                        {pending && (
                          <span className="text-xs text-muted font-mono mt-0.5 shrink-0">{i + 1}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted px-4">Построй план ↑</p>
          )}
        </div>
      </div>

      {/* CLI output */}
      {cliOutput.length > 0 && (
        <div className="border-t border-border bg-bg max-h-32 overflow-y-auto px-4 py-2 shrink-0">
          {cliOutput.slice(-20).map((line, i) => (
            <div key={i} className={`font-mono text-xs leading-5 flex gap-2 ${
              line.type === 'cmd'  ? 'text-accent' :
              line.type === 'ok'  ? 'text-success' :
              line.type === 'err' ? 'text-danger' :
              line.type === 'warn'? 'text-warning' :
              'text-text-dim'
            }`}>
              <span className="text-muted shrink-0">{line.ts}</span>
              <span>{line.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* CLI bar */}
      <div className="border-t border-border shrink-0">
        {showHelp && cliInput.startsWith('/') && (
          <div className="bg-surface border-b border-border px-4 py-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            {CLI_HELP.filter(c => c.cmd.startsWith(cliInput)).map(c => (
              <button key={c.cmd}
                onClick={() => { setCliInput(c.cmd); cliRef.current?.focus() }}
                className="font-mono text-xs text-accent hover:text-accent-hover">
                {c.cmd} <span className="text-muted">— {c.desc}</span>
              </button>
            ))}
          </div>
        )}
        <div className="px-4 py-2 flex items-center gap-2 bg-surface">
          <Terminal size={12} className="text-accent shrink-0" />
          <input
            ref={cliRef}
            value={cliInput}
            onChange={e => { setCliInput(e.target.value); setShowHelp(true) }}
            onKeyDown={handleCliKey}
            onFocus={() => setShowHelp(true)}
            onBlur={() => setTimeout(() => setShowHelp(false), 150)}
            placeholder="/plan  /run  /status  /clear  /help  — Tab для автодополнения"
            className="flex-1 bg-transparent text-xs font-mono text-text-dim placeholder-muted outline-none"
          />
          <span className="text-xs text-muted font-mono hidden sm:block">Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
