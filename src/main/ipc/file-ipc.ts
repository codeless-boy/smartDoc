import { ipcMain, shell, BrowserWindow, dialog, webContents } from 'electron'
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
    const file = svc.list({ filter: {} }).find((f) => f.id === id)
    const root = repoRoot()
    if (!file || !root) return
    const abs = path.join(root, file.storagePath)
    const err = await shell.openPath(abs)
    if (err) {
      logger.warn('shell.openPath failed', abs, err)
      return
    }
    svc.logOpen(id)
  })

  ipcMain.handle(IPC.FileOpenLog, (_e, id: string): void => svc.logOpen(id))

  ipcMain.handle(IPC.FileUpdate, (_e, id: string, fields: { note?: string }) => {
    if (typeof fields.note === 'string') return svc.updateNote(id, fields.note)
    return svc.list({ filter: {} }).find((f) => f.id === id) ?? null
  })

  ipcMain.handle(IPC.FileExistsOnDisk, async (_e, id: string): Promise<boolean> =>
    svc.existsOnDisk(id)
  )

  ipcMain.handle(IPC.DialogPickFiles, async (): Promise<string[]> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections']
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle(IPC.DialogPickDirectory, async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  // 让窗口在 ready 时把当前列表广播给 renderer（可选；Part 1 渲染端用主动 fetch）
  void BrowserWindow

  // 大文件导入进度：把 service 的进度回调广播给所有渲染端
  svc.setProgressEmitter((p) => {
    for (const wc of webContents.getAllWebContents()) {
      wc.send(IPC.FileImportProgress, p)
    }
  })
}
