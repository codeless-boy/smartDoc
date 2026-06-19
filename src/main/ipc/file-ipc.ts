import { ipcMain, shell, BrowserWindow } from 'electron'
import path from 'node:path'
import { IPC } from '@shared/ipc-channels'
import type {
  FileInfo,
  ImportRequest,
  ImportItemStatus,
  ListQuery
} from '@shared/types'
import { logger } from '@main/logger'
import type { FileService } from '@main/services/file-service'

export function registerFileIpc(svc: FileService, repoRoot: () => string | null): void {
  ipcMain.handle(
    IPC.FileImport,
    async (_e, req: ImportRequest): Promise<ImportItemStatus> => {
      logger.debug('ipc file:import', req.sourcePath, req.duplicateAction)
      return svc.import(req)
    }
  )

  ipcMain.handle(IPC.FileList, async (_e, query: ListQuery): Promise<FileInfo[]> => {
    return svc.list(query)
  })

  ipcMain.handle(IPC.FileDelete, async (_e, ids: string[]): Promise<void> => {
    logger.info('ipc file:delete', ids)
    await svc.delete(ids)
  })

  ipcMain.handle(IPC.FileOpen, async (_e, id: string): Promise<void> => {
    const file = svc.list({}).find((f) => f.id === id)
    const root = repoRoot()
    if (!file || !root) return
    const abs = path.join(root, file.storagePath)
    const err = await shell.openPath(abs)
    if (err) logger.warn('shell.openPath failed', abs, err)
  })

  ipcMain.handle(IPC.FileShowInDir, async (_e, id: string): Promise<void> => {
    const file = svc.list({}).find((f) => f.id === id)
    const root = repoRoot()
    if (!file || !root) return
    shell.showItemInFolder(path.join(root, file.storagePath))
  })

  // 让窗口在 ready 时把当前列表广播给 renderer（可选；Part 1 渲染端用主动 fetch）
  void BrowserWindow
}
