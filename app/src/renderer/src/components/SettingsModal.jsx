import React, { useState } from 'react'
import { X, Settings2, Cpu, FolderOpen, Key, Palette, Info } from 'lucide-react'

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Быстрый, дешевле' },
  { id: 'claude-opus-4-8',   label: 'Opus 4.8',   desc: 'Умнее, дороже' },
]

export default function SettingsModal({ onClose }) {
  const [model, setModel]           = useState('claude-sonnet-4-6')
  const [workspace, setWorkspace]   = useState('C:\\Dev\\CodeOS\\workspace')
  const [maxAgents, setMaxAgents]   = useState(4)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-md shadow-warm-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-accent" />
            <span className="font-semibold text-sm text-text-base">Настройки</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text-base transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Model */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Cpu size={11} />Модель по умолчанию
            </label>
            <div className="space-y-2">
              {MODELS.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left
                    ${model === m.id ? 'border-accent bg-accent-muted' : 'border-border hover:border-border-hover'}`}>
                  <div>
                    <p className="text-sm font-medium text-text-base">{m.label}</p>
                    <p className="text-xs text-muted">{m.desc}</p>
                  </div>
                  {model === m.id && (
                    <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Workspace */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <FolderOpen size={11} />Рабочая папка
            </label>
            <input
              value={workspace}
              onChange={e => setWorkspace(e.target.value)}
              className="input-base font-mono text-xs"
            />
          </div>

          {/* Max agents */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Palette size={11} />Макс. агентов на проект
            </label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={8} value={maxAgents}
                onChange={e => setMaxAgents(Number(e.target.value))}
                className="flex-1 accent-orange-500" />
              <span className="text-sm font-mono text-accent w-4">{maxAgents}</span>
            </div>
            <p className="text-xs text-muted mt-1">Оркестратор не будет выбирать больше этого числа агентов</p>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-surface-2 rounded-lg">
            <Info size={13} className="text-muted mt-0.5 shrink-0" />
            <p className="text-xs text-muted leading-relaxed">
              Конфиги агентов — <span className="font-mono text-text-dim">agents/[name]/config.json</span><br />
              API порт: <span className="font-mono text-text-dim">7432</span>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-text-dim transition-colors">
            Отмена
          </button>
          <button onClick={onClose} className="btn-primary">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}
