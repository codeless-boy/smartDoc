import { Button, Empty, Skeleton, Typography } from 'antd'
import type { EmptyStateKind } from '@renderer/lib/derive-empty-state'
import { useAppStore } from '@renderer/store/app-store'

interface Props {
  state: EmptyStateKind
  onImport: () => void
}

export function EmptyState({ state, onImport }: Props): JSX.Element {
  if (state.kind === 'loading') {
    return (
      <div data-testid="empty-loading" style={{ padding: 16 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton.Input
            key={i}
            active
            block
            style={{ marginBottom: 8, height: 32 }}
          />
        ))}
      </div>
    )
  }

  if (state.kind === 'onboarding') {
    return (
      <div
        data-testid="empty-onboarding"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 16
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <Typography.Title level={5} style={{ marginBottom: 4 }}>
                还没有文件
              </Typography.Title>
              <Typography.Text type="secondary">
                把文件拖进来，或点下方按钮选择
              </Typography.Text>
            </div>
          }
        />
        <Button type="primary" onClick={onImport}>
          导入第一个文件
        </Button>
      </div>
    )
  }

  // no-match
  return (
    <div
      data-testid="empty-no-match"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 12
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Typography.Title level={5} style={{ marginBottom: 4 }}>
              没有匹配的文件
            </Typography.Title>
            <Typography.Text type="secondary">
              当前筛选：{state.activeFilters.join('，')}
            </Typography.Text>
          </div>
        }
      />
      <Button type="link" onClick={() => useAppStore.getState().resetFilter()}>
        清除筛选
      </Button>
    </div>
  )
}
