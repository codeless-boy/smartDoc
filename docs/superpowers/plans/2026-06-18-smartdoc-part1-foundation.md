# smartDoc Part 1 — 脚手架与主进程基础设施 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 electron-vite 初始化 smartDoc 项目，搭建主进程基础设施（配置/日志/SQLite/文件仓库/IPC），并交付一个最小可视占位 UI——拖入文件能在仓库落盘并以列表形式显示出来。

**Architecture:** Electron 三进程结构。Main 进程负责所有持久化（SQLite via better-sqlite3、文件仓库、electron-store 配置、electron-log 日志），通过 IPC 暴露给 Renderer。Renderer 阶段一只承担"占位"——一个最小 React 页面调用 `file:import` / `file:list` 验证链路。所有业务纯函数（数据库 CRUD、重复检测、序号生成、搜索排序）独立于 Electron API，便于 Vitest 在 `:memory:` SQLite 上单测。

**Tech Stack:** electron-vite, Electron, TypeScript, React 18, better-sqlite3, electron-store, electron-log, uuid, Vitest, npm。

**版本:** 0.1.0。**仓库根目录:** `e:\code\smartDoc`。

**先决条件:** 仓库已是空 git 仓库（`master` 分支）。Part 1 应在新分支 `feat/part1-foundation` 上进行。

---

## 文件结构

新建/修改的文件清单（按职责拆分，单文件单一责任）：

| 文件 | 责任 |
|------|------|
| `package.json` | 项目元数据、依赖、脚本 |
| `pnpm-workspace.yaml` | 不创建（npm 单包项目，不需要 workspace 配置） |
| `tsconfig.json` | 根 TS 配置（继承到三进程） |
| `tsconfig.node.json` | main/preload 用 |
| `tsconfig.web.json` | renderer 用 |
| `electron.vite.config.ts` | electron-vite 三进程构建配置 |
| `electron-builder.yml` | Part 3 用，Part 1 暂不创建 |
| `vitest.config.ts` | 单元测试配置 |
| `.gitignore` | 忽略 `node_modules` `out` `dist` `*.log` 等 |
| `.editorconfig` `.prettierrc` `.eslintrc.cjs` | 代码风格（最小配置） |
| `src/shared/types.ts` | 跨进程共享类型（FileInfo / TagInfo / ImportResult / DuplicateAction 等） |
| `src/shared/ipc-channels.ts` | IPC 通道常量 |
| `src/main/index.ts` | 主进程入口（创建窗口、注册 IPC、生命周期） |
| `src/main/logger.ts` | electron-log 封装 |
| `src/main/config.ts` | electron-store 封装 |
| `src/main/database.ts` | SQLite 初始化、迁移、prepared statements |
| `src/main/repo/file-repo.ts` | 文件仓库：复制/删除/序号命名 |
| `src/main/repo/duplicate.ts` | 重复检测纯函数（按文件名，大小写不敏感） |
| `src/main/repo/sequence-name.ts` | "保留两份"序号生成纯函数 |
| `src/main/services/file-service.ts` | 协调 db + repo，处理 import/delete/list/update |
| `src/main/ipc/file-ipc.ts` | 注册 file:* IPC 处理器 |
| `src/main/ipc/config-ipc.ts` | 注册 config:* IPC |
| `src/preload/index.ts` | contextBridge 暴露 `window.api` |
| `src/preload/api.d.ts` | renderer 端 `window.api` 类型声明 |
| `src/renderer/index.html` | Vite 入口 HTML |
| `src/renderer/src/main.tsx` | React 入口 |
| `src/renderer/src/App.tsx` | 占位页：导入按钮 + 列表 |
| `tests/unit/database.test.ts` | 建表/CRUD/级联 |
| `tests/unit/duplicate.test.ts` | 重复检测纯函数 |
| `tests/unit/sequence-name.test.ts` | 序号生成纯函数 |
| `tests/unit/file-service.test.ts` | 服务层（用 :memory: db + 临时仓库目录） |

---

