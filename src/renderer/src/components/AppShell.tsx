import { useState } from 'react'
import { Layout } from 'antd'
import type { DuplicateAction, FileInfo } from '@shared/types'
import { useFiles } from '@renderer/api/use-files'
import { TopBar } from './TopBar'
import { SidePanel } from './SidePanel'
import { FileTable } from './FileTable'
import { FileDrawer } from './FileDrawer'
import { DropZone } from './DropZone'
import { DuplicateDialog } from './DuplicateDialog'

export function AppShell(): JSX.Element {
  useFiles()

  const [dup, setDup] = useState<{
    sourcePath: string
    existing: FileInfo
    resolve: (a: DuplicateAction) => void
  } | null>(null)

  function askDuplicate(
    sourcePath: string,
    existing: FileInfo
  ): Promise<DuplicateAction> {
    return new Promise((resolve) => setDup({ sourcePath, existing, resolve }))
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Header
        style={{ background: '#fff', padding: 0, borderBottom: '1px solid #eee' }}
      >
        <TopBar />
      </Layout.Header>
      <Layout>
        <Layout.Sider width={220} style={{ background: '#fff' }}>
          <SidePanel />
        </Layout.Sider>
        <Layout.Content style={{ overflow: 'auto', padding: 12 }}>
          <FileTable />
        </Layout.Content>
      </Layout>
      <FileDrawer />
      <DropZone onDuplicate={askDuplicate} />
      {dup && (
        <DuplicateDialog
          open
          sourcePath={dup.sourcePath}
          existing={dup.existing}
          onChoose={(a) => {
            dup.resolve(a)
            setDup(null)
          }}
          onCancel={() => {
            dup.resolve('skip')
            setDup(null)
          }}
        />
      )}
    </Layout>
  )
}
