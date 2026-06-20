import { ipcMain, BrowserWindow, webContents } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { UpdateState } from '@shared/types'
import type { UpdaterService } from '@main/services/updater-service'

export function registerUpdaterIpc(svc: UpdaterService): void {
  ipcMain.handle(IPC.UpdaterGetState, (): UpdateState => svc.getState())
  ipcMain.handle(IPC.UpdaterCheck, (): Promise<void> => svc.checkNow())
  ipcMain.handle(IPC.UpdaterQuitAndInstall, (): void => svc.quitAndInstall())

  // 一次广播给所有窗口（webContents.send）
  svc.subscribe((state) => {
    for (const wc of webContents.getAllWebContents()) {
      wc.send('updater:state', state)
    }
  })

  // renderer 显式订阅（启动时调用一次以确保收到当前 state）
  ipcMain.handle(IPC.UpdaterSubscribe, (e): UpdateState => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) e.sender.send('updater:state', svc.getState())
    return svc.getState()
  })
}
