import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import { logger } from '@main/logger'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = pkg

export class UpdaterService {
  private state: UpdateState = { phase: 'idle' }
  private listeners = new Set<(s: UpdateState) => void>()

  init(getMainWindow: () => BrowserWindow | null): void {
    autoUpdater.logger = logger
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false // 显式由用户点击触发

    autoUpdater.on('checking-for-update', () => this.set({ phase: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.set({ phase: 'available', version: info.version })
    )
    autoUpdater.on('update-not-available', () =>
      this.set({ phase: 'not-available' })
    )
    autoUpdater.on('download-progress', (p) =>
      this.set({
        phase: 'downloading',
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond
      })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ phase: 'downloaded', version: info.version })
    )
    autoUpdater.on('error', (err) =>
      this.set({ phase: 'error', message: err.message })
    )

    // 启动 5 秒后首次检查；仅在打包模式下生效
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater
          .checkForUpdates()
          .catch((e) => logger.warn('updater check failed', e))
      }, 5000)
    } else {
      logger.info('updater skipped: not packaged')
    }

    // 防御：getMainWindow 当前未使用，但保留以便未来需要弹原生通知
    void getMainWindow
  }

  getState(): UpdateState {
    return this.state
  }

  subscribe(cb: (s: UpdateState) => void): () => void {
    this.listeners.add(cb)
    cb(this.state)
    return () => this.listeners.delete(cb)
  }

  async checkNow(): Promise<void> {
    if (!app.isPackaged) {
      this.set({ phase: 'not-available' })
      return
    }
    await autoUpdater.checkForUpdates()
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }

  private set(s: UpdateState): void {
    this.state = s
    logger.info('updater state', s.phase)
    for (const l of this.listeners) l(s)
  }
}
