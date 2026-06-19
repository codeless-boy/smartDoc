# smartDoc Part 3 — 打包发布与自动更新 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 electron-builder 把 smartDoc 打成 Windows NSIS 安装包，配合 electron-updater 实现"启动后台检查 → 静默下载 → 提示重启"的自动更新；补齐"首次启动引导仓库目录"和"超大文件进度条"两个交付级 UX；为后续版本搭好 GitHub Actions 的发布流水线。

**Architecture:** electron-builder 读取 `electron-builder.yml`，把 Part 1/2 产物 (`out/`) 与 native 模块 (`better-sqlite3`) 一起打成 NSIS 安装包；`publish` 配置 `github` provider，发布时输出 `latest.yml` 与 `*.exe.blockmap`。Main 进程内 `UpdaterService` 封装 `autoUpdater` 全部生命周期，仅在生产构建生效；renderer 通过 IPC 订阅状态展示更新提示。

**Tech Stack:** electron-builder、electron-updater、GitHub Actions（可选，本计划提供配置文件但不要求执行）。继承 Part 1/2 全部依赖。

**先决条件:** Part 1 与 Part 2 已合并；`npm run test:run && npm run test:e2e && npm run build` 全绿。Part 3 在新分支 `feat/part3-release` 上进行。

---

## 文件结构

新增/修改的文件清单：

| 文件 | 责任 |
|------|------|
| `package.json` | 追加 electron-updater、build 脚本、author/repository 字段 |
| `electron-builder.yml` | NSIS / asarUnpack / publish 配置 |
| `build/icon.ico` | Windows 应用图标（占位，实际可替换） |
| `build/installer.nsh` | NSIS 自定义脚本（默认安装路径等，可选） |
| `src/shared/ipc-channels.ts` | 追加 updater:* 通道 |
| `src/shared/types.ts` | 追加 UpdateState |
| `src/main/services/updater-service.ts` | electron-updater 封装 |
| `src/main/ipc/updater-ipc.ts` | updater IPC |
| `src/main/index.ts` | 启动后初始化 updater；引导仓库目录从 main 移到 renderer |
| `src/main/services/file-service.ts` | 追加导入进度回调（>500MB 文件） |
| `src/preload/index.ts` | 暴露 updater api 与进度订阅 |
| `src/renderer/src/components/FirstRunGuide.tsx` | 首次启动引导页 |
| `src/renderer/src/components/UpdateNotifier.tsx` | 更新就绪 toast |
| `src/renderer/src/components/ImportProgress.tsx` | 大文件进度条 |
| `src/renderer/src/components/AppShell.tsx` | 装入 UpdateNotifier |
| `.github/workflows/release.yml` | GitHub Actions 发布流水线 |
| `README.md` | 发布说明 |

---

## Task 1: 安装 Part 3 依赖与基础元数据

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 切分支**

```bash
git checkout -b feat/part3-release
```

- [ ] **Step 2: 在 `dependencies` 追加**

```json
"electron-updater": "^6.3.0"
```

- [ ] **Step 3: 在 `devDependencies` 追加**

```json
"electron-builder": "^25.0.0"
```

- [ ] **Step 4: 在顶层 package.json 追加 build / publish / repository / author 字段**

```json
"author": {
  "name": "smartDoc",
  "email": "smartdoc@example.com"
},
"repository": {
  "type": "git",
  "url": "https://github.com/<owner>/smartDoc.git"
},
```

> **替换 `<owner>` 为实际 GitHub owner**——不替换不影响本地打包，但 electron-updater 通过 GitHub provider 检查更新时会用到。

- [ ] **Step 5: 在 `scripts` 追加**

```json
"package:dir": "electron-vite build && electron-builder --dir",
"package": "electron-vite build && electron-builder --win",
"publish": "electron-vite build && electron-builder --win --publish always",
"postinstall": "electron-builder install-app-deps"
```

> `postinstall` 触发 better-sqlite3 针对 Electron 版本重编译，避免 ABI 不匹配。

- [ ] **Step 6: 安装**

Run: `npm install`
Expected: 装好；`postinstall` 触发 native rebuild。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron-builder and electron-updater"
```

---

## Task 2: electron-builder 配置

**Files:**
- Create: `electron-builder.yml`
- Create: `build/icon.ico`（占位）

- [ ] **Step 1: 写 `electron-builder.yml`**

```yaml
appId: com.smartdoc.app
productName: smartDoc
copyright: Copyright © ${author}

