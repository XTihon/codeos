import React, { useState, useEffect, useRef } from 'react'
import { X, Wand2, FileText, ChevronRight, LayoutTemplate } from 'lucide-react'
import { api } from '../api'

const AGENT_ICONS = {
  'business-analyst':'📊', developer:'💻', tester:'🧪',
  'code-reviewer':'🔍', devops:'⚙️', 'security-auditor':'🔒',
  documenter:'📝', translator:'🌐', performance:'⚡',
  'investor-brief':'💰', marketer:'📣', seo:'🔎',
  copywriter:'✍️', 'ui-designer':'🎨', 'video-editor':'🎬',
}

export default function NewProjectModal({ onClose, onCreated, initialTemplate = null }) {
  const [name, setName]           = useState('')
  const [tz, setTz]               = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [template, setTemplate]   = useState(initialTemplate)
  const [templates, setTemplates] = useState([])
  const [showTpl, setShowTpl]     = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    api.get('/templates').then(setTemplates).catch(() => {})
    setTimeout(() => nameRef.current?.focus(), 50)
  }, [])

  // Esc to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Ctrl+Enter to submit
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleCreate() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [name, tz, template])

  const selectTemplate = (t) => {
    setTemplate(t)
    setShowTpl(false)
    if (!name) setName(t.name)
    if (!tz) setTz(t.context_hints || '')
  }

  const handleCreate = async () => {
    if (!name.trim() || !tz.trim()) { setError('Заполни название и ТЗ'); return }
    setLoading(true)
    setError('')
    try {
      const body = { name: name.trim(), tz: tz.trim() }
      if (template) body.template_id = template.id
      const project = await api.post('/projects', body)
      onCreated(project)
      onClose()
    } catch { setError('Ошибка создания проекта') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-lg shadow-warm-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-accent/20 flex items-center justify-center">
              <FileText size={12} className="text-accent" />
            </div>
            <span className="font-medium text-sm text-text-base">Новый проект</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Ctrl+Enter чтобы создать</span>
            <button onClick={onClose} className="text-muted hover:text-text-base transition-colors ml-1">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Template picker */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wider block mb-1.5">
              Шаблон <span className="normal-case text-muted">(необязательно)</span>
            </label>

            {template ? (
              <div className="flex items-center justify-between p-2.5 bg-accent/10 border border-accent/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{template.emoji}</span>
                  <div>
                    <p className="text-xs font-semibold text-accent">{template.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {template.chain?.slice(0, 5).map((a, i) => (
                        <React.Fragment key={a}>
                          <span className="text-xs">{AGENT_ICONS[a] || '🤖'}</span>
                          {i < Math.min(template.chain.length, 5) - 1 && (
                            <ChevronRight size={8} className="text-muted" />
                          )}
                        </React.Fragment>
                      ))}
                      {template.chain?.length > 5 && (
                        <span className="text-xs text-muted">+{template.chain.length - 5}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => setTemplate(null)}
                  className="text-xs text-muted hover:text-danger transition-colors">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowTpl(!showTpl)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border
                             hover:border-accent rounded-lg text-xs text-text-dim transition-all text-left">
                  <LayoutTemplate size={12} className="text-muted" />
                  <span className="text-muted">Выбрать шаблон проекта...</span>
                </button>

                {showTpl && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-surface border border-border
                                  rounded-xl shadow-warm-lg z-10 overflow-hidden">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => selectTemplate(t)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2
                                   transition-colors text-left group">
                        <span className="text-xl">{t.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text-dim group-hover:text-text-base">
                            {t.name}
                          </p>
                          <p className="text-xs text-muted truncate">{t.context_hints}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {t.chain?.slice(0, 4).map(a => (
                            <span key={a} className="text-xs">{AGENT_ICONS[a] || '🤖'}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wider block mb-1.5">Название</label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Tab' && e.preventDefault()}
              placeholder="Интернет-магазин одежды"
              className="input-base"
            />
          </div>

          {/* TZ */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wider block mb-1.5">
              Техническое задание
            </label>
            <textarea
              value={tz}
              onChange={e => setTz(e.target.value)}
              placeholder={template?.context_hints || "Вставь ТЗ, описание задачи, требования клиента..."}
              rows={6}
              className="input-base resize-none font-mono text-xs leading-relaxed"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-text-dim transition-colors">
            Отмена
          </button>
          <button onClick={handleCreate} disabled={loading}
            className="btn-primary disabled:opacity-50">
            <Wand2 size={14} />
            {loading ? 'Создаём...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}
