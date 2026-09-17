import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isPackaged = app.isPackaged
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5180'

app.setName('PolyEcho')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

const forceClose = new WeakSet()
const closeWatchdogs = new WeakMap()
const allowedWritePaths = new Set()
const RECENT_MAX = 8
const CLOSE_WATCHDOG_MS = 8000

function clearCloseWatchdog(win) {
  const timer = closeWatchdogs.get(win)
  if (timer) clearTimeout(timer)
  closeWatchdogs.delete(win)
}

function armCloseWatchdog(win) {
  clearCloseWatchdog(win)
  closeWatchdogs.set(win, setTimeout(() => {
    closeWatchdogs.delete(win)
    if (win.isDestroyed()) return
    forceClose.add(win)
    win.close()
  }, CLOSE_WATCHDOG_MS))
}

function findProjectArg(argv = process.argv) {
  return argv.find(arg => typeof arg === 'string' && arg.toLowerCase().endsWith('.psxproj')) || null
}

function recentPath() {
  return path.join(app.getPath('userData'), 'recent-projects.json')
}

function crashLogPath() {
  return path.join(app.getPath('userData'), 'crash.log')
}

function lastFolderFile() {
  return path.join(app.getPath('userData'), 'last-folder.json')
}

let lastFolder = null

async function loadLastFolder() {
  try {
    const raw = JSON.parse(await fs.readFile(lastFolderFile(), 'utf8'))
    if (typeof raw.dir === 'string') lastFolder = raw.dir
  } catch {
    lastFolder = null
  }
}

async function rememberFolder(filePath) {
  lastFolder = path.dirname(filePath)
  await fs.writeFile(lastFolderFile(), JSON.stringify({ dir: lastFolder }), 'utf8')
}

function allowWrite(filePath) {
  if (typeof filePath !== 'string' || !filePath) return
  allowedWritePaths.add(path.resolve(filePath))
}

function canWrite(filePath) {
  return allowedWritePaths.has(path.resolve(filePath))
}

function resolveDefaultPath(suggested) {
  if (typeof suggested !== 'string' || !suggested) return undefined
  if (path.isAbsolute(suggested)) return suggested
  return lastFolder ? path.join(lastFolder, suggested) : suggested
}

function windowIcon() {
  return path.join(__dirname, '..', isPackaged ? 'dist' : 'public', 'icon.ico')
}

function boundsPath() {
  return path.join(app.getPath('userData'), 'window-bounds.json')
}

async function readBounds() {
  try {
    const raw = JSON.parse(await fs.readFile(boundsPath(), 'utf8'))
    if (typeof raw.width === 'number' && typeof raw.height === 'number') return raw
  } catch {
    /* first launch */
  }
  return { width: 1440, height: 900 }
}

function writeBounds(win) {
  if (win.isDestroyed() || win.isMinimized()) return
  const b = win.getBounds()
  fs.writeFile(boundsPath(), JSON.stringify(b), 'utf8').catch(() => {})
}

async function createWindow() {
  const saved = await readBounds()
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: typeof saved.x === 'number' ? saved.x : undefined,
    y: typeof saved.y === 'number' ? saved.y : undefined,
    minWidth: 1100,
    minHeight: 700,
    title: 'PolyEcho',
    icon: windowIcon(),
    backgroundColor: '#111318',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-fail-load', (_event, code, desc) => {
    console.error('[PolyEcho] load failed', code, desc)
    if (!win.isDestroyed()) win.show()
  })
  win.on('close', (event) => {
    if (forceClose.has(win)) {
      clearCloseWatchdog(win)
      return
    }
    const contents = win.webContents
    if (contents.isDestroyed() || contents.isCrashed()) return
    event.preventDefault()
    writeBounds(win)
    armCloseWatchdog(win)
    contents.send('desktop:closeRequest')
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isPackaged
      ? url.startsWith('file:')
      : url.startsWith(DEV_URL) || url.startsWith('http://localhost:')
    if (!allowed) event.preventDefault()
  })

  if (isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    win.loadURL(DEV_URL)
  }
}

app.whenReady().then(async () => {
  if (!gotLock) return
  await loadLastFolder()
  for (const p of await readRecent()) allowWrite(p)
  const launch = findProjectArg()
  if (launch) allowWrite(launch)
  if (isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders }
      headers['Content-Security-Policy'] = [
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data:; worker-src 'self' blob:"
      ]
      callback({ responseHeaders: headers })
    })
  }
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('second-instance', (_event, argv) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
  const filePath = findProjectArg(argv)
  if (filePath) {
    allowWrite(filePath)
    win.webContents.send('desktop:openExternal', filePath)
  }
})

process.on('uncaughtException', (err) => {
  try {
    const dest = crashLogPath()
    const line = `${new Date().toISOString()} [main] ${err.message}\n${err.stack || ''}\n\n`
    fs.appendFile(dest, line, 'utf8').catch(() => {})
  } catch {
    /* app path not ready */
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('desktop:setTitle', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && typeof title === 'string') win.setTitle(title)
})

ipcMain.handle('desktop:unsavedClose', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { response } = await dialog.showMessageBox(win ?? undefined, {
    type: 'question',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'PolyEcho',
    message: 'Save changes before closing?',
    detail: 'Unsaved edits will be lost if you don\'t save.'
  })
  return response
})

