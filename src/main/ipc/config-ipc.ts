import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC } from '@shared/ipc-channels'
import type { AppConfig } from '@shared/types'
import { getAllConfig, setConfig } from '@main/config'

interface Hooks {
  onRepoPathChanged: (newPath: string) => void
}

export function registerConfigIpc(hooks: Hooks): void {
  ipcMain.handle(IPC.ConfigGet, (): AppConfig => getAllConfig())
  ipcMain.handle(
    IPC.ConfigSet,
    <K extends keyof AppConfig>(_e: unknown, key: K, value: AppConfig[K]) => {
      setConfig(key, value)
      if (key === 'repoPath' && typeof value === 'string') {
        fs.mkdirSync(path.join(value, 'files'), { recursive: true })
        hooks.onRepoPathChanged(value)
      }
    }
  )
}
