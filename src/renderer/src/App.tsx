import { useCallback, useEffect, useState } from 'react'
import type { FileInfo, ImportItemStatus } from '@shared/types'

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'system-ui, sans-serif', padding: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  btn: { padding: '6px 12px', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '6px 8px', borderBottom: '1px solid #eee' }
}

export function App(): JSX.Element {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [message, setMessage] = useState<string>('')

  const refresh = useCallback(async () => {
    setFiles(await window.api.file.list({}))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const importFiles = useCallback(async () => {
    const paths = await window.api.dialog.pickFiles()
    if (paths.length === 0) return
    let imported = 0
    let duplicates = 0
    for (const p of paths) {
      const r: ImportItemStatus = await window.api.file.import({ sourcePath: p })
      if (r.status === 'imported') imported++
      else if (r.status === 'duplicate') {
        // Part 1：遇重名一律保留两份，Part 2 改为弹对话框
        const r2 = await window.api.file.import({
          sourcePath: p,
          duplicateAction: 'keep-both'
        })
        if (r2.status === 'imported') imported++
        duplicates++
      }
    }
    setMessage(`已导入 ${imported} 个文件${duplicates ? `（重名 ${duplicates}）` : ''}`)
    await refresh()
  }, [refresh])

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>smartDoc · Part 1 占位</h2>
        <button style={styles.btn} onClick={importFiles}>
          导入文件
        </button>
        <span>{message}</span>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <td style={styles.td}>文件名</td>
            <td style={styles.td}>大小</td>
            <td style={styles.td}>导入时间</td>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td style={styles.td}>{f.name}</td>
              <td style={styles.td}>{f.size}</td>
              <td style={styles.td}>{f.importedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