# 仅打包构建产物，源码与 dev 文件排除
files:
  - out/**/*
  - package.json

# better-sqlite3 是 native 模块，不能进 asar
asar: true
asarUnpack:
  - node_modules/better-sqlite3/**/*

directories:
  buildResources: build
  output: release/${version}

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico
  artifactName: ${productName}-${version}-setup.${ext}

nsis:
  oneClick: false                    # 显示安装向导（用户可选目录）
  perMachine: false                  # 默认按用户安装；勾选后可改 perMachine
  allowToChangeInstallationDirectory: true
  allowElevation: true
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: smartDoc
  uninstallDisplayName: smartDoc ${version}

# 自动更新发布通道
publish:
  provider: github
  owner: <owner>                      # 与 package.json.repository.url 保持一致
  repo: smartDoc
  releaseType: release
```

> 替换 `<owner>` 为实际 GitHub owner。本地打包不会检查 publish 配置；只有跑 `npm run publish` 时才上传。

- [ ] **Step 2: 准备 `build/icon.ico`**

可暂用一个占位图标。命令行生成方式（任选其一）：

- 直接放一个 256×256 ico 文件到 `build/icon.ico`
- 若没有，临时复制 electron 默认图标：

```bash
mkdir -p build
cp node_modules/electron/dist/Electron.exe build/.electron-marker  # 仅占位
```

随后在网上找一张 256×256 png 用 ico convert 工具转换；或者使用 [https://icoconvert.com](https://icoconvert.com) 生成后放入 `build/icon.ico`。本计划不在 step 内强制图标质量，只要文件存在即可让 electron-builder 不报错。

- [ ] **Step 3: 测试本地打包（不发布）**

Run: `npm run package:dir`
Expected: 在 `release/0.1.0/win-unpacked/smartDoc.exe` 出现可双击运行的可执行文件；目录下有 `resources/app.asar`、`resources/app.asar.unpacked/node_modules/better-sqlite3/`。

- [ ] **Step 4: 跑解包后的 .exe 做手动冒烟**

操作：双击 `release/0.1.0/win-unpacked/smartDoc.exe`。

预期：
- 应用启动（首次运行可能因为找不到 repoPath 而弹 dialog——这正是 Task 4 要解决的）
- 临时选一个目录后窗口加载、可导入文件
- `%APPDATA%/smartDoc/logs/main.log` 有写入

- [ ] **Step 5: 提交**

```bash
git add electron-builder.yml build/icon.ico
git commit -m "build: electron-builder config for windows nsis"
```

---

## Task 3: 完整安装包构建

**Files:** （无文件改动，验证步骤）

- [ ] **Step 1: 跑完整打包**

Run: `npm run package`
Expected:
- `release/0.1.0/smartDoc-0.1.0-setup.exe` 生成
- 同目录下生成 `latest.yml` 与 `smartDoc-0.1.0-setup.exe.blockmap`
- `release/0.1.0/win-unpacked/` 留作调试

- [ ] **Step 2: 双击 setup.exe，走完安装向导**

预期：
- 安装向导出现，可选择目录
- 安装完成后桌面与开始菜单出现"smartDoc"快捷方式
- 启动应用——同 Task 2 step 4

- [ ] **Step 3: 卸载**

操作：通过 Windows "应用与功能" 卸载 smartDoc。

预期：注册表清理、快捷方式移除；用户数据 `%APPDATA%/smartDoc/` 默认保留（NSIS 默认行为）。

- [ ] **Step 4: 提交（无代码改动则跳过）**

---

## Task 4: 首次启动引导（迁移到 Renderer）

**Files:**
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/components/FirstRunGuide.tsx`
- Modify: `src/renderer/src/components/AppShell.tsx`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/config-ipc.ts`

把 Part 1 中"启动时弹 dialog 选仓库目录"改为渲染层的引导页——既符合设计文档"开发体验/用户体验"导向，又能让 E2E 覆盖此路径。

- [ ] **Step 1: 在 main 端去掉 `ensureRepoPath` 阻塞调用**

修改 `src/main/index.ts`：

```ts
async function bootstrap(): Promise<void> {
  initLogger()
  logger.info('smartDoc starting, version', app.getVersion())

  const dbPath = path.join(app.getPath('userData'), 'smartdoc.db')
  const db = openDatabase(dbPath)

  // repoPath 可能为空——服务在第一次需要 repo 路径前由 IPC 设置
  const repo = new FileRepo(getConfig('repoPath') ?? path.join(app.getPath('userData'), 'pending-repo'))
  svc = new FileService(db, repo)
  // ...其余 IPC 注册保持
}
```

并删除 `ensureRepoPath` 函数；`bootstrap` 不再调用 dialog。

- [ ] **Step 2: 让 main 端在 `config:set` 收到 repoPath 时热替换 FileRepo 根路径**

修改 `src/main/services/file-service.ts`，给 `FileRepo` 暴露一个 `setRoot(newRoot: string)` 方法（如未有），或在 service 内允许更换 `repo`。最简单：把 `FileRepo` 改成可重置：

```ts
// src/main/repo/file-repo.ts —— 改为字段可写
export class FileRepo {
  constructor(private root: string) {}
  setRoot(root: string): void { this.root = root }
  filesDir(): string { return path.join(this.root, 'files') }
  // ... 其余不变（其它方法都通过 this.root 派生路径）
}
```

修改 `src/main/ipc/config-ipc.ts`，让 `setConfig` 写入 repoPath 时同时通知服务（用回调注入避免全局耦合）：

```ts
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
```

修改 `src/main/index.ts` 调用：

```ts
registerConfigIpc({ onRepoPathChanged: (p) => repo.setRoot(p) })
```

- [ ] **Step 3: 写 `src/renderer/src/components/FirstRunGuide.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Button, Result, Space, Typography } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'

