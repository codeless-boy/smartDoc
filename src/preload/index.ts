import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  AppConfig,
  FileInfo,
  ImportRequest,
  ImportItemStatus,
  ListQuery
} from '@shared/types'

const api = {
  config: {
    getAll: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.ConfigGet),
    set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> =>
      ipcRenderer.invoke(IPC.ConfigSet, key, value)
  },
  file: {
    import: (req: ImportRequest): Promise<ImportItemStatus> =>
      ipcRenderer.invoke(IPC.FileImport, req),
    list: (query: ListQuery = {}): Promise<FileInfo[]> =>
      ipcRenderer.invoke(IPC.FileList, query),
    delete: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.FileDelete, ids),
    open: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FileOpen, id),
    showInDir: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.FileShowInDir, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
