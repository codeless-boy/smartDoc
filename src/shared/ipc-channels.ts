// 集中管理 IPC 通道名，避免主/渲染端硬编码字符串发散。
export const IPC = {
  ConfigGet: 'config:get',
  ConfigSet: 'config:set',
  FileImport: 'file:import',
  FileImportProgress: 'file:importProgress',
  FileList: 'file:list',
  FileDelete: 'file:delete',
  FileOpen: 'file:open',
  FileUpdate: 'file:update',
  FileExistsOnDisk: 'file:existsOnDisk',
  DialogPickFiles: 'dialog:pickFiles',
  DialogPickDirectory: 'dialog:pickDirectory',
  TagList: 'tag:list',
  TagCreate: 'tag:create',
  TagDelete: 'tag:delete',
  TagUpdate: 'tag:update',
  TagSetOnFile: 'tag:setOnFile',
  SearchSuggest: 'search:suggest',
  FileOpenLog: 'file:openLog',
  UpdaterGetState: 'updater:getState',
  UpdaterSubscribe: 'updater:subscribe',
  UpdaterCheck: 'updater:check',
  UpdaterQuitAndInstall: 'updater:quitAndInstall'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
