// src/preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  file: {
    import: (paths) => ipcRenderer.invoke('file:import', paths),
    delete: (ids) => ipcRenderer.invoke('file:delete', ids),
    update: (id, fields) => ipcRenderer.invoke('file:update', id, fields),
    list: (query) => ipcRenderer.invoke('file:list', query),
    open: (id) => ipcRenderer.invoke('file:open', id),
    showInDir: (id) => ipcRenderer.invoke('file:showInDir', id),
    detail: (id) => ipcRenderer.invoke('file:detail', id),
  },
  tag: {
    list: () => ipcRenderer.invoke('tag:list'),
    create: (name, color) => ipcRenderer.invoke('tag:create', name, color),
    delete: (id) => ipcRenderer.invoke('tag:delete', id),
    update: (id, fields) => ipcRenderer.invoke('tag:update', id, fields),
    setOnFile: (fileId, tagIds) => ipcRenderer.invoke('tag:setOnFile', fileId, tagIds),
  },
  search: {
    files: (keyword, filters) => ipcRenderer.invoke('search:files', keyword, filters),
    suggest: (prefix) => ipcRenderer.invoke('search:suggest', prefix),
  },
  panel: {
    recent: (limit) => ipcRenderer.invoke('panel:recent', limit),
    untagged: () => ipcRenderer.invoke('panel:untagged'),
    frequent: () => ipcRenderer.invoke('panel:frequent'),
    typeCounts: () => ipcRenderer.invoke('panel:typeCounts'),
    tagsWithCount: () => ipcRenderer.invoke('panel:tagsWithCount'),
  },
  dialog: {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  },
});