ipcMain.handle('desktop:allowClose', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  clearCloseWatchdog(win)
  forceClose.add(win)
  writeBounds(win)
  win.close()
})

ipcMain.handle('desktop:cancelClose', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) clearCloseWatchdog(win)
})

ipcMain.handle('desktop:saveFile', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win ?? undefined, {
    defaultPath: resolveDefaultPath(payload?.defaultPath),
    filters: Array.isArray(payload?.filters) ? payload.filters : undefined
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  await writeChosenFile(result.filePath, payload)
  allowWrite(result.filePath)
  await rememberFolder(result.filePath)
  return { canceled: false, path: result.filePath }
})

ipcMain.handle('desktop:writeFile', async (_event, payload) => {
  const dest = typeof payload?.path === 'string' ? payload.path : ''
  if (!dest || dest.includes('..') || !canWrite(dest)) return { ok: false }
  await writeChosenFile(dest, payload)
  await rememberFolder(dest)
  return { ok: true }
})

ipcMain.handle('desktop:revealInFolder', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return
  try {
    await fs.access(filePath)
    shell.showItemInFolder(filePath)
  } catch {
    /* missing */
  }
})

async function readRecent() {
  try {
    const list = JSON.parse(await fs.readFile(recentPath(), 'utf8'))
    return Array.isArray(list) ? list.filter(p => typeof p === 'string') : []
  } catch {
    return []
  }
}

async function writeRecent(filePath) {
  const next = [filePath, ...(await readRecent()).filter(p => p !== filePath)].slice(0, RECENT_MAX)
  await fs.writeFile(recentPath(), JSON.stringify(next), 'utf8')
  return next
}

ipcMain.handle('desktop:listRecent', () => readRecent())
ipcMain.handle('desktop:addRecent', (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return readRecent()
  allowWrite(filePath)
  return writeRecent(filePath)
})
ipcMain.handle('desktop:getLaunchPath', () => findProjectArg())
ipcMain.handle('desktop:logCrash', async (_event, payload) => {
  const source = typeof payload?.source === 'string' ? payload.source : 'app'
  const message = typeof payload?.message === 'string' ? payload.message : String(payload)
  const stack = typeof payload?.stack === 'string' ? payload.stack : ''
  const dest = crashLogPath()
  await fs.appendFile(dest, `${new Date().toISOString()} [${source}] ${message}\n${stack}\n\n`, 'utf8')
  try {
    const st = await fs.stat(dest)
    if (st.size > 512 * 1024) {
      const text = await fs.readFile(dest, 'utf8')
      await fs.writeFile(dest, text.slice(-256 * 1024), 'utf8')
    }
  } catch {
    /* keep appending */
  }
})
ipcMain.handle('desktop:revealCrashLog', async () => {
  const dest = crashLogPath()
  try {
    await fs.access(dest)
  } catch {
    await fs.writeFile(dest, '', 'utf8')
  }
  await shell.openPath(dest)
})
ipcMain.handle('desktop:showAbout', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  await dialog.showMessageBox(win ?? undefined, {
    type: 'info',
    title: 'About PolyEcho',
    message: 'PolyEcho',
    detail: `Version ${app.getVersion()}\nDesktop low-poly modeling, UV/paint, and animation.`
  })
})
ipcMain.handle('desktop:requestQuit', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.close()
})
ipcMain.handle('desktop:openPath', async (_event, filePath) => {
  if (typeof filePath !== 'string' || filePath.includes('..')) return { canceled: true }
  try {
    const text = await fs.readFile(filePath, 'utf8')
    allowWrite(filePath)
    return { canceled: false, path: filePath, name: path.basename(filePath), text }
  } catch {
    const list = (await readRecent()).filter(p => p !== filePath)
    await fs.writeFile(recentPath(), JSON.stringify(list), 'utf8')
    return { canceled: true }
  }
})

ipcMain.handle('desktop:openFile', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win ?? undefined, {
    properties: ['openFile'],
    defaultPath: lastFolder || undefined,
    filters: Array.isArray(payload?.filters) ? payload.filters : undefined
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  const filePath = result.filePaths[0]
  allowWrite(filePath)
  await rememberFolder(filePath)
  const name = path.basename(filePath)
  if (payload?.binary) {
    const buf = await fs.readFile(filePath)
    return { canceled: false, path: filePath, name, bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
  }
  const text = await fs.readFile(filePath, 'utf8')
  return { canceled: false, path: filePath, name, text }
})

async function writeChosenFile(dest, payload) {
  if (typeof payload?.text === 'string') {
    await fs.writeFile(dest, payload.text, 'utf8')
    return
  }
  if (payload?.bytes) {
    await fs.writeFile(dest, Buffer.from(payload.bytes))
  }
}
