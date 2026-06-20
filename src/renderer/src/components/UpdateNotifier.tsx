import { useEffect } from 'react'
import { notification } from 'antd'
import type { UpdateState } from '@shared/types'

/**
 * 监听 updater 状态：
 *  - downloaded：右下角通知提示重启
 *  - error：仅落日志，不打扰用户（已写入 main.log）
 */
export function UpdateNotifier(): null {
  const [api, contextHolder] = notification.useNotification()

  useEffect(() => {
    const off = window.api.updater.onState((s: UpdateState) => {
      if (s.phase === 'downloaded') {
        api.success({
          key: 'updater-ready',
          message: '新版本已就绪',
          description: `smartDoc ${s.version} 已下载，重启应用即可完成更新。`,
          duration: 0,
          btn: (
            <a
              onClick={() => {
                void window.api.updater.quitAndInstall()
              }}
            >
              立即重启
            </a>
          )
        })
      }
    })
    return off
  }, [api])

  return contextHolder as unknown as null
}
