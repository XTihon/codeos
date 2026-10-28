import React, { useState } from 'react'
import { LayoutDashboard, Users, BarChart2, GitBranch, Bot, Settings } from 'lucide-react'
import SettingsModal from './SettingsModal'

const items = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Проекты',      hotkey: '⌃1' },
  { id: 'repo',      icon: GitBranch,       label: 'Репозиторий',  hotkey: '⌃2' },
  { id: 'agents',    icon: Bot,             label: 'Агенты',        hotkey: '⌃3' },
  { id: 'clients',   icon: Users,           label: 'Клиенты',       hotkey: '⌃4' },
  { id: 'analytics', icon: BarChart2,       label: 'Аналитика',     hotkey: '⌃5' },
]

export default function Sidebar({ page, setPage }) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <aside className="w-14 flex flex-col items-center pt-2 pb-3 gap-0.5 bg-surface border-r border-border shrink-0">
        {items.map(({ id, icon: Icon, label, hotkey }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            title={label}
            className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150
              ${page === id
                ? 'bg-accent text-white shadow-warm'
                : 'text-muted hover:text-text-base hover:bg-surface-2'
              }`}
          >
            <Icon size={17} />
            <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap
                             bg-surface-2 border border-border text-text-base text-xs
                             px-2 py-1 rounded-md opacity-0 group-hover:opacity-100
                             transition-opacity duration-100 shadow-warm-lg flex items-center gap-2">
              {label}
              <span className="text-muted font-mono">{hotkey}</span>
            </span>
          </button>
        ))}

        <div className="flex-1" />

        <button
          title="Настройки"
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-muted
                     hover:text-text-base hover:bg-surface-2 transition-all duration-150"
        >
          <Settings size={17} />
        </button>
      </aside>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )
}
