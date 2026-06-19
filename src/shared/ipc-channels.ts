// 集中管理 IPC 通道名，避免主/渲染端硬编码字符串发散。
export const IPC = {
  ConfigGet: 'config:get',
  ConfigSet: 'config:set',
  FileImport: 'file:import',
  FileList: 'file:list',
  FileDelete: 'file:delete',
  FileOpen: 'file:open',
  FileShowInDir: 'file:showInDir',
  DialogPickFiles: 'dialog:pickFiles'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