interface Props {
  /** 调用方完成选择后回调；交由父组件触发 reload。 */
  onChosen: () => void
}

/**
 * 在 repoPath 为空时显示。点击按钮 → 调用一个新增 IPC `dialog:pickDirectory`
 * → 写入 config.repoPath → 通知父组件刷新。
 */
export function FirstRunGuide({ onChosen }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)

  async function pick(): Promise<void> {
    setBusy(true)
    try {
      const dir = await window.api.dialog.pickDirectory()
      if (!dir) return
      await window.api.config.set('repoPath', dir)
      onChosen()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Result
      icon={<FolderOpenOutlined />}
      title="欢迎使用 smartDoc"
      subTitle="请先选择一个仓库目录用于存放导入的文件。所有文件会复制到该目录的 files/ 子目录中。"
      extra={
        <Space>
          <Button
            type="primary"
            loading={busy}
            onClick={pick}
            data-testid="first-run-pick"
          >
            选择仓库目录
          </Button>
          <Typography.Text type="secondary">建议选择一个空目录</Typography.Text>
        </Space>
      }
    />
  )
}
```

- [ ] **Step 4: 在 IPC channels 与 preload 暴露 `dialog:pickDirectory`**

`src/shared/ipc-channels.ts` 追加：

```ts
DialogPickDirectory: 'dialog:pickDirectory'
```

`src/main/ipc/file-ipc.ts` 内追加：

```ts
ipcMain.handle(IPC.DialogPickDirectory, async (): Promise<string | null> => {
  const r = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
})
```

`src/preload/index.ts`，在 `dialog` 对象内追加：

```ts
pickDirectory: (): Promise<string | null> =>
  ipcRenderer.invoke(IPC.DialogPickDirectory)
```

- [ ] **Step 5: 在 AppShell 顶部判断 `repoPath` 是否就位**

```tsx
import { useEffect, useState } from 'react'
import { FirstRunGuide } from './FirstRunGuide'
// ...

export function AppShell(): JSX.Element {
  const [repoReady, setRepoReady] = useState<boolean | null>(null)

  useEffect(() => {
    void window.api.config.getAll().then((c) => setRepoReady(!!c.repoPath))
  }, [])

  if (repoReady === null) return <></>
  if (!repoReady)
    return <FirstRunGuide onChosen={() => setRepoReady(true)} />

  // ... 原 Layout 内容
}
```

- [ ] **Step 6: typecheck + 手动验证**

Run:
```bash
npm run typecheck
# 删除当前 config 模拟首次启动
rm "$APPDATA/smartdoc/smartdoc-config.json" 2>/dev/null || true
npm run dev
```

预期：渲染端先显示"欢迎使用 smartDoc"引导页 → 点按钮选目录 → 切到主界面。

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "feat: move first-run repo guide from main dialog to renderer"
```

