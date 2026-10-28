import React, { useState, useEffect } from 'react'
import { Bot, Wrench, GitBranch, Settings2, RefreshCw, ChevronRight } from 'lucide-react'
import { api } from '../api'

const DEPT_COLOR = {
  system:   'text-muted',
  dev:      'text-accent',
  content:  'text-warning',
  design:   'text-success',
  business: 'text-text-dim',
}
const DEPT_LABEL = {
  system:'Система', dev:'Разработка', content:'Контент',
  design:'Дизайн', business:'Бизнес',
}
const MODEL_SHORT = {
  'claude-sonnet-4-6':'Sonnet 4.6', 'claude-opus-4-8':'Opus 4.8',
  'claude-haiku-4-5-20251001':'Haiku 4.5',
}

const TABS = [
  { id:'agents', icon: Bot,       label:'Агенты' },
  { id:'mcp',    icon: Wrench,    label:'MCP инструменты' },
  { id:'repos',  icon: GitBranch, label:'Репозитории' },
]

export default function AgentsPage() {
  const [tab, setTab] = useState('agents')
  const [info, setInfo] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/system/info')
      setInfo(data)
      if (data.agents?.length) setSelected(data.agents[0])
    } catch { setInfo(null) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const agents = info?.agents || []
  const mcpList = info?.mcp || []
  const reposList = info?.repos || []

  const grouped = agents.reduce((acc, a) => {
    const d = a.department || 'dev'
    if (!acc[d]) acc[d] = []
    acc[d].push(a)
    return acc
  }, {})

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-5 pt-4 pb-0 border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all duration-150
              ${tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text-dim'}`}>
            <t.icon size={13} />{t.label}
            {t.id === 'agents' && agents.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-surface-2 rounded text-xs font-mono text-muted">
                {agents.length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={load} className="mb-1 text-muted hover:text-text-dim transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">Загрузка...</div>
      ) : !info ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">Ошибка загрузки</div>
      ) : (
        <div className="flex-1 overflow-hidden">

          {/* ── AGENTS TAB ── */}
          {tab === 'agents' && (
            <div className="h-full flex overflow-hidden">
              {/* List */}
              <div className="w-56 border-r border-border overflow-y-auto py-2">
                {Object.entries(grouped).map(([dept, list]) => (
                  <div key={dept} className="mb-3">
                    <p className={`text-xs font-semibold uppercase tracking-wider px-4 py-1 ${DEPT_COLOR[dept] || 'text-muted'}`}>
                      {DEPT_LABEL[dept] || dept}
                    </p>
                    {list.map(a => (
                      <button key={a.id} onClick={() => setSelected(a)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-all
                          ${selected?.id === a.id
                            ? 'bg-accent/10 text-accent border-r-2 border-accent'
                            : 'text-text-dim hover:text-text-base hover:bg-surface-2'}`}>
                        <span className="text-base leading-none">{a.icon}</span>
                        <span className="text-xs truncate">{a.name || a.id}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              {/* Detail */}
              <div className="flex-1 overflow-y-auto p-6">
                {selected ? (
                  <div className="max-w-md space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-3xl">
                        {selected.icon}
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-text-base">{selected.name || selected.id}</h2>
                        <span className={`text-xs font-medium ${DEPT_COLOR[selected.department] || 'text-muted'}`}>
                          {DEPT_LABEL[selected.department] || selected.department}
                        </span>
                      </div>
                    </div>

                    <div className="card divide-y divide-border">
                      <div className="flex justify-between px-4 py-2.5 text-xs">
                        <span className="text-muted">Модель</span>
                        <span className="font-mono text-text-dim">{MODEL_SHORT[selected.model] || selected.model}</span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5 text-xs">
                        <span className="text-muted">ID</span>
                        <span className="font-mono text-text-dim">{selected.id}</span>
                      </div>
                    </div>

                    {selected.mcp?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">MCP инструменты</p>
                        <div className="space-y-1.5">
                          {selected.mcp.map(m => {
                            const reg = mcpList.find(x => x.id === m)
                            return (
                              <div key={m} className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg">
                                <span>{reg?.icon || '🔧'}</span>
                                <div>
                                  <p className="text-xs font-medium text-text-dim">{m}</p>
                                  <p className="text-xs text-muted">{reg?.desc || '—'}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {selected.repos?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Репозитории</p>
                        <div className="space-y-1.5">
                          {selected.repos.map(r => {
                            const repo = reposList.find(x => x.name === r)
                            return (
                              <div key={r} className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg">
                                <GitBranch size={12} className="text-accent shrink-0" />
                                <div>
                                  <p className="text-xs font-medium text-text-dim font-mono">{r}</p>
                                  <p className="text-xs text-muted">{repo?.purpose || '—'}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {selected.skills?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.skills.map(s => <span key={s} className="tag tag-muted">{s}</span>)}
                        </div>
                      </div>
                    )}

                    <div className="card p-3 flex items-start gap-2">
                      <Settings2 size={13} className="text-muted mt-0.5 shrink-0" />
                      <p className="text-xs text-muted leading-relaxed">
                        <span className="font-mono text-text-dim">agents/{selected.id}/config.json</span><br />
                        <span className="font-mono text-text-dim">agents/{selected.id}/CLAUDE.md</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted text-sm">
                    Выбери агента
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MCP TAB ── */}
          {tab === 'mcp' && (
            <div className="h-full overflow-y-auto p-6">
              <p className="text-xs text-muted mb-4">
                MCP (Model Context Protocol) — инструменты которые агенты используют для работы с внешними системами
              </p>
              {mcpList.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <Wrench size={32} className="text-muted mb-3 opacity-40" />
                  <p className="text-text-dim text-sm">Нет подключённых MCP</p>
                  <p className="text-muted text-xs mt-1">Добавь mcp в config.json агента</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-lg">
                  {mcpList.map(m => (
                    <div key={m.id} className="card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{m.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-text-base font-mono">{m.id}</p>
                            <p className="text-xs text-text-dim mt-0.5">{m.desc}</p>
                          </div>
                        </div>
                      </div>
                      {m.agents?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted">Агенты:</span>
                          {m.agents.map(a => {
                            const agent = agents.find(x => x.id === a)
                            return (
                              <span key={a} className="flex items-center gap-1 tag tag-orange">
                                {agent?.icon || '🤖'} {a}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── REPOS TAB ── */}
          {tab === 'repos' && (
            <div className="h-full overflow-y-auto p-6">
              <p className="text-xs text-muted mb-4">
                Локальные репозитории в <span className="font-mono text-text-dim">C:\Dev\repos\</span> — агенты используют их как справочные материалы
              </p>
              {reposList.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <GitBranch size={32} className="text-muted mb-3 opacity-40" />
                  <p className="text-text-dim text-sm">Нет репозиториев</p>
                  <p className="text-muted text-xs mt-1">Используй таб «Репозиторий» чтобы клонировать</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-lg">
                  {reposList.map(r => (
                    <div key={r.name} className="card p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
                          <GitBranch size={15} className="text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-text-base font-mono">{r.name}</p>
                            <span className="text-xs text-muted font-mono">{r.size_mb} MB</span>
                          </div>
                          <p className="text-xs text-accent mt-0.5 font-medium">{r.purpose}</p>
                        </div>
                      </div>

                      {r.detail && (
                        <p className="text-xs text-text-dim leading-relaxed">{r.detail}</p>
                      )}

                      {r.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map(t => (
                            <span key={t} className="tag tag-muted">{t}</span>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-border flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted">Агенты:</span>
                        {r.agents?.length > 0 ? r.agents.map(a => {
                          const agent = agents.find(x => x.id === a)
                          return (
                            <span key={a} className="flex items-center gap-1 tag tag-orange">
                              {agent?.icon || '🤖'} {a}
                            </span>
                          )
                        }) : (
                          <span className="text-xs text-muted italic">не подключён</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
