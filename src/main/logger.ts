import log from 'electron-log/main'
import { app } from 'electron'
import path from 'node:path'

/**
 * 初始化全局日志：
 *  - 文件路径：{userData}/logs/main.log
 *  - 单文件 5MB，保留最近 5 个
 *  - 接管 console.* 与未捕获异常
 */
export function initLogger(): void {
  log.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', 'main.log')
  log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.level = app.isPackaged ? 'info' : 'debug'
  log.transports.file.level = app.isPackaged ? 'info' : 'debug'

  // 接管 console，并捕获未处理异常
  Object.assign(console, log.functions)
  log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error }) => log.error('uncaught', error)
  })
}

export const logger = log