## Task 1: 项目初始化与依赖安装

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.editorconfig`

- [ ] **Step 1: 创建分支**

```bash
cd /e/code/smartDoc
git checkout -b feat/part1-foundation
```

- [ ] **Step 2: 写 `package.json`**

```json
{
  "name": "smartdoc",
  "version": "0.1.0",
  "description": "Personal document manager for Windows",
  "main": "./out/main/index.js",
  "author": "smartDoc",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write ."
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "electron-log": "^5.2.0",
    "electron-store": "^10.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.5.0",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@types/uuid": "^10.0.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^32.0.0",
    "electron-vite": "^2.3.0",
    "eslint": "^8.57.0",
    "prettier": "^3.3.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: 写 `.gitignore`**

```
node_modules/
out/
dist/
release/
*.log
.DS_Store
.vscode/settings.json
.idea/
coverage/
.env
.env.local
*.tsbuildinfo
```

- [ ] **Step 4: 写 `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: 安装依赖**

Run: `npm install`
Expected: 全部依赖安装成功，生成 `package-lock.json`，better-sqlite3 触发原生模块编译（首次稍慢）。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json .gitignore .editorconfig
git commit -m "chore: init package.json with electron-vite stack"
```

---

## Task 2: TypeScript 与 electron-vite 构建配置

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron.vite.config.ts`

- [ ] **Step 1: 写根 `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 2: 写 `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node", "electron-vite/node"],
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"]
    }
  },
  "include": [
    "src/main/**/*.ts",
    "src/preload/**/*.ts",
    "src/shared/**/*.ts",
    "tests/unit/**/*.ts",
    "electron.vite.config.ts",
    "vitest.config.ts"
  ]
}
```

- [ ] **Step 3: 写 `tsconfig.web.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@renderer/*": ["src/renderer/src/*"]
    }
  },
  "include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/shared/**/*.ts"]
}
```

- [ ] **Step 4: 写 `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
```

- [ ] **Step 5: 验证 typecheck 跑得通（此时无源码，应空过）**

Run: `npm run typecheck`
Expected: 无错误（两个 project references 都报告"no inputs found"或直接通过——视 TS 版本而定，无 error 即可）。

- [ ] **Step 6: 提交**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json electron.vite.config.ts
git commit -m "chore: add tsconfig and electron-vite config"
```

---

## Task 3: 共享类型与 IPC 通道常量

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/ipc-channels.ts`

- [ ] **Step 1: 写 `src/shared/types.ts`**

```ts
// 单一事实来源：跨 main / preload / renderer 共享的数据契约。

export interface FileInfo {
  id: string                  // UUID
  name: string                // 含扩展名的原始文件名
  ext: string                 // 小写扩展名（不含点），如 "pdf"
  size: number                // 字节数
  storagePath: string         // 仓库内相对路径，如 "files/<uuid>/<name>"
  note: string
  importedAt: string          // ISO8601
  updatedAt: string
}

export interface TagInfo {
  id: string
  name: string
  color: string
  createdAt: string
}

export type DuplicateAction = 'skip' | 'overwrite' | 'keep-both'

export interface ImportRequest {
  sourcePath: string          // 源文件绝对路径
  /**
   * 若为 undefined：检测到重名时返回 status='duplicate'，由 UI 询问后再次调用。
   * 若已设置：按该策略处理。
   */
  duplicateAction?: DuplicateAction
}

export type ImportItemStatus =
  | { status: 'imported'; file: FileInfo }
  | { status: 'duplicate'; sourcePath: string; existing: FileInfo }
  | { status: 'skipped'; sourcePath: string }
  | { status: 'overwritten'; file: FileInfo }
  | { status: 'error'; sourcePath: string; message: string }

export interface ListQuery {
  /** 关键词（搜索 Part 2 启用），Part 1 仅支持 undefined */
  keyword?: string
  /** 分页（Part 2 启用） */
  limit?: number
  offset?: number
}

export interface AppConfig {
  repoPath: string | null
  windowBounds?: { x?: number; y?: number; width: number; height: number }
}
```

- [ ] **Step 2: 写 `src/shared/ipc-channels.ts`**

```ts
// 集中管理 IPC 通道名，避免主/渲染端硬编码字符串发散。
export const IPC = {
  ConfigGet: 'config:get',
  ConfigSet: 'config:set',
  FileImport: 'file:import',
  FileList: 'file:list',
  FileDelete: 'file:delete',
  FileOpen: 'file:open',
  FileShowInDir: 'file:showInDir'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/shared
git commit -m "feat(shared): add cross-process types and ipc channel constants"
```

---

## Task 4: 日志封装（electron-log）

**Files:**
- Create: `src/main/logger.ts`

- [ ] **Step 1: 写 `src/main/logger.ts`**

```ts
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
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/main/logger.ts
git commit -m "feat(main): wire electron-log with file rotation"
```

---

## Task 5: 配置管理（electron-store）

**Files:**
- Create: `src/main/config.ts`

- [ ] **Step 1: 写 `src/main/config.ts`**

```ts
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
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/main/config.ts
git commit -m "feat(main): wrap electron-store as typed config api"
```

---

## Task 6: SQLite 数据库（建表 + 迁移）

**Files:**
- Create: `src/main/database.ts`
- Test: `tests/unit/database.test.ts`

我们走 TDD：先测后实现。数据库模块设计为可注入路径——生产用 `userData/smartdoc.db`，测试用 `:memory:`。

- [ ] **Step 1: 配置 Vitest（`vitest.config.ts`）**

写文件 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main')
    }
  }
})
```

- [ ] **Step 2: 写失败测试 `tests/unit/database.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase } from '@main/database'
import type Database from 'better-sqlite3'

describe('database', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('creates files / tags / file_tags / file_opens tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain('files')
    expect(names).toContain('tags')
    expect(names).toContain('file_tags')
    expect(names).toContain('file_opens')
  })

  it('cascades file_tags when file deleted', () => {
    db.prepare(
      `INSERT INTO files (id,name,ext,size,storage_path,note,imported_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run('f1', 'a.pdf', 'pdf', 1, 'files/f1/a.pdf', '', 't', 't')
    db.prepare(`INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)`).run(
      't1',
      'work',
      '#abc',
      't'
    )
    db.prepare(`INSERT INTO file_tags (file_id,tag_id) VALUES (?,?)`).run('f1', 't1')

    db.prepare(`DELETE FROM files WHERE id=?`).run('f1')
    const rows = db.prepare(`SELECT * FROM file_tags`).all()
    expect(rows).toHaveLength(0)
  })

  it('enforces unique tag name', () => {
    db.prepare(`INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)`).run(
      't1',
      'work',
      '#abc',
      't'
    )
    expect(() =>
      db
        .prepare(`INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)`)
        .run('t2', 'work', '#abc', 't')
    ).toThrow(/UNIQUE/i)
  })
})
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npm run test:run -- tests/unit/database.test.ts`
Expected: FAIL，因为 `@main/database` 还不存在。

