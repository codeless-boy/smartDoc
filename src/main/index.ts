import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initLogger, logger } from '@main/logger'
import { getConfig, setConfig } from '@main/config'
import { openDatabase } from '@main/database'
import { FileRepo } from '@main/repo/file-repo'
import { FileService } from '@main/services/file-service'
import { registerFileIpc } from '@main/ipc/file-ipc'
import { registerConfigIpc } from '@main/ipc/config-ipc'

let mainWindow: BrowserWindow | null = null
let svc: FileService | null = null
let repoRootRef: string | null = null

/**
 * 首次启动若未配置 repoPath，引导用户选择目录。
 * Part 1 阶段直接弹窗；Part 2 起改为渲染端的引导页。
 */
async function ensureRepoPath(): Promise<string> {
  const existing = getConfig('repoPath')
  if (existing && fs.existsSync(existing)) return existing

  const result = await dialog.showOpenDialog({
    title: '选择 smartDoc 仓库目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    app.quit()
    throw new Error('user-cancelled-repo-path')
  }
  const chosen = result.filePaths[0]
  setConfig('repoPath', chosen)
  return chosen
}

async function bootstrap(): Promise<void> {
  initLogger()
  logger.info('smartDoc starting, version', app.getVersion())

  const repoRoot = await ensureRepoPath()
  repoRootRef = repoRoot
  fs.mkdirSync(path.join(repoRoot, 'files'), { recursive: true })

  const dbPath = path.join(app.getPath('userData'), 'smartdoc.db')
  const db = openDatabase(dbPath)
  const repo = new FileRepo(repoRoot)
  svc = new FileService(db, repo)

  registerConfigIpc()
  registerFileIpc(svc, () => repoRootRef)
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
      preload: path.join(__dirname, '../preload/index.mjs'),
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