---

## Task 5: UpdaterService（main 端封装）

**Files:**
- Create: `src/main/services/updater-service.ts`

- [ ] **Step 1: 在 `src/shared/types.ts` 末尾追加 `UpdateState`**

```ts
export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string }
  | { phase: 'not-available' }
  | { phase: 'downloading'; percent: number; bytesPerSecond: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string }
```

- [ ] **Step 2: 写 `src/main/services/updater-service.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import { logger } from '@main/logger'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = pkg

export class UpdaterService {
  private state: UpdateState = { phase: 'idle' }
  private listeners = new Set<(s: UpdateState) => void>()

  init(getMainWindow: () => BrowserWindow | null): void {
    autoUpdater.logger = logger
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false // 显式由用户点击触发

    autoUpdater.on('checking-for-update', () => this.set({ phase: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.set({ phase: 'available', version: info.version })
    )
    autoUpdater.on('update-not-available', () =>
      this.set({ phase: 'not-available' })
    )
    autoUpdater.on('download-progress', (p) =>
      this.set({
        phase: 'downloading',
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond
      })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ phase: 'downloaded', version: info.version })
    )
    autoUpdater.on('error', (err) =>
      this.set({ phase: 'error', message: err.message })
    )

    // 启动 5 秒后首次检查；仅在打包模式下生效
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((e) => logger.warn('updater check failed', e))
      }, 5000)
    } else {
      logger.info('updater skipped: not packaged')
    }

    // 防御：getMainWindow 当前未使用，但保留以便未来需要弹原生通知
    void getMainWindow
  }

  getState(): UpdateState {
    return this.state
  }

  subscribe(cb: (s: UpdateState) => void): () => void {
    this.listeners.add(cb)
    cb(this.state)
    return () => this.listeners.delete(cb)
  }

  async checkNow(): Promise<void> {
    if (!app.isPackaged) {
      this.set({ phase: 'not-available' })
      return
    }
    await autoUpdater.checkForUpdates()
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }

  private set(s: UpdateState): void {
    this.state = s
    logger.info('updater state', s.phase)
    for (const l of this.listeners) l(s)
  }
}
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/shared/types.ts src/main/services/updater-service.ts
git commit -m "feat(updater): wrap electron-updater with state machine"
```

---

## Task 6: Updater IPC 与 Main 装配

**Files:**
- Create: `src/main/ipc/updater-ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: 在 `src/shared/ipc-channels.ts` 追加**

```ts
UpdaterGetState: 'updater:getState',
UpdaterSubscribe: 'updater:subscribe',
UpdaterCheck: 'updater:check',
UpdaterQuitAndInstall: 'updater:quitAndInstall'
```

- [ ] **Step 2: 写 `src/main/ipc/updater-ipc.ts`**

```ts
import { ipcMain, BrowserWindow, webContents } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { UpdateState } from '@shared/types'
import type { UpdaterService } from '@main/services/updater-service'

export function registerUpdaterIpc(svc: UpdaterService): void {
  ipcMain.handle(IPC.UpdaterGetState, (): UpdateState => svc.getState())
  ipcMain.handle(IPC.UpdaterCheck, (): Promise<void> => svc.checkNow())
  ipcMain.handle(IPC.UpdaterQuitAndInstall, (): void => svc.quitAndInstall())

  // 一次广播给所有窗口（webContents.send）
  svc.subscribe((state) => {
    for (const wc of webContents.getAllWebContents()) {
      wc.send('updater:state', state)
    }
  })

  // renderer 显式订阅（启动时调用一次以确保收到当前 state）
  ipcMain.handle(IPC.UpdaterSubscribe, (e): UpdateState => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) e.sender.send('updater:state', svc.getState())
    return svc.getState()
  })
}
```

- [ ] **Step 3: 修改 `src/main/index.ts`，初始化 UpdaterService**

```ts
import { UpdaterService } from '@main/services/updater-service'
import { registerUpdaterIpc } from '@main/ipc/updater-ipc'
// ...
const updater = new UpdaterService()
registerUpdaterIpc(updater)
// 在 createWindow 之后：
updater.init(() => mainWindow)
```

- [ ] **Step 4: 修改 `src/preload/index.ts`，暴露 updater api**

```ts
import type { UpdateState } from '@shared/types'
// ...
const api = {
  // ...
  updater: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.UpdaterGetState),
    check: (): Promise<void> => ipcRenderer.invoke(IPC.UpdaterCheck),
    quitAndInstall: (): Promise<void> =>
      ipcRenderer.invoke(IPC.UpdaterQuitAndInstall),
    onState: (cb: (s: UpdateState) => void): (() => void) => {
      const handler = (_e: unknown, s: UpdateState): void => cb(s)
      ipcRenderer.on('updater:state', handler)
      void ipcRenderer.invoke(IPC.UpdaterSubscribe)
      return () => ipcRenderer.removeListener('updater:state', handler)
    }
  }
}
```

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add src
git commit -m "feat(updater): ipc bridge with state subscription"
```

