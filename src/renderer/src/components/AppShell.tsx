import { useEffect, useState } from 'react'
import { Layout } from 'antd'
import type { DuplicateAction, FileInfo } from '@shared/types'
import { useFiles } from '@renderer/api/use-files'
import { useImport } from '@renderer/hooks/use-import'
import { useShortcuts } from '@renderer/hooks/use-shortcuts'
import { TopBar } from './TopBar'
import { SidePanel } from './SidePanel'
import { FileTable } from './FileTable'
import { FileDrawer } from './FileDrawer'
import { DropZone } from './DropZone'
import { DuplicateDialog } from './DuplicateDialog'
import { FirstRunGuide } from './FirstRunGuide'
import { UpdateNotifier } from './UpdateNotifier'
import { ImportProgress } from './ImportProgress'

export function AppShell(): JSX.Element {
  useFiles()
  const [repoReady, setRepoReady] = useState<boolean | null>(null)

  useEffect(() => {
    void window.api.config.getAll().then((c) => setRepoReady(!!c.repoPath))
  }, [])

  // 共享的导入入口：TopBar 按钮、EmptyState onboarding 按钮、键盘 Ctrl+I 共用。
  const { pickAndImport, dup: importDup, setDup: setImportDup } = useImport()

  // 全局键盘快捷键
  useShortcuts(pickAndImport)

  // DropZone 的重名对话框走另一条路径（Promise 直接 resolve），保持原状。
  const [dropDup, setDropDup] = useState<{
    sourcePath: string
    existing: FileInfo
    resolve: (a: DuplicateAction) => void
  } | null>(null)

  function askDuplicate(
    sourcePath: string,
    existing: FileInfo
  ): Promise<DuplicateAction> {
    return new Promise((resolve) =>
      setDropDup({ sourcePath, existing, resolve })
    )
  }

  if (repoReady === null) return <></>
  if (!repoReady) return <FirstRunGuide onChosen={() => setRepoReady(true)} />

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Header
        style={{
          padding: 0,
          borderBottom: '1px solid #e8e8e8',
          height: 48,
          lineHeight: '48px'
        }}
      >
        <TopBar pickAndImport={pickAndImport} />
      </Layout.Header>
      <Layout>
        <Layout.Sider width={220}>
          <SidePanel />
        </Layout.Sider>
        <Layout.Content style={{ overflow: 'auto', padding: 12 }}>
          <FileTable pickAndImport={pickAndImport} />
        </Layout.Content>
      </Layout>
      <FileDrawer />
      <DropZone onDuplicate={askDuplicate} />
      {importDup && (
        <DuplicateDialog
          open
          sourcePath={importDup.sourcePath}
          existing={importDup.existing}
          onChoose={(a) => {
            ;(window as any).__smartdoc_dupResolver?.(a)
            setImportDup(null)
          }}
          onCancel={() => {
            ;(window as any).__smartdoc_dupResolver?.('skip')
            setImportDup(null)
          }}
        />
      )}
      {dropDup && (
        <DuplicateDialog
          open
          sourcePath={dropDup.sourcePath}
          existing={dropDup.existing}
          onChoose={(a) => {
            dropDup.resolve(a)
            setDropDup(null)
          }}
          onCancel={() => {
            dropDup.resolve('skip')
            setDropDup(null)
          }}
        />
      )}
      <UpdateNotifier />
      <ImportProgress />
    </Layout>
  )
}
