import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { spawn, execSync } from 'child_process'

let mainWindow
let pythonProcess

function startPythonBackend() {
  const corePath = join(__dirname, '../../../core/api.py')
  pythonProcess = spawn('python', [corePath], {
    stdio: 'pipe',
    shell: true,
    detached: false,
  })
  pythonProcess.stdout.on('data', (d) => process.stdout.write('[api] ' + d))
  pythonProcess.stderr.on('data', (d) => process.stderr.write('[api] ' + d))
  pythonProcess.on('exit', (code) => console.log('[api] exited', code))
}

// Надёжно убиваем ВСЁ дерево процессов бэкенда.
// shell:true запускает cmd.exe → python, поэтому обычный kill() убивает
// только обёртку cmd, а python осиротеет и продолжит висеть на порту 7432
// со старым кодом. taskkill /t /f валит всё дерево целиком.
function killPythonBackend() {
  if (pythonProcess && pythonProcess.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pythonProcess.pid} /t /f`, { stdio: 'ignore' })
      } else {
        pythonProcess.kill('SIGTERM')
      }
    } catch (e) {
      /* процесс уже мёртв — ок */
    }
    pythonProcess = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#1C1410',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1C1410',
      symbolColor: '#F0E0CC',
      height: 32,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }


  // ready-to-show = первый значимый рендер готов
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  startPythonBackend()

  // Даём Python 2 секунды подняться, потом открываем окно
  setTimeout(createWindow, 2000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Закрываем Python вместе с приложением (всё дерево процессов)
app.on('before-quit', killPythonBackend)

app.on('window-all-closed', () => {
  killPythonBackend()
  app.quit()
})

ipcMain.handle('open-external', (_, url) => shell.openExternal(url))
ipcMain.handle('open-folder', (_, path) => shell.openPath(path))
