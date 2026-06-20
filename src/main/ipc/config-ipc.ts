import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { AppConfig } from '@shared/types'
import { getAllConfig, setConfig } from '@main/config'

export function registerConfigIpc(): void {
  ipcMain.handle(IPC.ConfigGet, (): AppConfig => getAllConfig())
  ipcMain.handle(
    IPC.ConfigSet,
    <K extends keyof AppConfig>(_e: unknown, key: K, value: AppConfig[K]) => {
      setConfig(key, value)
    }
  )
}
