import Store from 'electron-store'
import type { AppConfig } from '@shared/types'

/**
 * 全局配置单例。仅 main 进程访问；renderer 通过 IPC 读写。
 * 默认值见 defaults。schema 提供基础类型校验；不合法字段会被忽略并使用默认值。
 */
const defaults: AppConfig = {
  repoPath: null,
  windowBounds: { width: 1280, height: 800 }
}

const store = new Store<AppConfig>({
  name: 'smartdoc-config',
  defaults,
  schema: {
    repoPath: { type: ['string', 'null'] },
    windowBounds: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' }
      },
      required: ['width', 'height']
    }
  }
})

export function getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return store.get(key)
}

export function setConfig<K extends keyof AppConfig>(
  key: K,
  value: AppConfig[K]
): void {
  store.set(key, value)
}

export function getAllConfig(): AppConfig {
  return store.store
}
