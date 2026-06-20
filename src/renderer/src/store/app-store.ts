import { create } from 'zustand'
import type { FileFilter, FileWithTags, TagInfo } from '@shared/types'

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

  // actions
  setFiles: (files: FileWithTags[]) => void
  setTags: (tags: TagInfo[]) => void
  setKeyword: (kw: string) => void
  patchFilter: (patch: Partial<FileFilter>) => void
  resetFilter: () => void
  select: (id: string | null) => void
  setLoading: (b: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  files: [],
  tags: [],
  filter: {},
  keyword: '',
  selectedId: null,
  loading: false,

  setFiles: (files) => set({ files }),
  setTags: (tags) => set({ tags }),
  setKeyword: (keyword) =>
    set((s) => ({ keyword, filter: { ...s.filter, keyword } })),
  patchFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: {}, keyword: '' }),
  select: (selectedId) => set({ selectedId }),
  setLoading: (loading) => set({ loading })
}))
