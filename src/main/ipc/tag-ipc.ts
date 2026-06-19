import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { TagInfo } from '@shared/types'
import type { TagService } from '@main/services/tag-service'

export function registerTagIpc(svc: TagService): void {
  ipcMain.handle(IPC.TagList, (): TagInfo[] => svc.list())
  ipcMain.handle(
    IPC.TagCreate,
    (_e, input: { name: string; color?: string }): TagInfo => svc.create(input)
  )
  ipcMain.handle(
    IPC.TagUpdate,
    (
      _e,
      id: string,
      fields: { name?: string; color?: string }
    ): TagInfo => svc.update(id, fields)
  )
  ipcMain.handle(IPC.TagDelete, (_e, id: string): void => svc.delete(id))
  ipcMain.handle(
    IPC.TagSetOnFile,
    (_e, fileId: string, tagIds: string[]): void => svc.setOnFile(fileId, tagIds)
  )
}
