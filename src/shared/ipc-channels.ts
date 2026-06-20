// 集中管理 IPC 通道名，避免主/渲染端硬编码字符串发散。
export const IPC = {
  ConfigGet: 'config:get',
  ConfigSet: 'config:set',
  FileImport: 'file:import',
  FileList: 'file:list',
  FileDelete: 'file:delete',
  FileOpen: 'file:open',
  FileShowInDir: 'file:showInDir',
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
  FileOpenLog: 'file:openLog'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
