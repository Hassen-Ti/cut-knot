import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC } from './ipc.ts'
import { assertAbsolutePath } from './paths.ts'

if (process.env.CUT_KNOT_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
}

type FileWatchEvent = 'change' | 'rename'

type OpenFileOptions = {
  filters?: { name: string; extensions: string[] }[]
}

type WatchEntry = {
  watcher: fs.FSWatcher
  sender: Electron.WebContents
}

const watchers = new Map<string, WatchEntry>()

function defaultFilters() {
  return [
    { name: 'CSV', extensions: ['csv'] },
    { name: 'All files', extensions: ['*'] },
  ]
}

function shouldLoadDevServer() {
  return !app.isPackaged && process.env.ELECTRON_LOAD_FILE !== '1'
}

function rendererUrl() {
  return process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
}

function preloadPath() {
  return path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')
}

function rendererFile() {
  return path.join(app.getAppPath(), 'dist', 'index.html')
}

function stopWatch(watchId: string) {
  const entry = watchers.get(watchId)
  if (!entry) return
  entry.watcher.close()
  watchers.delete(watchId)
}

function stopWatchesFor(sender: Electron.WebContents) {
  for (const [id, entry] of watchers) {
    if (entry.sender === sender) stopWatch(id)
  }
}

function asWatchEvent(eventType: string): FileWatchEvent {
  if (eventType === 'rename') return 'rename'
  return 'change'
}

function registerBridge() {
  ipcMain.handle(IPC.openFile, async (event, options?: OpenFileOptions) => {
    if (process.env.CUT_KNOT_SMOKE === '1' && process.env.CUT_KNOT_SMOKE_FILE) {
      return process.env.CUT_KNOT_SMOKE_FILE
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: options?.filters ?? defaultFilters(),
    }
    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle(IPC.readFile, async (_event, filePath: unknown) => {
    const absolute = assertAbsolutePath(filePath)
    return fs.promises.readFile(absolute, 'utf8')
  })

  ipcMain.handle(IPC.watchFile, async (event, watchId: unknown, filePath: unknown) => {
    if (typeof watchId !== 'string' || watchId.length === 0) {
      throw new Error('watchId is required')
    }
    const absolute = assertAbsolutePath(filePath)
    stopWatch(watchId)

    const watcher = fs.watch(absolute, (eventType) => {
      if (event.sender.isDestroyed() || event.sender.getURL() === '') return
      try {
        event.sender.send(IPC.fileChanged, watchId, asWatchEvent(eventType))
      } catch {
        stopWatch(watchId)
      }
    })

    watcher.on('error', () => {
      stopWatch(watchId)
    })

    watchers.set(watchId, { watcher, sender: event.sender })
    event.sender.once('destroyed', () => stopWatchesFor(event.sender))
  })

  ipcMain.handle(IPC.unwatchFile, async (_event, watchId: unknown) => {
    if (typeof watchId === 'string') stopWatch(watchId)
  })
}

async function createWindow() {
  const win = new BrowserWindow({
    title: 'Cut Knot',
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f4f5',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (process.env.CUT_KNOT_SMOKE === '1') {
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('render-process-gone', details)
    })
    win.webContents.on('did-fail-load', (_event, code, desc, url) => {
      console.error('did-fail-load', code, desc, url)
    })
    win.webContents.on('console-message', (_event, _level, message) => {
      console.log('renderer:', message)
    })
  }

  if (shouldLoadDevServer()) {
    await win.loadURL(rendererUrl())
  } else {
    await win.loadFile(rendererFile())
  }
  await win.webContents.executeJavaScript('document.readyState')

  if (process.env.CUT_KNOT_SMOKE === '1' || process.env.CUT_KNOT_SCREENSHOT) {
    const { runDesktopHarness } = await import('./harness.ts')
    await runDesktopHarness(win)
  }

  return win
}

Menu.setApplicationMenu(null)
registerBridge()

void app.whenReady().then(async () => {
  try {
    await createWindow()
  } catch (error) {
    console.error(error)
    app.exit(1)
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  for (const id of [...watchers.keys()]) stopWatch(id)
  if (process.platform !== 'darwin') app.quit()
})