---

## Task 7: UpdateNotifier（renderer 提示）

**Files:**
- Create: `src/renderer/src/components/UpdateNotifier.tsx`
- Modify: `src/renderer/src/components/AppShell.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/UpdateNotifier.tsx`**

```tsx
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
```

- [ ] **Step 2: 在 `AppShell.tsx` 内挂载**

```tsx
import { UpdateNotifier } from './UpdateNotifier'
// 在 <Layout> 树尾追加：
<UpdateNotifier />
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/UpdateNotifier.tsx src/renderer/src/components/AppShell.tsx
git commit -m "feat(renderer): update-ready notification"
```

---

## Task 8: 大文件导入进度（>500MB）

**Files:**
- Modify: `src/main/repo/file-repo.ts`
- Modify: `src/main/services/file-service.ts`
- Modify: `src/main/ipc/file-ipc.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/components/ImportProgress.tsx`
- Modify: `src/renderer/src/components/TopBar.tsx`、`DropZone.tsx`

- [ ] **Step 1: 让 `FileRepo.ingest` 支持进度回调**

修改 `src/main/repo/file-repo.ts`，把 `fs.copyFile` 改成手动 stream copy 并报告字节数（仅当源文件 > 阈值时）：

```ts
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

interface IngestOpts {
  uuid: string
  sourcePath: string
  name: string
  overwrite?: boolean
  onProgress?: (copiedBytes: number, totalBytes: number) => void
  totalBytes?: number
}

async ingest(opts: IngestOpts): Promise<string> {
  const dir = path.join(this.filesDir(), opts.uuid)
  const dest = path.join(dir, opts.name)
  await fs.mkdir(dir, { recursive: true })
  if (opts.overwrite) {
    const entries = await fs.readdir(dir).catch(() => [] as string[])
    await Promise.all(entries.map((e) => fs.rm(path.join(dir, e), { force: true })))
  }
  const tmp = `${dest}.tmp-${process.pid}`

  if (opts.onProgress && opts.totalBytes) {
    const reader = createReadStream(opts.sourcePath)
    let copied = 0
    reader.on('data', (chunk) => {
      copied += chunk.length
      opts.onProgress!(copied, opts.totalBytes!)
    })
    await pipeline(reader, createWriteStream(tmp))
  } else {
    await fs.copyFile(opts.sourcePath, tmp)
  }
  await fs.rename(tmp, dest)
  return this.storagePath(opts.uuid, opts.name)
}
```

- [ ] **Step 2: `FileService.import` 接受 onProgress**

把构造函数改为支持注入 progress emitter，或简化：在 service 里加 `setProgressEmitter(fn)`，让 IPC 层把 webContents 注入：

```ts
private progressEmit: ((p: { sourcePath: string; copied: number; total: number }) => void) | null = null
setProgressEmitter(fn: typeof this.progressEmit): void { this.progressEmit = fn }
```

在 `import` 内部，stat 获得 `total` 后判断是否 >500MB：

```ts
const LARGE = 500 * 1024 * 1024
const useProgress = stat.size > LARGE && this.progressEmit !== null

const storagePath = await this.repo.ingest({
  uuid,
  sourcePath: req.sourcePath,
  name: finalName,
  totalBytes: useProgress ? stat.size : undefined,
  onProgress: useProgress
    ? (copied, total) =>
        this.progressEmit!({ sourcePath: req.sourcePath, copied, total })
    : undefined
})
```

> 同样的逻辑应用在 `overwrite` 分支（如需要进度），可重复 same emitter 包装。

