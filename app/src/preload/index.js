import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  platform: process.platform,
})
