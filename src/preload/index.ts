import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  AppConfig,
  FileInfo,
  FileWithTags,
  ImportRequest,
  ImportItemStatus,
  ListQuery,
  SearchSuggestion,
  TagInfo,
  UpdateState
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
    list: (query: ListQuery = {}): Promise<FileWithTags[]> =>
      ipcRenderer.invoke(IPC.FileList, query),
    delete: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.FileDelete, ids),
    open: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FileOpen, id),
    showInDir: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.FileShowInDir, id),
    openLog: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FileOpenLog, id),
    update: (id: string, fields: { note?: string }): Promise<FileInfo | null> =>
      ipcRenderer.invoke(IPC.FileUpdate, id, fields),
    existsOnDisk: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.FileExistsOnDisk, id)
  },
  dialog: {
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.DialogPickFiles),
    pickDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.DialogPickDirectory)
  },
  tag: {
    list: (): Promise<TagInfo[]> => ipcRenderer.invoke(IPC.TagList),
    create: (input: { name: string; color?: string }): Promise<TagInfo> =>
      ipcRenderer.invoke(IPC.TagCreate, input),
    update: (
      id: string,
      fields: { name?: string; color?: string }
    ): Promise<TagInfo> => ipcRenderer.invoke(IPC.TagUpdate, id, fields),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TagDelete, id),
    setOnFile: (fileId: string, tagIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.TagSetOnFile, fileId, tagIds)
  },
  search: {
    suggest: (prefix: string): Promise<SearchSuggestion[]> =>
      ipcRenderer.invoke(IPC.SearchSuggest, prefix)
  },
  updater: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.UpdaterGetState),
    check: (): Promise<void> => ipcRenderer.invoke(IPC.UpdaterCheck),
    quitAndInstall: (): Promise<void> =>
      ipcRenderer.invoke(IPC.UpdaterQuitAndInstall),
    onState: (cb: (s: UpdateState) => void): (() => void) => {
      const handler = (_e: unknown, s: UpdateState): void => cb(s)
      ipcRenderer.on('updater:state', handler)
      void ipcRenderer.invoke(IPC.UpdaterSubscribe)
      return () => ipcRenderer.removeListener('updater:state', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