- [ ] **Step 3: IPC 推送进度事件**

`src/shared/ipc-channels.ts` 加：

```ts
FileImportProgress: 'file:importProgress'  // event 名（仅 webContents.send）
```

`src/main/ipc/file-ipc.ts` 在 `registerFileIpc` 内追加：

```ts
import { webContents } from 'electron'
svc.setProgressEmitter((p) => {
  for (const wc of webContents.getAllWebContents()) {
    wc.send(IPC.FileImportProgress, p)
  }
})
```

`src/preload/index.ts` 暴露订阅：

```ts
file: {
  // ...
  onImportProgress: (
    cb: (p: { sourcePath: string; copied: number; total: number }) => void
  ): (() => void) => {
    const handler = (_e: unknown, p: any): void => cb(p)
    ipcRenderer.on(IPC.FileImportProgress, handler)
    return () => ipcRenderer.removeListener(IPC.FileImportProgress, handler)
  }
}
```

- [ ] **Step 4: 写 `src/renderer/src/components/ImportProgress.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Progress, Space, Typography } from 'antd'

interface Item {
  sourcePath: string
  copied: number
  total: number
}

/** 在导入大文件期间渲染右下角浮窗。监听 file:importProgress。 */
export function ImportProgress(): JSX.Element | null {
  const [items, setItems] = useState<Map<string, Item>>(new Map())

  useEffect(() => {
    const off = window.api.file.onImportProgress((p) => {
      setItems((prev) => {
        const next = new Map(prev)
        if (p.copied >= p.total) next.delete(p.sourcePath)
        else next.set(p.sourcePath, p)
        return next
      })
    })
    return off
  }, [])

  if (items.size === 0) return null

  return (
    <div
      data-testid="import-progress"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        background: '#fff',
        border: '1px solid #ddd',
        padding: 12,
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        minWidth: 260
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {[...items.values()].map((it) => (
          <Space.Compact key={it.sourcePath} block direction="vertical">
            <Typography.Text ellipsis style={{ maxWidth: 240 }}>
              {it.sourcePath.split(/[\\/]/).pop()}
            </Typography.Text>
            <Progress
              percent={Math.floor((it.copied / it.total) * 100)}
              size="small"
            />
          </Space.Compact>
        ))}
      </Space>
    </div>
  )
}
```

- [ ] **Step 5: 在 `AppShell.tsx` 内挂载**

```tsx
import { ImportProgress } from './ImportProgress'
// ...
<ImportProgress />
```

- [ ] **Step 6: typecheck + 手动验证**

Run: `npm run typecheck && npm run dev`

操作：导入一个 >500MB 的视频或镜像文件，观察右下角是否出现进度浮窗。

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "feat: progress bar for files larger than 500MB"
```

---

## Task 9: 自动更新本地端到端测试（手动）

由于 GitHub release 不便于在 PR 中创建，本任务用 **electron-updater 的本地静态服务器** 模拟。

- [ ] **Step 1: 临时改 publish 为 generic provider**

新增 `electron-builder.dev-update.yml`（不替换主配置）：

```yaml
provider: generic
url: http://127.0.0.1:18080/
```

> electron-updater 会在打包目录下读 `dev-app-update.yml` 文件来覆盖检查地址（仅 dev 模式生效）。本任务用静态服务器替代。

- [ ] **Step 2: 制作两个版本的安装包**

```bash
# 版本 0.1.0
npm run package
# 把产物挪到一边
mv release/0.1.0 release/old-0.1.0

# 改 package.json 版本为 0.1.1，再打一次
node -e "let f='./package.json',p=require(f);p.version='0.1.1';require('fs').writeFileSync(f,JSON.stringify(p,null,2));"
npm run package
```

预期：`release/0.1.1/` 内有 setup.exe + latest.yml + blockmap。

- [ ] **Step 3: 启动本地静态服务器**

```bash
npx http-server release/0.1.1 -p 18080 --cors
```

把 `release/0.1.0/` 安装到本机；启动应用——5 秒后会请求 `http://127.0.0.1:18080/latest.yml` 检查更新。

> 这里需要先在 0.1.0 build 时塞入 `dev-app-update.yml`：在 electron-builder.yml 的 `extraResources` 加：
> ```yaml
> extraResources:
>   - from: "build/dev-app-update.yml"
>     to: "app-update.yml"
> ```
> 把 generic url 写在 `build/dev-app-update.yml` 中。打包时它会和应用一起部署到 `resources/app-update.yml`。

