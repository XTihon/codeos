import React, { useState, useEffect } from 'react'
import { Plus, Clock, CheckCircle, AlertCircle, Zap, FolderOpen, ArrowRight, Trash2 } from 'lucide-react'
import { api } from '../api'
import NewProjectModal from '../components/NewProjectModal'

const STATUS = {
  pending: { icon: <Clock size={12} className="text-muted" />,   tag: 'tag-muted',   label: 'ожидает' },
  planned: { icon: <Zap   size={12} className="text-warning" />,  tag: 'tag-orange',  label: 'план готов' },
  running: { icon: <Zap   size={12} className="text-accent animate-pulse" />, tag: 'tag-orange', label: 'выполняется' },
  done:    { icon: <CheckCircle size={12} className="text-success" />, tag: 'tag-green', label: 'готово' },
  error:   { icon: <AlertCircle size={12} className="text-danger" />, tag: 'tag-muted',  label: 'ошибка' },
}

export default function Dashboard({ onOpenProject, onNewProject }) {
  const [projects, setProjects]       = useState([])
  const [showModal, setShowModal]     = useState(false)
  const [activeTemplate, setTemplate] = useState(null)
  const [templates, setTemplates]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = async () => {
    try { setProjects(await api.get('/projects')) }
    catch { setProjects([]) }
    finally { setLoading(false) }
  }

  const deleteProject = async (e, projectId) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await api.delete(`/projects/${projectId}`)
    } catch (err) {
      console.error('Delete project error:', err)
      alert(`Ошибка удаления: ${err.message}`)
      return
    }
    load()
  }

  const clearAll = async () => {
    try {
      await api.delete('/projects')
    } catch (err) {
      console.error('Clear projects error:', err)
      alert(`Ошибка очистки: ${err.message}`)
      setConfirmClear(false)
      return
    }
    setConfirmClear(false)
    load()
  }

  useEffect(() => {
    load()
    api.get('/templates').then(setTemplates).catch(() => {})
  }, [])

  // открыть модал из App.jsx по хоткею Ctrl+N
  useEffect(() => {
    if (onNewProject) { setShowModal(true); setTemplate(null) }
  }, [onNewProject])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-base">Проекты</h1>
            <p className="text-xs text-muted mt-0.5">{projects.length} активных</p>
          </div>
          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-danger">Удалить все?</span>
                  <button onClick={clearAll} className="px-2 py-1 text-xs bg-danger/20 text-danger rounded-lg hover:bg-danger/30 transition-colors">Да</button>
                  <button onClick={() => setConfirmClear(false)} className="px-2 py-1 text-xs text-muted hover:text-text-dim transition-colors">Нет</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClear(true)} className="btn-ghost text-muted hover:text-danger">
                  <Trash2 size={13} />Очистить
                </button>
              )
            )}
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Plus size={15} />
              Новый проект
            </button>
          </div>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => { setTemplate(t); setShowModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 border border-border
                           hover:border-accent hover:text-accent rounded-lg text-xs text-text-dim
                           transition-all duration-150 group"
              >
                <span>{t.emoji}</span>
                <span className="group-hover:text-accent">{t.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-muted text-sm">Загрузка...</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border
                            flex items-center justify-center mb-4">
              <FolderOpen size={22} className="text-muted" />
            </div>
            <p className="text-text-dim text-sm font-medium">Нет проектов</p>
            <p className="text-muted text-xs mt-1">Создай первый проект или выбери шаблон выше</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {projects.map(p => {
              const s = STATUS[p.status] || STATUS.pending
              return (
                <div
                  key={p.id}
                  className="w-full flex items-center gap-4 p-4 card hover:border-border-hover
                             hover:shadow-warm text-left transition-all duration-150 group cursor-pointer"
                >
                  <div
                    onClick={() => onOpenProject(p)}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className="w-9 h-9 rounded-xl bg-surface-2 border border-border
                                    flex items-center justify-center text-lg flex-shrink-0">
                      📁
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-base">{p.name}</p>
                      <p className="text-xs text-muted font-mono mt-0.5">{p.id}</p>
                    </div>
                  </div>
                  <span className={`tag ${s.tag} flex items-center gap-1 shrink-0`}>
                    {s.icon}{s.label}
                  </span>
                  <button
                    onClick={(e) => deleteProject(e, p.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all shrink-0"
                    title="Удалить проект"
                  >
                    <Trash2 size={13} />
                  </button>
                  <ArrowRight
                    onClick={() => onOpenProject(p)}
                    size={14}
                    className="text-muted group-hover:text-accent transition-colors shrink-0 cursor-pointer"
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => { setShowModal(false); setTemplate(null) }}
          onCreated={(p) => { load(); onOpenProject(p) }}
          initialTemplate={activeTemplate}
        />
      )}
    </div>
  )
}
