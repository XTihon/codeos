import React, { useState, useEffect, useCallback } from 'react'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import ProjectView from './pages/ProjectView'
import ClientsPage from './pages/ClientsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import RepoPage from './pages/RepoPage'
import AgentsPage from './pages/AgentsPage'
import { API_BASE } from './api'

const TABS = ['dashboard', 'repo', 'agents', 'clients', 'analytics']

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [activeProject, setActiveProject] = useState(null)
  const [apiStatus, setApiStatus] = useState('connecting')
  const [newProjectTick, setNewProjectTick] = useState(0)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`)
        setApiStatus(res.ok ? 'connected' : 'error')
      } catch { setApiStatus('error') }
    }
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [])

  // Глобальные хоткеи
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'

      // Ctrl+N → новый проект (только если не в поле ввода)
      if (e.ctrlKey && e.key === 'n' && !inInput) {
        e.preventDefault()
        setPage('dashboard')
        setNewProjectTick(t => t + 1)
      }

      // Ctrl+1-5 → переключение вкладок
      if (e.ctrlKey && ['1','2','3','4','5'].includes(e.key) && !inInput) {
        e.preventDefault()
        setPage(TABS[parseInt(e.key) - 1])
      }

      // Ctrl+K → фокус на CLI бар (проект открыт)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('codeos:focus-cli'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const openProject = useCallback((project) => {
    setActiveProject(project)
    setPage('project')
  }, [])

  return (
    <div className="flex flex-col h-screen bg-bg text-text-base">
      <Titlebar apiStatus={apiStatus} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} setPage={setPage} hasProject={!!activeProject} />
        <main className="flex-1 overflow-hidden relative">

          {/* key по projectId — сбрасывает состояние при смене проекта */}
          <div className={`absolute inset-0 ${page === 'project' && activeProject ? 'block' : 'hidden'}`}>
            {activeProject && (
              <ProjectView
                key={activeProject.project_id || activeProject.id}
                project={activeProject}
                isActive={page === 'project'}
              />
            )}
          </div>

          <div className={`absolute inset-0 ${page === 'dashboard' ? 'block' : 'hidden'}`}>
            <Dashboard onOpenProject={openProject} onNewProject={newProjectTick || undefined} />
          </div>
          <div className={`absolute inset-0 ${page === 'repo' ? 'block' : 'hidden'}`}>
            <RepoPage />
          </div>
          <div className={`absolute inset-0 ${page === 'agents' ? 'block' : 'hidden'}`}>
            <AgentsPage />
          </div>
          <div className={`absolute inset-0 ${page === 'clients' ? 'block' : 'hidden'}`}>
            <ClientsPage />
          </div>
          <div className={`absolute inset-0 ${page === 'analytics' ? 'block' : 'hidden'}`}>
            <AnalyticsPage />
          </div>

        </main>
      </div>
    </div>
  )
}
