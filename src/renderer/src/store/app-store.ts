import { create } from 'zustand'
import type { FileFilter, FileWithTags, TagInfo } from '@shared/types'

interface ContextMenuTarget {
  id: string
  x: number
  y: number
}

interface AppState {
  // 数据
  files: FileWithTags[]
  tags: TagInfo[]

  // 筛选 / 搜索
  filter: FileFilter
  keyword: string

  // 选中
  selectedId: string | null

  // 加载状态
  loading: boolean

  // 右键菜单（0.2.0 新增）
  contextMenuTarget: ContextMenuTarget | null

  // actions
  setFiles: (files: FileWithTags[]) => void
  setTags: (tags: TagInfo[]) => void
  setKeyword: (kw: string) => void
  patchFilter: (patch: Partial<FileFilter>) => void
  resetFilter: () => void
  select: (id: string | null) => void
  setLoading: (b: boolean) => void
  openContextMenu: (target: ContextMenuTarget) => void
  closeContextMenu: () => void
}

export const useAppStore = create<AppState>((set) => ({
  files: [],
  tags: [],
  filter: {},
  keyword: '',
  selectedId: null,
  loading: false,
  contextMenuTarget: null,

  setFiles: (files) => set({ files }),
  setTags: (tags) => set({ tags }),
  setKeyword: (keyword) =>
    set((s) => ({ keyword, filter: { ...s.filter, keyword } })),
  patchFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: {}, keyword: '' }),
  select: (selectedId) => set({ selectedId }),
  setLoading: (loading) => set({ loading }),
  openContextMenu: (target) => set({ contextMenuTarget: target }),
  closeContextMenu: () => set({ contextMenuTarget: null })
}))
