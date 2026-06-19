import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface Fixtures {
  app: ElectronApplication
  page: Page
  /** 隔离的仓库目录绝对路径，每条用例独立 */
  repoDir: string
  /** 写一个内容到 tmp 目录并返回路径，便于触发导入 */
  writeSource: (name: string, content?: string) => Promise<string>
}

export const test = base.extend<Fixtures>({
  repoDir: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartdoc-e2e-repo-'))
    await use(dir)
    await fs.rm(dir, { recursive: true, force: true })
  },

  app: async ({ repoDir }, use) => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartdoc-e2e-data-'))
    // 预置 config 文件，避免启动时弹仓库选择对话框
    await fs.writeFile(
      path.join(userDataDir, 'smartdoc-config.json'),
      JSON.stringify({ repoPath: repoDir })
    )
    const electronApp = await _electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        SMARTDOC_USER_DATA: userDataDir
      }
    })
    await use(electronApp)
    await electronApp.close()
    await fs.rm(userDataDir, { recursive: true, force: true })
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },

  writeSource: async ({}, use) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartdoc-e2e-src-'))
    async function writer(name: string, content = name): Promise<string> {
      const p = path.join(tmpDir, name)
      await fs.writeFile(p, content)
      return p
    }
    await use(writer)
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

export { expect } from '@playwright/test'