- [ ] **Step 4: 还原 package.json 版本**

```bash
node -e "let f='./package.json',p=require(f);p.version='0.1.0';require('fs').writeFileSync(f,JSON.stringify(p,null,2));"
```

- [ ] **Step 5: 提交（本任务文档化为 README 章节）**

把上述步骤写入 README "本地测试自动更新" 一节，然后：

```bash
git add README.md
git commit -m "docs: local auto-update smoke-test recipe"
```

---

## Task 10: GitHub Actions 发布流水线

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: 写 `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests
        run: npm run test:run

      - name: Build & publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run publish
```

> `npm run publish` 在我们的 scripts 里映射到 `electron-vite build && electron-builder --win --publish always`。
> 推送 tag `v0.1.1` 即触发；electron-builder 会用 `GH_TOKEN` 创建 / 更新 GitHub Release，并上传 setup.exe + latest.yml。

- [ ] **Step 2: 在 README 加发布步骤说明**

```markdown
## 发布新版本

1. 更新 `package.json` 的 `version` 为新版本号（如 `0.1.1`）
2. `git commit -am "chore: bump 0.1.1"`
3. `git tag v0.1.1`
4. `git push origin master --tags`
5. GitHub Actions 自动构建并创建 Release
6. 已安装的旧版本启动 5 秒后会自动检测新版本，下载完成后弹通知，用户点击重启即更新
```

- [ ] **Step 3: 提交**

```bash
git add .github README.md
git commit -m "ci: github actions release pipeline"
```

---

## Task 11: 收尾与发布演练

- [ ] **Step 1: 全量回归**

Run: `npm run typecheck && npm run test:run && npm run test:e2e && npm run package`
Expected: 全绿，安装包就绪。

- [ ] **Step 2: 安装包上手测试**

操作：
1. 安装 `release/0.1.0/smartDoc-0.1.0-setup.exe`
2. 首次启动 → 引导页 → 选目录
3. 导入 5 个文件（含一个 >500MB） → 列表呈现 + 进度浮窗出现
4. 添加标签、搜索、双击打开
5. 关闭再开 → 配置/数据保留
6. （可选）按 Task 9 做本地更新流程

- [ ] **Step 3: 更新 README，把 "[ ] Part 3" 勾上**

```markdown
- [x] Part 1：脚手架、主进程基础设施、最小占位 UI
- [x] Part 2：完整 UI（antd 布局、标签、搜索、详情抽屉、Playwright E2E）
- [x] Part 3：electron-builder 打包 + electron-updater 自动更新
```

- [ ] **Step 4: 推送分支**

```bash
git add README.md
git commit -m "docs: mark part 3 complete"
git push -u origin feat/part3-release
```

---

## 自查清单

- 设计文档第 6 节"超大文件 >500MB 弹窗确认后显示进度条" → Task 8 落实进度浮窗（"弹窗确认"留作可选 UX，文件已落地，YAGNI）
- 第 8 节"导入时磁盘空间不足 / 仓库文件被外部删除 / SQLite 数据库损坏 / 文件类型未关联程序 / 并发写入冲突" → 依赖 Part 2 Task 23 的 existsOnDisk + Part 1 better-sqlite3 同步保证；磁盘空间不足由 Node.js fs error 自然冒泡到 ImportItemStatus.error
- 第 9 节工具链 electron-builder / electron-updater → Task 1-7 落实
- 第 10.4 节自动更新流程（启动 5s 检查 → 静默下载 → notification 重启） → Task 5 / 7 落实
- 第 10.6 节脚本约定 (`package` / `publish`) → Task 1 落实

**Part 3 不覆盖的范围（明确推迟）：**
- macOS / Linux 打包（`win.target`、签名、公证） → 当前需求 Windows-only
- 增量更新签名（codeSign、SignTool） → 上线前补签发证书后开启
- "SQLite 数据库损坏自动 .recover" 启动恢复 → 设计文档列为兜底场景，非本期硬要求；后续在 main bootstrap 中加 try/catch 退化为重建
- E2E 覆盖自动更新流程 → Playwright 难以模拟 NSIS 重启；文档化为手动场景（Task 9）
