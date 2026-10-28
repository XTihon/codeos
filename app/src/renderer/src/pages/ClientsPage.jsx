import React, { useState, useEffect } from 'react'
import { Plus, User, Mail, MessageCircle, X, Trash2 } from 'lucide-react'
import { api } from '../api'

function ClientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', telegram: '', email: '', notes: '' })
  const [loading, setLoading] = useState(false)

  const save = async () => {
    if (!form.name.trim()) return
    setLoading(true)
    try {
      const client = await api.post('/clients', form)
      onCreated(client)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-medium text-sm">Новый клиент</span>
          <button onClick={onClose}><X size={16} className="text-muted" /></button>
        </div>
        <div className="p-4 space-y-3">
          {[
            { key: 'name',     label: 'Имя',      placeholder: 'Иван Петров' },
            { key: 'telegram', label: 'Telegram', placeholder: '@username' },
            { key: 'email',    label: 'Email',    placeholder: 'ivan@mail.ru' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-muted uppercase tracking-wider block mb-1">{f.label}</label>
              <input
                value={form[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-muted outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted uppercase tracking-wider block mb-1">Заметки</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-muted outline-none focus:border-accent transition-colors resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted">Отмена</button>
          <button
            onClick={save}
            disabled={loading}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
          >
            {loading ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = async () => {
    try { setClients(await api.get('/clients')) } catch { setClients([]) }
  }

  const deleteClient = async (clientId) => {
    await api.delete(`/clients/${clientId}`)
    load()
  }

  const clearAll = async () => {
    await api.delete('/clients')
    setConfirmClear(false)
    load()
  }

  useEffect(() => { load() }, [])

  return (
    <div className="h-full p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Клиенты</h1>
          <p className="text-sm text-muted mt-0.5">История и контакты</p>
        </div>
        <div className="flex items-center gap-2">
          {clients.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-danger">Удалить всех?</span>
                <button onClick={clearAll} className="px-2 py-1 text-xs bg-danger/20 text-danger rounded-lg hover:bg-danger/30 transition-colors">Да</button>
                <button onClick={() => setConfirmClear(false)} className="px-2 py-1 text-xs text-muted hover:text-text-dim transition-colors">Нет</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted hover:text-danger border border-border rounded-lg transition-colors">
                <Trash2 size={14} />Очистить
              </button>
            )
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Добавить клиента
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <User size={40} className="text-muted mb-3 opacity-40" />
          <p className="text-slate-400 text-sm">Нет клиентов</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 max-w-2xl">
          {clients.map(c => (
            <div key={c.id} className="p-4 bg-surface border border-border rounded-lg group hover:border-border-hover transition-all">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold text-sm shrink-0">
                  {(c.name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{c.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {c.telegram && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <MessageCircle size={10} />{c.telegram}
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Mail size={10} />{c.email}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted font-mono">{c.id}</span>
                <button
                  onClick={() => deleteClient(c.id)}
                  className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all"
                  title="Удалить клиента"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {c.notes && <p className="text-xs text-muted mt-2 pl-12">{c.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ClientModal onClose={() => setShowModal(false)} onCreated={load} />
      )}
    </div>
  )
}