- [ ] **Step 4: 实现 `src/main/database.ts`**

```ts
import BetterSqlite3 from 'better-sqlite3'
import type { Database } from 'better-sqlite3'

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  ext          TEXT NOT NULL,
  size         INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  imported_at  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_name        ON files(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_files_imported_at ON files(imported_at);

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_tags (
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (file_id, tag_id)
);

CREATE TABLE IF NOT EXISTS file_opens (
  id        TEXT PRIMARY KEY,
  file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_opens_file ON file_opens(file_id);
CREATE INDEX IF NOT EXISTS idx_file_opens_time ON file_opens(opened_at);
`

/**
 * 打开数据库连接并保证 schema 就位。
 * @param dbPath 文件路径或 ':memory:'
 */
export function openDatabase(dbPath: string): Database {
  const db = new BetterSqlite3(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npm run test:run -- tests/unit/database.test.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 6: 提交**

```bash
git add vitest.config.ts src/main/database.ts tests/unit/database.test.ts
git commit -m "feat(main): sqlite schema with cascade and unique tag constraint"
```

---

## Task 7: 重复检测纯函数（按文件名，大小写不敏感）

**Files:**
- Create: `src/main/repo/duplicate.ts`
- Test: `tests/unit/duplicate.test.ts`

- [ ] **Step 1: 写失败测试 `tests/unit/duplicate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { findDuplicateByName } from '@main/repo/duplicate'
import type { FileInfo } from '@shared/types'

const make = (name: string): FileInfo => ({
  id: name,
  name,
  ext: name.split('.').pop()!.toLowerCase(),
  size: 1,
  storagePath: `files/${name}/${name}`,
  note: '',
  importedAt: 't',
  updatedAt: 't'
})

describe('findDuplicateByName', () => {
  const existing = [make('Report.pdf'), make('photo.jpg')]

  it('matches case-insensitively', () => {
    expect(findDuplicateByName('report.pdf', existing)?.id).toBe('Report.pdf')
    expect(findDuplicateByName('REPORT.PDF', existing)?.id).toBe('Report.pdf')
  })

  it('returns null when not found', () => {
    expect(findDuplicateByName('other.pdf', existing)).toBeNull()
  })

  it('matches exact characters except case (no fuzzy)', () => {
    expect(findDuplicateByName('Report (1).pdf', existing)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:run -- tests/unit/duplicate.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/main/repo/duplicate.ts`**

```ts
import type { FileInfo } from '@shared/types'

/**
 * 在已存在文件列表中按文件名（含扩展名）大小写不敏感查找重复项。
 * 命中返回首条记录；未命中返回 null。
 */
export function findDuplicateByName(
  name: string,
  existing: readonly FileInfo[]
): FileInfo | null {
  const lower = name.toLowerCase()
  for (const f of existing) {
    if (f.name.toLowerCase() === lower) return f
  }
  return null
}
```

- [ ] **Step 4: 运行测试**

Run: `npm run test:run -- tests/unit/duplicate.test.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/repo/duplicate.ts tests/unit/duplicate.test.ts
git commit -m "feat(repo): case-insensitive duplicate detection by filename"
```

---

## Task 8: "保留两份" 序号生成纯函数

**Files:**
- Create: `src/main/repo/sequence-name.ts`
- Test: `tests/unit/sequence-name.test.ts`

- [ ] **Step 1: 写失败测试 `tests/unit/sequence-name.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { nextSequenceName } from '@main/repo/sequence-name'

describe('nextSequenceName', () => {
  it('appends (2) on first collision', () => {
    expect(nextSequenceName('a.pdf', new Set(['a.pdf']))).toBe('a (2).pdf')
  })

  it('skips taken (n) and lands on next free', () => {
    expect(
      nextSequenceName('a.pdf', new Set(['a.pdf', 'a (2).pdf', 'a (3).pdf']))
    ).toBe('a (4).pdf')
  })

  it('handles file with no extension', () => {
    expect(nextSequenceName('README', new Set(['README']))).toBe('README (2)')
  })

  it('handles multi-dot filenames (extension = last segment)', () => {
    expect(nextSequenceName('a.tar.gz', new Set(['a.tar.gz']))).toBe('a.tar (2).gz')
  })

  it('is case-insensitive when checking taken set', () => {
    expect(nextSequenceName('A.pdf', new Set(['a.pdf']))).toBe('A (2).pdf')
  })

  it('returns input unchanged if not taken', () => {
    expect(nextSequenceName('a.pdf', new Set())).toBe('a.pdf')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:run -- tests/unit/sequence-name.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/main/repo/sequence-name.ts`**

```ts
/**
 * 生成不与 taken 集合重复的文件名。
 * 在最后一个点之前插入 " (n)"，n 从 2 起递增；无扩展名则追加在末尾。
 * 比对时大小写不敏感。
 */
export function nextSequenceName(name: string, taken: ReadonlySet<string>): string {
  const lowerTaken = new Set([...taken].map((s) => s.toLowerCase()))
  if (!lowerTaken.has(name.toLowerCase())) return name

  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext = lastDot > 0 ? name.slice(lastDot) : ''

  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base} (${n})${ext}`
    if (!lowerTaken.has(candidate.toLowerCase())) return candidate
  }
  throw new Error(`nextSequenceName: gave up after 10000 tries for "${name}"`)
}
```

- [ ] **Step 4: 运行测试**

Run: `npm run test:run -- tests/unit/sequence-name.test.ts`
Expected: 6 个用例全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/repo/sequence-name.ts tests/unit/sequence-name.test.ts
git commit -m "feat(repo): sequence-based filename uniquifier"
```

