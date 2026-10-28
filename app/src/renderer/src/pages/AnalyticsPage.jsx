import React, { useState, useEffect } from 'react'
import { BarChart2, Zap, RefreshCw, Star } from 'lucide-react'
import { api } from '../api'

export default function AnalyticsPage() {
  const [agentStats, setAgentStats] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setAgentStats(await api.get('/metrics/agents')) } catch { setAgentStats([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const maxTokens = Math.max(...agentStats.map(a => a.total_tokens || 0), 1)

  return (
    <div className="h-full p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Аналитика</h1>
          <p className="text-sm text-muted mt-0.5">Метрики агентов</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border hover:border-accent rounded-lg text-sm text-muted transition-colors"
        >
          <RefreshCw size={13} /> Обновить
        </button>
      </div>

      {loading ? (
        <p className="text-muted text-sm">Загрузка...</p>
      ) : agentStats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <BarChart2 size={40} className="text-muted mb-3 opacity-40" />
          <p className="text-slate-400 text-sm">Нет данных</p>
          <p className="text-muted text-xs mt-1">Запусти проекты чтобы собрать метрики</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-3">
          {agentStats.map(stat => (
            <div key={stat.agent_id} className="p-4 bg-surface border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-200">{stat.agent_id}</span>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Zap size={10} />{stat.runs} запусков
                  </span>
                  <span className="flex items-center gap-1">
                    <Star size={10} />{(stat.avg_quality || 0).toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${((stat.total_tokens || 0) / maxTokens) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted font-mono w-16 text-right">
                  {((stat.total_tokens || 0) / 1000).toFixed(1)}k токенов
                </span>
              </div>
              {stat.total_retries > 0 && (
                <p className="text-xs text-warning mt-1">{stat.total_retries} переделок</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
