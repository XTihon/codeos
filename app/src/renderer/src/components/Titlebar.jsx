import React from 'react'
import { Cpu } from 'lucide-react'

export default function Titlebar({ apiStatus }) {
  return (
    <div
      className="h-9 flex items-center px-4 gap-3 bg-bg border-b border-border select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
          <Cpu size={13} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-text-base tracking-tight">CodeOS</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
        <div className={`w-1.5 h-1.5 rounded-full ${
          apiStatus === 'connected'  ? 'bg-success' :
          apiStatus === 'connecting' ? 'bg-warning animate-pulse' : 'bg-danger'
        }`} />
        <span className="text-xs text-muted font-mono">
          {apiStatus === 'connected'  ? ':7432' :
           apiStatus === 'connecting' ? 'connecting' : 'offline'}
        </span>
      </div>
    </div>
  )
}
