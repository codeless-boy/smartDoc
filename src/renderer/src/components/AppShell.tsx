import { useEffect, useState } from 'react'
import { Layout } from 'antd'
import type { DuplicateAction, FileInfo } from '@shared/types'
import { useFiles } from '@renderer/api/use-files'
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

  if (repoReady === null) return <></>
  if (!repoReady) return <FirstRunGuide onChosen={() => setRepoReady(true)} />

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Header
        style={{
          background: '#fff',
          padding: 0,
          borderBottom: '1px solid #eee'
        }}
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
      <UpdateNotifier />
      <ImportProgress />
    </Layout>
  )
}
