import { useEffect } from 'react'
import { useAppStore } from '@renderer/store/app-store'

/** 监听 filter 变化，拉取 files；同时刷新 tags 一次。 */
export function useFiles(): void {
  const filter = useAppStore((s) => s.filter)
  const setFiles = useAppStore((s) => s.setFiles)
  const setTags = useAppStore((s) => s.setTags)
  const setLoading = useAppStore((s) => s.setLoading)

  useEffect(() => {
    void window.api.tag.list().then(setTags)
  }, [setTags])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api.file
      .list({ filter })
      .then((rows) => {
        if (!cancelled) setFiles(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filter, setFiles, setLoading])
}

/** 强制全量刷新 files + tags（导入/删除后调用） */
export async function refreshAll(): Promise<void> {
  const { filter } = useAppStore.getState()
  const [files, tags] = await Promise.all([
    window.api.file.list({ filter }),
    window.api.tag.list()
  ])
  useAppStore.setState({ files, tags })
}
