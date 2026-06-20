import { Tag } from 'antd'
import type { TagInfo } from '@shared/types'

interface Props {
  tag: TagInfo
  closable?: boolean
  onClose?: () => void
  onClick?: () => void
  selected?: boolean
}

export function TagChip({
  tag,
  closable,
  onClose,
  onClick,
  selected
}: Props): JSX.Element {
  return (
    <Tag
      color={tag.color}
      closable={closable}
      onClose={(e) => {
        e.preventDefault()
        onClose?.()
      }}
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : undefined,
        border: selected ? '2px solid #000' : undefined
      }}
    >
      {tag.name}
    </Tag>
  )
}