---

## Task 9: 文件仓库（磁盘操作）

**Files:**
- Create: `src/main/repo/file-repo.ts`

文件仓库只关心磁盘操作，不接触数据库。设计上接受一个仓库根路径。

- [ ] **Step 1: 写 `src/main/repo/file-repo.ts`**

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 仓库目录布局：
 *   <root>/
 *     files/
 *       <uuid>/
 *         <原始文件名>
 *
 * 设计要点：
 *  - 每个文件独占 UUID 子目录，回避同名冲突。
 *  - 复制使用先写临时文件再 rename 的两步法，保证原子性。
 */
export class FileRepo {
  constructor(private readonly root: string) {}

  /** 仓库内 files/ 子目录绝对路径 */
  filesDir(): string {
    return path.join(this.root, 'files')
  }

  /** 给定 uuid 与磁盘文件名，返回相对仓库根的路径，例如 "files/<uuid>/<name>" */
  storagePath(uuid: string, name: string): string {
    return path.posix.join('files', uuid, name)
  }

  /** 绝对路径版本 */
  absolutePath(uuid: string, name: string): string {
    return path.join(this.filesDir(), uuid, name)
  }

  /**
   * 把 source 复制到 files/<uuid>/<name>。返回相对仓库根的 storage_path。
   * 若目标目录已存在，按 overwrite=true 时清空后再写。
   */
  async ingest(opts: {
    uuid: string
    sourcePath: string
    name: string
    overwrite?: boolean
  }): Promise<string> {
    const dir = path.join(this.filesDir(), opts.uuid)
    const dest = path.join(dir, opts.name)

    await fs.mkdir(dir, { recursive: true })
    if (opts.overwrite) {
      // 删除目录下所有旧文件，确保 dest 唯一
      const entries = await fs.readdir(dir).catch(() => [] as string[])
      await Promise.all(entries.map((e) => fs.rm(path.join(dir, e), { force: true })))
    }

    const tmp = `${dest}.tmp-${process.pid}`
    await fs.copyFile(opts.sourcePath, tmp)
    await fs.rename(tmp, dest)
    return this.storagePath(opts.uuid, opts.name)
  }

  /** 删除 files/<uuid>/ 整个目录（删除记录时调用） */
  async remove(uuid: string): Promise<void> {
    await fs.rm(path.join(this.filesDir(), uuid), { recursive: true, force: true })
  }

