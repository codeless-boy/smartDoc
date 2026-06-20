import { app, BrowserWindow } from 'electron'
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

let mainWindow: BrowserWindow | null = null
let svc: FileService | null = null
let repoRootRef: string | null = null

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
    setConfig('windowBounds', { x: b.x, y: b.y, width: b.width, height: b.height })
  })

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
    await bootstrap()
    createWindow()
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
