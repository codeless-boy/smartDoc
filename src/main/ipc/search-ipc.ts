import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SearchSuggestion } from '@shared/types'
import type { SearchService } from '@main/services/search-service'

export function registerSearchIpc(svc: SearchService): void {
  ipcMain.handle(IPC.SearchSuggest, (_e, prefix: string): SearchSuggestion[] =>
    svc.suggest(prefix)
  )
}