  /** 检查 files/<uuid>/<name> 是否存在 */
  async exists(uuid: string, name: string): Promise<boolean> {
    try {
      await fs.access(this.absolutePath(uuid, name))
      return true
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/main/repo/file-repo.ts
git commit -m "feat(repo): file repository with atomic copy via tmp+rename"
```

---

## Task 10: 文件服务层（协调 db + repo）

**Files:**
- Create: `src/main/services/file-service.ts`
- Test: `tests/unit/file-service.test.ts`

服务层是 IPC 与底层模块之间的薄一层，把"导入 / 列表 / 删除"翻译为 db 与 repo 的具体调用。

- [ ] **Step 1: 写失败测试 `tests/unit/file-service.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { openDatabase } from '@main/database'
import { FileRepo } from '@main/repo/file-repo'
import { FileService } from '@main/services/file-service'
import type { Database } from 'better-sqlite3'

describe('FileService', () => {
  let db: Database
  let repoRoot: string
  let srcDir: string
  let svc: FileService

  beforeEach(async () => {
    db = openDatabase(':memory:')
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'smartdoc-repo-'))
    srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartdoc-src-'))
    svc = new FileService(db, new FileRepo(repoRoot))
  })

  afterEach(async () => {
    db.close()
    await fs.rm(repoRoot, { recursive: true, force: true })
    await fs.rm(srcDir, { recursive: true, force: true })
  })

  async function writeSource(name: string, content = 'hello'): Promise<string> {
    const p = path.join(srcDir, name)
    await fs.writeFile(p, content)
    return p
  }

  it('imports a new file: writes db row and copies bytes', async () => {
    const src = await writeSource('a.pdf', 'pdf-bytes')
    const result = await svc.import({ sourcePath: src })

    expect(result.status).toBe('imported')
    if (result.status !== 'imported') return
    expect(result.file.name).toBe('a.pdf')
    expect(result.file.ext).toBe('pdf')
    expect(result.file.size).toBe('pdf-bytes'.length)
    const onDisk = await fs.readFile(path.join(repoRoot, result.file.storagePath), 'utf8')
    expect(onDisk).toBe('pdf-bytes')
  })

  it('detects duplicate by name (case-insensitive) without action', async () => {
    await svc.import({ sourcePath: await writeSource('Doc.pdf') })
    const result = await svc.import({ sourcePath: await writeSource('doc.pdf') })
    expect(result.status).toBe('duplicate')
    if (result.status !== 'duplicate') return
    expect(result.existing.name).toBe('Doc.pdf')
  })

  it('skip leaves db and disk unchanged', async () => {
    const src = await writeSource('a.pdf')
    await svc.import({ sourcePath: src })
    const before = svc.list({})
    const result = await svc.import({ sourcePath: src, duplicateAction: 'skip' })
    expect(result.status).toBe('skipped')
    expect(svc.list({})).toEqual(before)
  })

  it('overwrite reuses uuid, updates size, preserves note', async () => {
    const src1 = await writeSource('a.pdf', 'v1')
    const r1 = await svc.import({ sourcePath: src1 })
    if (r1.status !== 'imported') throw new Error('setup failed')
    db.prepare('UPDATE files SET note=? WHERE id=?').run('keep me', r1.file.id)

    const src2 = await writeSource('a.pdf', 'v2-longer')
    // overwrite 时源是同一文件名，但内容不同；先把 src2 改名以避免与 src1 同路径冲突
    const src2b = path.join(srcDir, 'a-v2.pdf')
    await fs.rename(src2, src2b)
    // 重命名仅为产生新的 source 文件；service 仍按 basename 'a-v2.pdf' 检查重复，
    // 故测试中显式用旧 name 触发重复：复制成同名后再调用
    const sameName = path.join(srcDir, 'a.pdf')
    await fs.writeFile(sameName, 'v2-longer')
    const r2 = await svc.import({ sourcePath: sameName, duplicateAction: 'overwrite' })

    expect(r2.status).toBe('overwritten')
    if (r2.status !== 'overwritten') return
    expect(r2.file.id).toBe(r1.file.id)
    expect(r2.file.size).toBe('v2-longer'.length)
    const note = db.prepare('SELECT note FROM files WHERE id=?').get(r1.file.id) as {
      note: string
    }
    expect(note.note).toBe('keep me')
  })

  it('keep-both creates new uuid with sequence-named file', async () => {
    await svc.import({ sourcePath: await writeSource('a.pdf', 'v1') })
    const r2 = await svc.import({
      sourcePath: await writeSource('a.pdf', 'v2'),
      duplicateAction: 'keep-both'
    })
    expect(r2.status).toBe('imported')
    if (r2.status !== 'imported') return
    expect(r2.file.name).toBe('a (2).pdf')
    const onDisk = await fs.readFile(path.join(repoRoot, r2.file.storagePath), 'utf8')
    expect(onDisk).toBe('v2')
  })

  it('list returns rows ordered by imported_at desc', async () => {
    const a = await svc.import({ sourcePath: await writeSource('a.pdf') })
    // 通过手动改时间戳模拟先后顺序
    if (a.status === 'imported') {
      db.prepare('UPDATE files SET imported_at=? WHERE id=?').run(
        '2020-01-01T00:00:00.000Z',
        a.file.id
      )
    }
    await svc.import({ sourcePath: await writeSource('b.pdf') })
    const rows = svc.list({})
    expect(rows.map((r) => r.name)).toEqual(['b.pdf', 'a.pdf'])
  })

  it('delete removes db row and disk dir', async () => {
    const r = await svc.import({ sourcePath: await writeSource('a.pdf') })
    if (r.status !== 'imported') throw new Error('setup failed')
    await svc.delete([r.file.id])
    expect(svc.list({})).toHaveLength(0)
    expect(await fs.readdir(path.join(repoRoot, 'files'))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:run -- tests/unit/file-service.test.ts`
Expected: FAIL（FileService 不存在）。

- [ ] **Step 3: 实现 `src/main/services/file-service.ts`**

```ts
import path from 'node:path'
import fs from 'node:fs/promises'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type {
  FileInfo,
  ImportRequest,
  ImportItemStatus,
  ListQuery
} from '@shared/types'
import { FileRepo } from '@main/repo/file-repo'
import { findDuplicateByName } from '@main/repo/duplicate'
import { nextSequenceName } from '@main/repo/sequence-name'

interface FileRow {
  id: string
  name: string
  ext: string
  size: number
  storage_path: string
  note: string
  imported_at: string
  updated_at: string
}

const rowToFile = (r: FileRow): FileInfo => ({
  id: r.id,
  name: r.name,
  ext: r.ext,
  size: r.size,
  storagePath: r.storage_path,
  note: r.note,
  importedAt: r.imported_at,
  updatedAt: r.updated_at
})

export class FileService {
  constructor(
    private readonly db: Database,
    private readonly repo: FileRepo
  ) {}

  list(_query: ListQuery): FileInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM files ORDER BY imported_at DESC')
      .all() as FileRow[]
    return rows.map(rowToFile)
  }

  /**
   * 导入一个文件。语义见 shared/types.ts 的 ImportItemStatus。
   *  - 未指定 duplicateAction 且重名 → 'duplicate'
   *  - 'skip' → 不动 db / 磁盘
   *  - 'overwrite' → 复用原 uuid，磁盘内容替换，标签/备注保留
   *  - 'keep-both' → 文件名加 (n) 序号，新 uuid
   */
  async import(req: ImportRequest): Promise<ImportItemStatus> {
    const sourceName = path.basename(req.sourcePath)
    const existingAll = this.list({})
    const existing = findDuplicateByName(sourceName, existingAll)

    if (existing && !req.duplicateAction) {
      return { status: 'duplicate', sourcePath: req.sourcePath, existing }
    }

    try {
      const stat = await fs.stat(req.sourcePath)
      const now = new Date().toISOString()

      if (existing && req.duplicateAction === 'skip') {
        return { status: 'skipped', sourcePath: req.sourcePath }
      }

      if (existing && req.duplicateAction === 'overwrite') {
        const storagePath = await this.repo.ingest({
          uuid: existing.id,
          sourcePath: req.sourcePath,
          name: existing.name, // 保持磁盘名与 db.name 一致
          overwrite: true
        })
        this.db
          .prepare(
            'UPDATE files SET size=?, storage_path=?, updated_at=? WHERE id=?'
          )
          .run(stat.size, storagePath, now, existing.id)
        const row = this.db
          .prepare('SELECT * FROM files WHERE id=?')
          .get(existing.id) as FileRow
        return { status: 'overwritten', file: rowToFile(row) }
      }

      // 新增：keep-both 或 无重复
      let finalName = sourceName
      if (existing && req.duplicateAction === 'keep-both') {
        const taken = new Set(existingAll.map((f) => f.name))
        finalName = nextSequenceName(sourceName, taken)
      }

      const uuid = uuidv4()
      const storagePath = await this.repo.ingest({
        uuid,
        sourcePath: req.sourcePath,
        name: finalName
      })
      const ext = (path.extname(finalName).slice(1) || '').toLowerCase()
      this.db
        .prepare(
          `INSERT INTO files (id,name,ext,size,storage_path,note,imported_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(uuid, finalName, ext, stat.size, storagePath, '', now, now)
      const row = this.db
        .prepare('SELECT * FROM files WHERE id=?')
        .get(uuid) as FileRow
      return { status: 'imported', file: rowToFile(row) }
    } catch (err) {
      return {
        status: 'error',
        sourcePath: req.sourcePath,
        message: (err as Error).message
      }
    }
  }

  async delete(ids: string[]): Promise<void> {
    const tx = this.db.transaction((idList: string[]) => {
      const stmt = this.db.prepare('DELETE FROM files WHERE id=?')
      for (const id of idList) stmt.run(id)
    })
    tx(ids)
    await Promise.all(ids.map((id) => this.repo.remove(id)))
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `npm run test:run -- tests/unit/file-service.test.ts`
Expected: 全部用例 PASS。若任何用例失败，逐条阅读断言修正实现，不要修改测试。

- [ ] **Step 5: 全量测试**

Run: `npm run test:run`
Expected: database / duplicate / sequence-name / file-service 共 4 个测试文件全绿。

- [ ] **Step 6: 提交**

```bash
git add src/main/services/file-service.ts tests/unit/file-service.test.ts
git commit -m "feat(main): file service coordinating db and repo"
```

---

## Task 11: IPC 处理器（file:* 与 config:*）

**Files:**
- Create: `src/main/ipc/file-ipc.ts`
- Create: `src/main/ipc/config-ipc.ts`

- [ ] **Step 1: 写 `src/main/ipc/file-ipc.ts`**

```ts
import { ipcMain, shell, BrowserWindow } from 'electron'
import path from 'node:path'
import { IPC } from '@shared/ipc-channels'
import type {
  FileInfo,
  ImportRequest,
  ImportItemStatus,
  ListQuery
} from '@shared/types'
import { logger } from '@main/logger'
import type { FileService } from '@main/services/file-service'

export function registerFileIpc(svc: FileService, repoRoot: () => string | null): void {
  ipcMain.handle(
    IPC.FileImport,
    async (_e, req: ImportRequest): Promise<ImportItemStatus> => {
      logger.debug('ipc file:import', req.sourcePath, req.duplicateAction)
      return svc.import(req)
    }
  )

  ipcMain.handle(IPC.FileList, async (_e, query: ListQuery): Promise<FileInfo[]> => {
    return svc.list(query)
  })

  ipcMain.handle(IPC.FileDelete, async (_e, ids: string[]): Promise<void> => {
    logger.info('ipc file:delete', ids)
    await svc.delete(ids)
  })

  ipcMain.handle(IPC.FileOpen, async (_e, id: string): Promise<void> => {
    const file = svc.list({}).find((f) => f.id === id)
    const root = repoRoot()
    if (!file || !root) return
    const abs = path.join(root, file.storagePath)
    const err = await shell.openPath(abs)
    if (err) logger.warn('shell.openPath failed', abs, err)
  })

  ipcMain.handle(IPC.FileShowInDir, async (_e, id: string): Promise<void> => {
    const file = svc.list({}).find((f) => f.id === id)
    const root = repoRoot()
    if (!file || !root) return
    shell.showItemInFolder(path.join(root, file.storagePath))
  })

  // 让窗口在 ready 时把当前列表广播给 renderer（可选；Part 1 渲染端用主动 fetch）
  void BrowserWindow
}
```

- [ ] **Step 2: 写 `src/main/ipc/config-ipc.ts`**

```ts
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
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/main/ipc
git commit -m "feat(main): ipc handlers for file and config channels"
```

---

## Task 12: Preload 桥（contextBridge）

**Files:**
- Create: `src/preload/index.ts`
- Create: `src/preload/api.d.ts`

- [ ] **Step 1: 写 `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  AppConfig,
  FileInfo,
  ImportRequest,
  ImportItemStatus,
  ListQuery
} from '@shared/types'

const api = {
  config: {
    getAll: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.ConfigGet),
    set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> =>
      ipcRenderer.invoke(IPC.ConfigSet, key, value)
  },
  file: {
    import: (req: ImportRequest): Promise<ImportItemStatus> =>
      ipcRenderer.invoke(IPC.FileImport, req),
    list: (query: ListQuery = {}): Promise<FileInfo[]> =>
      ipcRenderer.invoke(IPC.FileList, query),
    delete: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.FileDelete, ids),
    open: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FileOpen, id),
    showInDir: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.FileShowInDir, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
```

- [ ] **Step 2: 写 `src/preload/api.d.ts`**

```ts
import type { Api } from './index'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/preload
git commit -m "feat(preload): expose typed window.api via contextBridge"
```

---

## Task 13: Main 进程入口（窗口 + 装配）

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: 写 `src/main/index.ts`**

```ts
import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initLogger, logger } from '@main/logger'
import { getConfig, setConfig } from '@main/config'
import { openDatabase } from '@main/database'
import { FileRepo } from '@main/repo/file-repo'
import { FileService } from '@main/services/file-service'
import { registerFileIpc } from '@main/ipc/file-ipc'
import { registerConfigIpc } from '@main/ipc/config-ipc'

let mainWindow: BrowserWindow | null = null
let svc: FileService | null = null
let repoRootRef: string | null = null

/**
 * 首次启动若未配置 repoPath，引导用户选择目录。
 * Part 1 阶段直接弹窗；Part 2 起改为渲染端的引导页。
 */
async function ensureRepoPath(): Promise<string> {
  const existing = getConfig('repoPath')
  if (existing && fs.existsSync(existing)) return existing

  const result = await dialog.showOpenDialog({
    title: '选择 smartDoc 仓库目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    app.quit()
    throw new Error('user-cancelled-repo-path')
  }
  const chosen = result.filePaths[0]
  setConfig('repoPath', chosen)
  return chosen
}

async function bootstrap(): Promise<void> {
  initLogger()
  logger.info('smartDoc starting, version', app.getVersion())

  const repoRoot = await ensureRepoPath()
  repoRootRef = repoRoot
  fs.mkdirSync(path.join(repoRoot, 'files'), { recursive: true })

  const dbPath = path.join(app.getPath('userData'), 'smartdoc.db')
  const db = openDatabase(dbPath)
  const repo = new FileRepo(repoRoot)
  svc = new FileService(db, repo)

  registerConfigIpc()
  registerFileIpc(svc, () => repoRootRef)
}

function createWindow(): void {
  const bounds = getConfig('windowBounds') ?? { width: 1280, height: 800 }
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', () => {
    if (!mainWindow) return
    const b = mainWindow.getBounds()
    setConfig('windowBounds', { x: b.x, y: b.y, width: b.width, height: b.height })
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    await bootstrap()
    createWindow()
  } catch (err) {
    logger.error('bootstrap failed', err)
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/main/index.ts
git commit -m "feat(main): wire bootstrap, window lifecycle, and ipc registration"
```

---

## Task 14: Renderer 占位 UI（最小可视）

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`

仅一个页面：标题 + "导入文件"按钮（用 Electron `dialog` 选择本地文件） + 列表。Part 2 会用 antd 全面替换。Part 1 的 UI 不依赖 antd，避免提前引入。

- [ ] **Step 1: 写 `src/renderer/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>smartDoc</title>
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 给 main 进程加一个"打开文件选择器"的 IPC（占位 UI 需要它）**

修改 `src/shared/ipc-channels.ts`，在 IPC 对象里追加：

```ts
  DialogPickFiles: 'dialog:pickFiles'
```

修改 `src/main/ipc/file-ipc.ts`，在 `registerFileIpc` 内（`registerConfigIpc` 之外即可，但放一起更内聚）追加：

```ts
import { dialog } from 'electron'
// ...
ipcMain.handle(IPC.DialogPickFiles, async (): Promise<string[]> => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections']
  })
  return r.canceled ? [] : r.filePaths
})
```

并在 `src/preload/index.ts` 的 `api` 对象里追加：

```ts
  dialog: {
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.DialogPickFiles)
  }
```

- [ ] **Step 3: 写 `src/renderer/src/main.tsx`**

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 4: 写 `src/renderer/src/App.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { FileInfo, ImportItemStatus } from '@shared/types'

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'system-ui, sans-serif', padding: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  btn: { padding: '6px 12px', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '6px 8px', borderBottom: '1px solid #eee' }
}

export function App(): JSX.Element {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [message, setMessage] = useState<string>('')

  const refresh = useCallback(async () => {
    setFiles(await window.api.file.list({}))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const importFiles = useCallback(async () => {
    const paths = await window.api.dialog.pickFiles()
    if (paths.length === 0) return
    let imported = 0
    let duplicates = 0
    for (const p of paths) {
      const r: ImportItemStatus = await window.api.file.import({ sourcePath: p })
      if (r.status === 'imported') imported++
      else if (r.status === 'duplicate') {
        // Part 1：遇重名一律保留两份，Part 2 改为弹对话框
        const r2 = await window.api.file.import({
          sourcePath: p,
          duplicateAction: 'keep-both'
        })
        if (r2.status === 'imported') imported++
        duplicates++
      }
    }
    setMessage(`已导入 ${imported} 个文件${duplicates ? `（重名 ${duplicates}）` : ''}`)
    await refresh()
  }, [refresh])

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>smartDoc · Part 1 占位</h2>
        <button style={styles.btn} onClick={importFiles}>
          导入文件
        </button>
        <span>{message}</span>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <td style={styles.td}>文件名</td>
            <td style={styles.td}>大小</td>
            <td style={styles.td}>导入时间</td>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td style={styles.td}>{f.name}</td>
              <td style={styles.td}>{f.size}</td>
              <td style={styles.td}>{f.importedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add src/renderer src/shared/ipc-channels.ts src/main/ipc/file-ipc.ts src/preload/index.ts
git commit -m "feat(renderer): minimal placeholder UI to verify ipc end-to-end"
```

---

## Task 15: 端到端冒烟（手动）

不写自动 E2E（Playwright 在 Part 2）。手动跑一次，确认链路通畅。

- [ ] **Step 1: 启动开发模式**

Run: `npm run dev`
Expected: 弹窗要求选择仓库目录 → 选一个空目录（例如 `e:/code/smartDoc-repo-dev`）→ 主窗口加载占位 UI。

- [ ] **Step 2: 导入文件**

操作：点击 "导入文件" → 选 2~3 个本机文件 → 列表立即出现这些行。

预期：
- 列表显示原始文件名、字节数、ISO 时间
- 仓库目录下出现 `files/<uuid>/<原始文件名>` 结构
- `%APPDATA%/smartDoc/logs/main.log` 有 `ipc file:import` 行

- [ ] **Step 3: 重名验证**

操作：再次导入同一个文件。

预期：列表里出现 `<原文件名> (2).<ext>`；磁盘对应新 UUID 子目录。

- [ ] **Step 4: 关闭并重新启动**

Run: 关闭窗口 → `npm run dev`
Expected: 不再弹仓库选择对话框；列表恢复上次的全部记录；窗口尺寸/位置保持上次关闭时的状态。

- [ ] **Step 5: 提交（如有微调）**

```bash
git status
# 若 step 1-4 中改了文件
git add -A
git commit -m "chore: smoke-test fixups"
```

如无改动，跳过 commit。

---

## Task 16: README 与开发说明

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 `README.md`**

```markdown
# smartDoc

Personal document manager for Windows. Version **0.1.0**.

## 开发

依赖 Node.js ≥ 20、npm ≥ 10、Windows 10/11。

```bash
npm install
npm run dev          # 启动 Electron 开发模式
npm test         # Vitest watch
npm run test:run     # 单跑全部单测
npm run typecheck    # 三套 tsconfig 类型检查
npm run build        # 打 main/preload/renderer 产物到 out/
```

首次启动会弹窗要求选择仓库目录，所有导入的文件将复制到 `<仓库>/files/<uuid>/<原始文件名>`。
配置文件位于 `%APPDATA%/smartdoc/smartdoc-config.json`，日志位于 `%APPDATA%/smartdoc/logs/main.log`。

## 当前进度

- [x] Part 1：脚手架、主进程基础设施、最小占位 UI
- [ ] Part 2：完整 UI（antd 布局、标签、搜索、详情抽屉、Playwright E2E）
- [ ] Part 3：electron-builder 打包 + electron-updater 自动更新
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: add README for part 1"
```

---

## Task 17: Part 1 收尾

- [ ] **Step 1: 全量回归**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: 三步全部成功，`out/main`、`out/preload`、`out/renderer` 三个产物目录就位。

- [ ] **Step 2: 推送分支**

```bash
git push -u origin feat/part1-foundation
```

- [ ] **Step 3: 在交付说明中列出验收项**（手动写 PR 描述时按此核对）

- electron-vite 三进程正常构建
- Vitest 4 个测试文件全部通过：database / duplicate / sequence-name / file-service
- 占位 UI 可手动验证：导入、列表、重名保留两份、配置持久化、日志落盘
- 仓库结构为 `files/<uuid>/<原始文件名>`
- 重复检测按文件名（大小写不敏感）

---

## 自查清单

- 设计文档第 2 节（架构、仓库结构 `files/<uuid>/<原始文件名>`） → Task 9 / Task 10 落实
- 第 3 节（数据库 schema、外键级联、tag UNIQUE） → Task 6 落实
- 第 5 节 IPC（file:import / list / delete / open / showInDir，config:get/set） → Task 11 / 12 落实
- 第 6 节（重复检测按文件名、跳过/覆盖/保留两份语义） → Task 7 / 8 / 10 落实，Task 14 临时用 keep-both 直通
- 第 9 节工具链（electron-vite / electron-store / electron-log / better-sqlite3 / Vitest） → Task 1-6 落实
- 第 10.5 节 Vitest 单测列表（database / file-repo / search / tag） → Part 1 覆盖 database / duplicate / sequence-name / file-service；search 与 tag 单测在 Part 2（与功能一同实现）

**Part 1 不覆盖的范围（明确推迟）：**
- antd 布局、左侧聚合面板、详情 Drawer、搜索栏、标签云、拖拽导入、超大文件进度条 → Part 2
- tag CRUD 与 file_tags 关联 IPC → Part 2（schema 已就位）
- search:* IPC 与排序逻辑 → Part 2
- file_opens 写入与"常用文档"统计 → Part 2
- electron-builder 打包、electron-updater、CI、Playwright E2E → Part 3
