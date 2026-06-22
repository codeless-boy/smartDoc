import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initLogger, logger } from '@main/logger'
import { getConfig, setConfig } from '@main/config'
import { openDatabase } from '@main/database'
import { FileRepo } from '@main/repo/file-repo'
import { FileService } from '@main/services/file-service'
import { TagService } from '@main/services/tag-service'
import { SearchService } from '@main/services/search-service'
import { registerFileIpc } from '@main/ipc/file-ipc'
import { registerConfigIpc } from '@main/ipc/config-ipc'
import { registerTagIpc } from '@main/ipc/tag-ipc'
import { registerSearchIpc } from '@main/ipc/search-ipc'
import { UpdaterService } from '@main/services/updater-service'
import { registerUpdaterIpc } from '@main/ipc/updater-ipc'

let mainWindow: BrowserWindow | null = null
let svc: FileService | null = null
let repoRootRef: string | null = null
let updater: UpdaterService | null = null

async function bootstrap(): Promise<void> {
  initLogger()
  logger.info('smartDoc starting, version', app.getVersion())

  const dbPath = path.join(app.getPath('userData'), 'smartdoc.db')
  const db = openDatabase(dbPath)
  // repoPath may be null on first run; FileRepo starts against a pending path
  // and gets retargeted via config:set → onRepoPathChanged when the renderer
  // guide picks a directory.
  const configuredRepo = getConfig('repoPath')
  const repo = new FileRepo(
    configuredRepo ?? path.join(app.getPath('userData'), 'pending-repo')
  )
  if (configuredRepo) {
    fs.mkdirSync(path.join(configuredRepo, 'files'), { recursive: true })
  }
  repoRootRef = configuredRepo
  svc = new FileService(db, repo)
  const tagSvc = new TagService(db)
  const searchSvc = new SearchService(db)

  registerConfigIpc({
    onRepoPathChanged: (p) => {
      repo.setRoot(p)
      repoRootRef = p
    }
  })
  registerFileIpc(svc, () => repoRootRef)
  registerTagIpc(tagSvc)
  registerSearchIpc(searchSvc)

  updater = new UpdaterService()
  registerUpdaterIpc(updater)
}

function createWindow(): void {
  const bounds = getConfig('windowBounds') ?? { width: 1280, height: 800 }
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', () => {
    if (!mainWindow) return
    const b = mainWindow.getBounds()
    setConfig('windowBounds', {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height
    })
  })

  // dev 模式保留 DevTools 快捷键（F12 / Ctrl+Shift+I）。
  // 生产构建不注册，避免用户误开。
  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isF12 = input.key === 'F12'
      const isCtrlShiftI =
        input.control && input.shift && input.key.toLowerCase() === 'i'
      if (isF12 || isCtrlShiftI) {
        mainWindow?.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

if (process.env['SMARTDOC_USER_DATA']) {
  app.setPath('userData', process.env['SMARTDOC_USER_DATA'])
}

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null) // 去掉默认 File/Edit/View 菜单条
    await bootstrap()
    createWindow()
    if (updater) updater.init(() => mainWindow)
  } catch (err) {
    logger.error('bootstrap failed', err)
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
