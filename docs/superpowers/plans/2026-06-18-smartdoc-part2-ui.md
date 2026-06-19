# smartDoc Part 2 — 完整 UI、标签、搜索、Playwright E2E 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Part 1 主进程基础设施之上，把占位 UI 替换为完整的 antd 三栏布局，落实标签 / 搜索 / 详情抽屉 / 拖拽导入 / 重名对话框等设计文档第 4-7 节描述的所有交互；同时引入 Playwright 跑核心用户路径的 E2E 测试。

**Architecture:** Renderer 端用 React + antd 组件树；状态用 Zustand（轻量、无 Provider 噪音）。主进程补齐 `tag:*` / `search:*` / `file_opens` 写入与重名询问回流；新增搜索排序纯函数（Vitest 单测）。E2E 用 `@playwright/test` 的 `_electron.launch()` 直接驱动 dev 构建产物，每用例隔离临时仓库目录。

**Tech Stack:** antd 5、@ant-design/icons、Zustand、@playwright/test、电源继承自 Part 1（electron-vite / Vitest / better-sqlite3 / electron-log / electron-store）。

**先决条件:** Part 1 已合并到主分支（或当前分支已包含 Part 1 全部 commit），`npm run test:run && npm run typecheck && npm run build` 全绿。Part 2 在新分支 `feat/part2-ui` 上进行。

---

## 文件结构

新增/修改的文件清单：

| 文件 | 责任 |
|------|------|
| `package.json` | 追加 antd / icons / zustand / @playwright/test |
| `playwright.config.ts` | E2E 配置 |
| `src/shared/types.ts` | 追加 SearchQuery / FileFilter / TagInfo 已存在 |
| `src/shared/ipc-channels.ts` | 追加 tag:* / search:* / file:open(写入 file_opens) |
| `src/main/services/tag-service.ts` | 标签 CRUD + 文件-标签关联 |
| `src/main/services/search-service.ts` | 搜索查询 + 排序 |
| `src/main/repo/search-rank.ts` | 排序纯函数 |
| `src/main/services/file-service.ts` | 修改：list 接受 filter / keyword；open 写 file_opens |
| `src/main/ipc/tag-ipc.ts` | 注册 tag:* IPC |
| `src/main/ipc/search-ipc.ts` | 注册 search:* IPC |
| `src/preload/index.ts` | 暴露 tag / search api |
| `src/renderer/src/store/app-store.ts` | Zustand store：filters / selection / files |
| `src/renderer/src/api/use-files.ts` | 数据 hook：根据 filter 拉取 |
| `src/renderer/src/components/AppShell.tsx` | antd Layout 总布局 |
| `src/renderer/src/components/TopBar.tsx` | 搜索 + 导入按钮 |
| `src/renderer/src/components/SidePanel.tsx` | 左侧：快捷筛选 + 类型 + 标签云 |
| `src/renderer/src/components/FileTable.tsx` | 中间：文件列表 |
| `src/renderer/src/components/FileDrawer.tsx` | 右侧详情抽屉 |
| `src/renderer/src/components/DropZone.tsx` | 全窗口拖拽遮罩 |
| `src/renderer/src/components/DuplicateDialog.tsx` | 重名询问对话框 |
| `src/renderer/src/components/TagChip.tsx` | 彩色 Tag chip + 关闭/添加 |
| `src/renderer/src/components/file-icon.tsx` | 扩展名 → antd icon |
| `src/renderer/src/App.tsx` | 替换为 AppShell |
| `tests/unit/search-rank.test.ts` | 排序纯函数单测 |
| `tests/unit/tag-service.test.ts` | 标签服务单测 |
| `tests/e2e/import.spec.ts` | E2E：拖拽导入 + 重名对话框 |
| `tests/e2e/tags-and-search.spec.ts` | E2E：加标签 → 筛选 → 搜索 |
| `tests/e2e/fixtures.ts` | 启动 Electron + 隔离临时目录 |

---

## Task 1: 安装 Part 2 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 切分支**

```bash
git checkout -b feat/part2-ui
```

- [ ] **Step 2: 在 `dependencies` 追加**

```json
"antd": "^5.20.0",
"@ant-design/icons": "^5.4.0",
"zustand": "^4.5.4"
```

- [ ] **Step 3: 在 `devDependencies` 追加**

```json
"@playwright/test": "^1.47.0"
```

- [ ] **Step 4: 在 `scripts` 追加**

```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed"
```

- [ ] **Step 5: 安装并下载 Playwright 浏览器**

Run:
```bash
npm install
npx playwright install chromium
```
Expected: 依赖装好、Playwright 下载 Chromium 完成。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add antd, zustand, playwright deps"
```

---

## Task 2: 共享类型扩展

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: 在 `src/shared/types.ts` 末尾追加**

```ts
export interface FileFilter {
  /** 文件名/备注/标签关键词；为空表示无关键词过滤 */
  keyword?: string
  /** 选中的标签 id 列表，命中需同时拥有所有这些标签（AND） */
  tagIds?: string[]
  /** 限定文件扩展名（小写，无点） */
  exts?: string[]
  /** 仅未打标签的文件 */
  untagged?: boolean
  /** 仅最常打开的前 N（基于 file_opens） */
  topOpenedLimit?: number
}

export interface SearchSuggestion {
  /** 'file' | 'tag' */
  kind: 'file' | 'tag'
  text: string
  /** 关联的 id（file id 或 tag id） */
  id: string
}

/** 详细描述每条文件附带的标签 id，避免 N+1 查询 */
export interface FileWithTags extends FileInfo {
  tagIds: string[]
}
```

- [ ] **Step 2: 修改 `ListQuery`：让它接受 `FileFilter`**

把 `ListQuery` 替换为：

```ts
export interface ListQuery {
  filter?: FileFilter
  limit?: number
  offset?: number
}
```

- [ ] **Step 3: 在 `src/shared/ipc-channels.ts` 的 `IPC` 对象追加**

```ts
  TagList: 'tag:list',
  TagCreate: 'tag:create',
  TagDelete: 'tag:delete',
  TagUpdate: 'tag:update',
  TagSetOnFile: 'tag:setOnFile',
  SearchSuggest: 'search:suggest',
  FileOpenLog: 'file:openLog'
```

> 设计说明：`search:files` 不单独存在，搜索复用 `file:list` 通道并在 `filter.keyword` 上传递关键词；`search:suggest` 仍单列，为前缀联想保留独立通道；`file:openLog` 显式记录打开行为（用于"常用文档"）。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。注意：此时 `FileService.list` 的签名变了，编译会指出现有调用点需要更新。Task 3 修复。

- [ ] **Step 5: 提交**

```bash
git add src/shared
git commit -m "feat(shared): add FileFilter, SearchSuggestion, FileWithTags"
```

---

## Task 3: FileService 升级（filter / open log / 返回 FileWithTags）

**Files:**
- Modify: `src/main/services/file-service.ts`
- Modify: `tests/unit/file-service.test.ts`

- [ ] **Step 1: 给现有测试补一条断言（保证 list 仍按 imported_at desc）**

`tests/unit/file-service.test.ts` 已有的 `'list returns rows ordered by imported_at desc'` 用例不变，但调用从 `svc.list({})` 改为 `svc.list({ filter: {} })`（编译期会报错才正常）。一次性把文件里所有 `svc.list({})` 替换为 `svc.list({ filter: {} })`。

- [ ] **Step 2: 新增过滤测试用例（追加到 describe 内）**

```ts
it('filter by keyword matches name (case-insensitive)', async () => {
  await svc.import({ sourcePath: await writeSource('Report.pdf') })
  await svc.import({ sourcePath: await writeSource('photo.jpg') })
  const rows = svc.list({ filter: { keyword: 'report' } })
  expect(rows.map((r) => r.name)).toEqual(['Report.pdf'])
})

it('filter by exts narrows result', async () => {
  await svc.import({ sourcePath: await writeSource('a.pdf') })
  await svc.import({ sourcePath: await writeSource('b.png') })
  const rows = svc.list({ filter: { exts: ['png'] } })
  expect(rows.map((r) => r.name)).toEqual(['b.png'])
})

it('logOpen records into file_opens', async () => {
  const r = await svc.import({ sourcePath: await writeSource('a.pdf') })
  if (r.status !== 'imported') throw new Error('setup')
  svc.logOpen(r.file.id)
  svc.logOpen(r.file.id)
  const cnt = (db
    .prepare('SELECT COUNT(*) AS c FROM file_opens WHERE file_id=?')
    .get(r.file.id) as { c: number }).c
  expect(cnt).toBe(2)
})

it('list returns each row with tagIds (empty by default)', async () => {
  await svc.import({ sourcePath: await writeSource('a.pdf') })
  const rows = svc.list({ filter: {} })
  expect(rows[0].tagIds).toEqual([])
})
```

- [ ] **Step 3: 运行测试，确认这些新断言失败**

Run: `npm run test:run -- tests/unit/file-service.test.ts`
Expected: 至少 4 个新断言 FAIL（旧断言也会因为 `tagIds` 缺失而 FAIL）。

- [ ] **Step 4: 修改 `src/main/services/file-service.ts`**

替换 `list` 方法、追加 `logOpen` 方法。完整文件如下（替换全文）：

```ts
import path from 'node:path'
import fs from 'node:fs/promises'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type {
  FileInfo,
  FileWithTags,
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

  list(query: ListQuery): FileWithTags[] {
    const filter = query.filter ?? {}
    const where: string[] = []
    const params: unknown[] = []

    if (filter.keyword) {
      where.push(
        `(LOWER(files.name) LIKE ? OR LOWER(files.note) LIKE ? OR EXISTS (
          SELECT 1 FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
          WHERE ft.file_id = files.id AND LOWER(t.name) LIKE ?
        ))`
      )
      const like = `%${filter.keyword.toLowerCase()}%`
      params.push(like, like, like)
    }

    if (filter.exts && filter.exts.length > 0) {
      where.push(`files.ext IN (${filter.exts.map(() => '?').join(',')})`)
      params.push(...filter.exts.map((e) => e.toLowerCase()))
    }

    if (filter.untagged) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = files.id)`
      )
    }

    if (filter.tagIds && filter.tagIds.length > 0) {
      // AND 语义：要求文件同时拥有所有 tagIds
      where.push(`(
        SELECT COUNT(DISTINCT tag_id) FROM file_tags
        WHERE file_id = files.id AND tag_id IN (${filter.tagIds
          .map(() => '?')
          .join(',')})
      ) = ?`)
      params.push(...filter.tagIds, filter.tagIds.length)
    }

    let sql = `SELECT files.* FROM files`
    if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`

    if (filter.topOpenedLimit && filter.topOpenedLimit > 0) {
      sql = `
        SELECT files.* FROM files
        LEFT JOIN (
          SELECT file_id, COUNT(*) AS c FROM file_opens GROUP BY file_id
        ) o ON o.file_id = files.id
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(o.c, 0) DESC, files.imported_at DESC
        LIMIT ?
      `
      params.push(filter.topOpenedLimit)
    } else {
      sql += ` ORDER BY files.imported_at DESC`
      if (query.limit) {
        sql += ` LIMIT ?`
        params.push(query.limit)
        if (query.offset) {
          sql += ` OFFSET ?`
          params.push(query.offset)
        }
      }
    }

    const rows = this.db.prepare(sql).all(...params) as FileRow[]
    if (rows.length === 0) return []

    // 一次性取所有命中文件的 tag 关联，避免 N+1
    const ids = rows.map((r) => r.id)
    const tagRows = this.db
      .prepare(
        `SELECT file_id, tag_id FROM file_tags
         WHERE file_id IN (${ids.map(() => '?').join(',')})`
      )
      .all(...ids) as Array<{ file_id: string; tag_id: string }>
    const tagsByFile = new Map<string, string[]>()
    for (const tr of tagRows) {
      const arr = tagsByFile.get(tr.file_id) ?? []
      arr.push(tr.tag_id)
      tagsByFile.set(tr.file_id, arr)
    }

    return rows.map((r) => ({
      ...rowToFile(r),
      tagIds: tagsByFile.get(r.id) ?? []
    }))
  }

  logOpen(fileId: string): void {
    this.db
      .prepare(
        'INSERT INTO file_opens (id, file_id, opened_at) VALUES (?, ?, ?)'
      )
      .run(uuidv4(), fileId, new Date().toISOString())
  }

  async import(req: ImportRequest): Promise<ImportItemStatus> {
    const sourceName = path.basename(req.sourcePath)
    const existingAll = this.list({ filter: {} })
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
          name: existing.name,
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

  updateNote(id: string, note: string): FileInfo | null {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE files SET note=?, updated_at=? WHERE id=?')
      .run(note, now, id)
    const row = this.db
      .prepare('SELECT * FROM files WHERE id=?')
      .get(id) as FileRow | undefined
    return row ? rowToFile(row) : null
  }
}
```

- [ ] **Step 5: 测试通过**

Run: `npm run test:run -- tests/unit/file-service.test.ts`
Expected: 全部用例 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/main/services/file-service.ts tests/unit/file-service.test.ts
git commit -m "feat(file-service): support filter, open-log, and tagIds in list"
```

---

## Task 4: 标签服务（CRUD + 关联）

**Files:**
- Create: `src/main/services/tag-service.ts`
- Test: `tests/unit/tag-service.test.ts`

- [ ] **Step 1: 写失败测试 `tests/unit/tag-service.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase } from '@main/database'
import { TagService } from '@main/services/tag-service'
import type { Database } from 'better-sqlite3'

describe('TagService', () => {
  let db: Database
  let svc: TagService

  beforeEach(() => {
    db = openDatabase(':memory:')
    svc = new TagService(db)
    // 准备一个文件以便关联
    db.prepare(
      `INSERT INTO files (id,name,ext,size,storage_path,note,imported_at,updated_at)
       VALUES ('f1','a.pdf','pdf',1,'files/f1/a.pdf','','t','t')`
    ).run()
  })

  it('creates tag with default color', () => {
    const t = svc.create({ name: 'work' })
    expect(t.name).toBe('work')
    expect(t.color).toMatch(/^#/)
  })

  it('rejects duplicate tag name', () => {
    svc.create({ name: 'work' })
    expect(() => svc.create({ name: 'work' })).toThrow()
  })

  it('list returns tags ordered by name', () => {
    svc.create({ name: 'zeta' })
    svc.create({ name: 'alpha' })
    expect(svc.list().map((t) => t.name)).toEqual(['alpha', 'zeta'])
  })

  it('setOnFile replaces all tag associations atomically', () => {
    const t1 = svc.create({ name: 'a' })
    const t2 = svc.create({ name: 'b' })
    svc.setOnFile('f1', [t1.id, t2.id])
    expect(svc.tagsOfFile('f1').sort()).toEqual([t1.id, t2.id].sort())

    svc.setOnFile('f1', [t1.id])
    expect(svc.tagsOfFile('f1')).toEqual([t1.id])

    svc.setOnFile('f1', [])
    expect(svc.tagsOfFile('f1')).toEqual([])
  })

  it('update changes name and color', () => {
    const t = svc.create({ name: 'old' })
    const updated = svc.update(t.id, { name: 'new', color: '#ff0' })
    expect(updated.name).toBe('new')
    expect(updated.color).toBe('#ff0')
  })

  it('delete removes tag and cascades file_tags', () => {
    const t = svc.create({ name: 'work' })
    svc.setOnFile('f1', [t.id])
    svc.delete(t.id)
    expect(svc.list()).toHaveLength(0)
    expect(svc.tagsOfFile('f1')).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:run -- tests/unit/tag-service.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/main/services/tag-service.ts`**

```ts
import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type { TagInfo } from '@shared/types'

interface TagRow {
  id: string
  name: string
  color: string
  created_at: string
}

const rowToTag = (r: TagRow): TagInfo => ({
  id: r.id,
  name: r.name,
  color: r.color,
  createdAt: r.created_at
})

export class TagService {
  constructor(private readonly db: Database) {}

  list(): TagInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE')
      .all() as TagRow[]
    return rows.map(rowToTag)
  }

  create(input: { name: string; color?: string }): TagInfo {
    const id = uuidv4()
    const color = input.color ?? '#6366f1'
    const now = new Date().toISOString()
    this.db
      .prepare(
        'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(id, input.name, color, now)
    const row = this.db.prepare('SELECT * FROM tags WHERE id=?').get(id) as TagRow
    return rowToTag(row)
  }

  update(id: string, fields: { name?: string; color?: string }): TagInfo {
    const sets: string[] = []
    const params: unknown[] = []
    if (fields.name !== undefined) {
      sets.push('name=?')
      params.push(fields.name)
    }
    if (fields.color !== undefined) {
      sets.push('color=?')
      params.push(fields.color)
    }
    if (sets.length === 0) {
      const r = this.db.prepare('SELECT * FROM tags WHERE id=?').get(id) as TagRow
      return rowToTag(r)
    }
    params.push(id)
    this.db.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id=?`).run(...params)
    const row = this.db.prepare('SELECT * FROM tags WHERE id=?').get(id) as TagRow
    return rowToTag(row)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM tags WHERE id=?').run(id)
  }

  /** 替换文件的标签集合：原子操作（事务内删旧插新） */
  setOnFile(fileId: string, tagIds: string[]): void {
    const tx = this.db.transaction((fid: string, ids: string[]) => {
      this.db.prepare('DELETE FROM file_tags WHERE file_id=?').run(fid)
      const insert = this.db.prepare(
        'INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)'
      )
      for (const tid of ids) insert.run(fid, tid)
    })
    tx(fileId, tagIds)
  }

  tagsOfFile(fileId: string): string[] {
    const rows = this.db
      .prepare('SELECT tag_id FROM file_tags WHERE file_id=?')
      .all(fileId) as Array<{ tag_id: string }>
    return rows.map((r) => r.tag_id)
  }
}
```

- [ ] **Step 4: 测试通过**

Run: `npm run test:run -- tests/unit/tag-service.test.ts`
Expected: 6 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/services/tag-service.ts tests/unit/tag-service.test.ts
git commit -m "feat(tag-service): tag crud and atomic file-tag association"
```

---

## Task 5: 搜索排序纯函数

**Files:**
- Create: `src/main/repo/search-rank.ts`
- Test: `tests/unit/search-rank.test.ts`

设计文档第 7 节定义了排序优先级。我们把候选行的"排序键"算成纯函数，便于单测；服务层把数据库查询结果交给它排序。

- [ ] **Step 1: 写失败测试 `tests/unit/search-rank.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { rankFiles } from '@main/repo/search-rank'
import type { FileWithTags } from '@shared/types'

const make = (
  partial: Partial<FileWithTags> & Pick<FileWithTags, 'id' | 'name'>
): FileWithTags => ({
  ext: 'pdf',
  size: 1,
  storagePath: '',
  note: '',
  importedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  tagIds: [],
  ...partial
})

describe('rankFiles', () => {
  it('exact name match wins over partial', () => {
    const exact = make({ id: '1', name: 'foo.pdf' })
    const partial = make({ id: '2', name: 'foobar.pdf' })
    const ranked = rankFiles([partial, exact], {
      keyword: 'foo.pdf',
      tagNamesById: new Map()
    })
    expect(ranked[0].id).toBe('1')
  })

  it('name partial match outranks tag match', () => {
    const tagOnly = make({ id: 'tag', name: 'unrelated.pdf', tagIds: ['t1'] })
    const namePartial = make({ id: 'name', name: 'plan.pdf' })
    const ranked = rankFiles([tagOnly, namePartial], {
      keyword: 'plan',
      tagNamesById: new Map([['t1', 'planning']])
    })
    expect(ranked[0].id).toBe('name')
  })

  it('tag match outranks note match', () => {
    const noteHit = make({ id: 'note', name: 'a.pdf', note: 'plan b' })
    const tagHit = make({ id: 'tag', name: 'b.pdf', tagIds: ['t1'] })
    const ranked = rankFiles([noteHit, tagHit], {
      keyword: 'plan',
      tagNamesById: new Map([['t1', 'plan']])
    })
    expect(ranked[0].id).toBe('tag')
  })

  it('case-insensitive', () => {
    const exact = make({ id: '1', name: 'Report.PDF' })
    const ranked = rankFiles([exact], {
      keyword: 'report.pdf',
      tagNamesById: new Map()
    })
    expect(ranked[0].id).toBe('1')
  })

  it('empty keyword preserves input order', () => {
    const a = make({ id: 'a', name: 'a.pdf' })
    const b = make({ id: 'b', name: 'b.pdf' })
    const ranked = rankFiles([a, b], { keyword: '', tagNamesById: new Map() })
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('drops rows that match nothing', () => {
    const miss = make({ id: 'miss', name: 'unrelated.pdf' })
    const ranked = rankFiles([miss], {
      keyword: 'foo',
      tagNamesById: new Map()
    })
    expect(ranked).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:run -- tests/unit/search-rank.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/main/repo/search-rank.ts`**

```ts
import type { FileWithTags } from '@shared/types'

export interface RankContext {
  keyword: string
  /** 用于把 file.tagIds 翻译成名字做匹配 */
  tagNamesById: ReadonlyMap<string, string>
}

/**
 * 搜索排序优先级（设计文档第 7 节）：
 *   1. 文件名精确匹配
 *   2. 文件名包含关键词
 *   3. 标签名匹配（任一关联标签名包含关键词）
 *   4. 备注包含关键词
 * 不命中任何条件的行被剔除。空关键词时返回原顺序、不剔除。
 */
export function rankFiles(
  files: readonly FileWithTags[],
  ctx: RankContext
): FileWithTags[] {
  const kw = ctx.keyword.trim().toLowerCase()
  if (!kw) return [...files]

  const scored: Array<{ file: FileWithTags; score: number }> = []
  for (const f of files) {
    const name = f.name.toLowerCase()
    let score = 0
    if (name === kw) score = 4
    else if (name.includes(kw)) score = 3
    else {
      const tagHit = f.tagIds.some((tid) => {
        const n = ctx.tagNamesById.get(tid)
        return n ? n.toLowerCase().includes(kw) : false
      })
      if (tagHit) score = 2
      else if (f.note.toLowerCase().includes(kw)) score = 1
    }
    if (score > 0) scored.push({ file: f, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.file)
}
```

- [ ] **Step 4: 测试通过**

Run: `npm run test:run -- tests/unit/search-rank.test.ts`
Expected: 6 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/repo/search-rank.ts tests/unit/search-rank.test.ts
git commit -m "feat(search): rank files by name/tag/note priority"
```

---

## Task 6: 搜索服务 + suggest

**Files:**
- Create: `src/main/services/search-service.ts`

`search:files` 通道不再单列——前端直接用 `file:list({ filter:{ keyword } })`，服务端在 `FileService.list` 里已经实现 SQL 过滤。本任务只补 `search:suggest`（前缀联想）。

- [ ] **Step 1: 写 `src/main/services/search-service.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { SearchSuggestion } from '@shared/types'

export class SearchService {
  constructor(private readonly db: Database) {}

  /**
   * 前缀联想：返回最多 8 条候选，混合文件名与标签名。
   * 大小写不敏感，按字母序。
   */
  suggest(prefix: string): SearchSuggestion[] {
    const p = prefix.trim().toLowerCase()
    if (!p) return []
    const like = `${p}%`

    const files = this.db
      .prepare(
        `SELECT id, name FROM files
         WHERE LOWER(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 5`
      )
      .all(like) as Array<{ id: string; name: string }>

    const tags = this.db
      .prepare(
        `SELECT id, name FROM tags
         WHERE LOWER(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 3`
      )
      .all(like) as Array<{ id: string; name: string }>

    return [
      ...tags.map<SearchSuggestion>((t) => ({ kind: 'tag', text: t.name, id: t.id })),
      ...files.map<SearchSuggestion>((f) => ({
        kind: 'file',
        text: f.name,
        id: f.id
      }))
    ]
  }
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/main/services/search-service.ts
git commit -m "feat(search): prefix suggestion service"
```

---

## Task 7: tag/search IPC + main 装配更新

**Files:**
- Create: `src/main/ipc/tag-ipc.ts`
- Create: `src/main/ipc/search-ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/file-ipc.ts`

- [ ] **Step 1: 写 `src/main/ipc/tag-ipc.ts`**

```ts
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { TagInfo } from '@shared/types'
import type { TagService } from '@main/services/tag-service'

export function registerTagIpc(svc: TagService): void {
  ipcMain.handle(IPC.TagList, (): TagInfo[] => svc.list())
  ipcMain.handle(
    IPC.TagCreate,
    (_e, input: { name: string; color?: string }): TagInfo => svc.create(input)
  )
  ipcMain.handle(
    IPC.TagUpdate,
    (
      _e,
      id: string,
      fields: { name?: string; color?: string }
    ): TagInfo => svc.update(id, fields)
  )
  ipcMain.handle(IPC.TagDelete, (_e, id: string): void => svc.delete(id))
  ipcMain.handle(
    IPC.TagSetOnFile,
    (_e, fileId: string, tagIds: string[]): void => svc.setOnFile(fileId, tagIds)
  )
}
```

- [ ] **Step 2: 写 `src/main/ipc/search-ipc.ts`**

```ts
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SearchSuggestion } from '@shared/types'
import type { SearchService } from '@main/services/search-service'

export function registerSearchIpc(svc: SearchService): void {
  ipcMain.handle(
    IPC.SearchSuggest,
    (_e, prefix: string): SearchSuggestion[] => svc.suggest(prefix)
  )
}
```

- [ ] **Step 3: 修改 `src/main/ipc/file-ipc.ts`**

`file:open` 之外追加 `file:openLog`，并且 `file:open` 调用成功时也写一次 file_opens：

```ts
// 在 imports 顶部追加
// import already has shell, dialog, ipcMain
// 在 registerFileIpc 内修改 FileOpen handler：
ipcMain.handle(IPC.FileOpen, async (_e, id: string): Promise<void> => {
  const file = svc.list({ filter: {} }).find((f) => f.id === id)
  const root = repoRoot()
  if (!file || !root) return
  const abs = path.join(root, file.storagePath)
  const err = await shell.openPath(abs)
  if (err) {
    logger.warn('shell.openPath failed', abs, err)
    return
  }
  svc.logOpen(id)
})

ipcMain.handle(IPC.FileOpenLog, (_e, id: string): void => svc.logOpen(id))
```

并把 `FileShowInDir` 中 `svc.list({})` 改为 `svc.list({ filter: {} })`。

- [ ] **Step 4: 修改 `src/main/index.ts`：实例化 TagService / SearchService 并注册**

在 `bootstrap` 内 `svc = new FileService(db, repo)` 之后追加：

```ts
const tagSvc = new TagService(db)
const searchSvc = new SearchService(db)
registerTagIpc(tagSvc)
registerSearchIpc(searchSvc)
```

并把对应 import 加到顶部：

```ts
import { TagService } from '@main/services/tag-service'
import { SearchService } from '@main/services/search-service'
import { registerTagIpc } from '@main/ipc/tag-ipc'
import { registerSearchIpc } from '@main/ipc/search-ipc'
```

- [ ] **Step 5: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add src/main
git commit -m "feat(main): register tag/search ipc and wire openLog"
```

---

## Task 8: Preload api 扩展

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 在 `api` 对象内追加 `tag` 与 `search` 与 `file.openLog`**

```ts
  tag: {
    list: (): Promise<TagInfo[]> => ipcRenderer.invoke(IPC.TagList),
    create: (input: { name: string; color?: string }): Promise<TagInfo> =>
      ipcRenderer.invoke(IPC.TagCreate, input),
    update: (
      id: string,
      fields: { name?: string; color?: string }
    ): Promise<TagInfo> => ipcRenderer.invoke(IPC.TagUpdate, id, fields),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TagDelete, id),
    setOnFile: (fileId: string, tagIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.TagSetOnFile, fileId, tagIds)
  },
  search: {
    suggest: (prefix: string): Promise<SearchSuggestion[]> =>
      ipcRenderer.invoke(IPC.SearchSuggest, prefix)
  }
```

并在 `file` 对象内追加：

```ts
  openLog: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FileOpenLog, id)
```

- [ ] **Step 2: 顶部追加 import**

```ts
import type { TagInfo, SearchSuggestion } from '@shared/types'
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose tag and search api"
```

---

## Task 9: Renderer state（Zustand store）

**Files:**
- Create: `src/renderer/src/store/app-store.ts`

- [ ] **Step 1: 写 `src/renderer/src/store/app-store.ts`**

```ts
import { create } from 'zustand'
import type { FileFilter, FileWithTags, TagInfo } from '@shared/types'

interface AppState {
  // 数据
  files: FileWithTags[]
  tags: TagInfo[]

  // 筛选 / 搜索
  filter: FileFilter
  keyword: string

  // 选中
  selectedId: string | null

  // 加载状态
  loading: boolean

  // actions
  setFiles: (files: FileWithTags[]) => void
  setTags: (tags: TagInfo[]) => void
  setKeyword: (kw: string) => void
  patchFilter: (patch: Partial<FileFilter>) => void
  resetFilter: () => void
  select: (id: string | null) => void
  setLoading: (b: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  files: [],
  tags: [],
  filter: {},
  keyword: '',
  selectedId: null,
  loading: false,

  setFiles: (files) => set({ files }),
  setTags: (tags) => set({ tags }),
  setKeyword: (keyword) =>
    set((s) => ({ keyword, filter: { ...s.filter, keyword } })),
  patchFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: {}, keyword: '' }),
  select: (selectedId) => set({ selectedId }),
  setLoading: (loading) => set({ loading })
}))
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/store
git commit -m "feat(renderer): zustand app store"
```

---

## Task 10: 数据 hook（按 filter 拉取 + 标签缓存）

**Files:**
- Create: `src/renderer/src/api/use-files.ts`

- [ ] **Step 1: 写 `src/renderer/src/api/use-files.ts`**

```ts
import { useEffect } from 'react'
import { useAppStore } from '@renderer/store/app-store'

/** 监听 filter 变化，拉取 files；同时刷新 tags 一次。 */
export function useFiles(): void {
  const filter = useAppStore((s) => s.filter)
  const setFiles = useAppStore((s) => s.setFiles)
  const setTags = useAppStore((s) => s.setTags)
  const setLoading = useAppStore((s) => s.setLoading)

  useEffect(() => {
    void window.api.tag.list().then(setTags)
  }, [setTags])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api.file
      .list({ filter })
      .then((rows) => {
        if (!cancelled) setFiles(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filter, setFiles, setLoading])
}

/** 强制全量刷新 files + tags（导入/删除后调用） */
export async function refreshAll(): Promise<void> {
  const { filter } = useAppStore.getState()
  const [files, tags] = await Promise.all([
    window.api.file.list({ filter }),
    window.api.tag.list()
  ])
  useAppStore.setState({ files, tags })
}
```

- [ ] **Step 2: 修改 preload 类型，让 `window.api.file.list` 返回 `FileWithTags[]`**

打开 `src/preload/index.ts`，修改 `file.list` 行：

```ts
list: (query: ListQuery = {}): Promise<FileWithTags[]> =>
  ipcRenderer.invoke(IPC.FileList, query),
```

并在顶部 import 加上 `FileWithTags`。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck:web`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/api src/preload/index.ts
git commit -m "feat(renderer): files data hook with filter watcher"
```

---

## Task 11: 重名询问对话框

**Files:**
- Create: `src/renderer/src/components/DuplicateDialog.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/DuplicateDialog.tsx`**

```tsx
import { Modal, Space, Typography } from 'antd'
import type { DuplicateAction, FileInfo } from '@shared/types'

interface Props {
  open: boolean
  sourcePath: string
  existing: FileInfo
  onChoose: (action: DuplicateAction) => void
  onCancel: () => void
}

export function DuplicateDialog({
  open,
  sourcePath,
  existing,
  onChoose,
  onCancel
}: Props): JSX.Element {
  return (
    <Modal
      title="文件已存在"
      open={open}
      onCancel={onCancel}
      footer={[
        <a key="skip" onClick={() => onChoose('skip')}>
          跳过
        </a>,
        <a key="overwrite" onClick={() => onChoose('overwrite')} style={{ marginLeft: 16 }}>
          覆盖
        </a>,
        <a key="keep" onClick={() => onChoose('keep-both')} style={{ marginLeft: 16 }}>
          保留两份
        </a>
      ]}
    >
      <Space direction="vertical">
        <Typography.Text>
          仓库中已有同名文件 <Typography.Text strong>{existing.name}</Typography.Text>。
        </Typography.Text>
        <Typography.Text type="secondary">
          源：{sourcePath}
        </Typography.Text>
      </Space>
    </Modal>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/DuplicateDialog.tsx
git commit -m "feat(renderer): duplicate import dialog"
```

---

## Task 12: 文件类型图标映射

**Files:**
- Create: `src/renderer/src/components/file-icon.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/file-icon.tsx`**

```tsx
import {
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileImageOutlined,
  FileZipOutlined,
  FileMarkdownOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileOutlined
} from '@ant-design/icons'

/** 扩展名（小写无点）到 antd 图标的映射；未知类型回退 FileOutlined。 */
export function fileIconFor(ext: string): JSX.Element {
  switch (ext) {
    case 'pdf':
      return <FilePdfOutlined style={{ color: '#e64a19' }} />
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileExcelOutlined style={{ color: '#2e7d32' }} />
    case 'doc':
    case 'docx':
      return <FileWordOutlined style={{ color: '#1565c0' }} />
    case 'ppt':
    case 'pptx':
      return <FilePptOutlined style={{ color: '#ef6c00' }} />
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'bmp':
    case 'webp':
      return <FileImageOutlined style={{ color: '#6a1b9a' }} />
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return <FileZipOutlined style={{ color: '#5d4037' }} />
    case 'md':
      return <FileMarkdownOutlined style={{ color: '#37474f' }} />
    case 'txt':
    case 'log':
      return <FileTextOutlined style={{ color: '#455a64' }} />
    default:
      return <FileOutlined style={{ color: '#90a4ae' }} />
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/file-icon.tsx
git commit -m "feat(renderer): file type icon mapping"
```

---

## Task 13: TagChip 组件

**Files:**
- Create: `src/renderer/src/components/TagChip.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/TagChip.tsx`**

```tsx
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
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/TagChip.tsx
git commit -m "feat(renderer): TagChip component"
```

---

## Task 14: TopBar（搜索 + 导入按钮）

**Files:**
- Create: `src/renderer/src/components/TopBar.tsx`

`AutoComplete` + 防抖（300ms）。`Input.Search` 也行，但 `AutoComplete` 内嵌 input 便于挂载 suggest 候选。

- [ ] **Step 1: 写 `src/renderer/src/components/TopBar.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Button, Input, Space } from 'antd'
import { ImportOutlined } from '@ant-design/icons'
import type { SearchSuggestion, ImportItemStatus } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { refreshAll } from '@renderer/api/use-files'
import { DuplicateDialog } from './DuplicateDialog'

export function TopBar(): JSX.Element {
  const setKeyword = useAppStore((s) => s.setKeyword)
  const [draft, setDraft] = useState('')
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [dup, setDup] = useState<{
    sourcePath: string
    existing: SearchSuggestion extends never ? never : import('@shared/types').FileInfo
  } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 输入 → 300ms 防抖 → 写入 store.keyword 触发列表刷新
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setKeyword(draft.trim())
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draft, setKeyword])

  const onSuggest = useMemo(
    () =>
      async (value: string): Promise<void> => {
        if (!value) {
          setOptions([])
          return
        }
        const list = await window.api.search.suggest(value)
        setOptions(
          list.map((s) => ({
            value: s.text,
            label: `${s.kind === 'tag' ? '🏷️ ' : ''}${s.text}`
          }))
        )
      },
    []
  )

  async function handleImport(paths: string[]): Promise<void> {
    for (const p of paths) {
      let result: ImportItemStatus = await window.api.file.import({ sourcePath: p })
      if (result.status === 'duplicate') {
        const action = await new Promise<'skip' | 'overwrite' | 'keep-both'>(
          (resolve) => {
            setDup({
              sourcePath: result.status === 'duplicate' ? result.sourcePath : p,
              existing:
                result.status === 'duplicate'
                  ? result.existing
                  : ({} as never)
            })
            ;(window as any).__smartdoc_dupResolver = resolve
          }
        )
        setDup(null)
        result = await window.api.file.import({ sourcePath: p, duplicateAction: action })
      }
    }
    await refreshAll()
  }

  async function pickAndImport(): Promise<void> {
    const paths = await window.api.dialog.pickFiles()
    if (paths.length > 0) await handleImport(paths)
  }

  return (
    <Space style={{ padding: 12, width: '100%' }}>
      <AutoComplete
        options={options}
        onSearch={onSuggest}
        onSelect={(v) => setDraft(v)}
        style={{ width: 480 }}
      >
        <Input.Search
          placeholder="搜索文件名 / 标签 / 备注"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          allowClear
        />
      </AutoComplete>
      <Button
        type="primary"
        icon={<ImportOutlined />}
        onClick={pickAndImport}
      >
        导入文件
      </Button>
      {dup && (
        <DuplicateDialog
          open
          sourcePath={dup.sourcePath}
          existing={dup.existing}
          onChoose={(a) => (window as any).__smartdoc_dupResolver?.(a)}
          onCancel={() => (window as any).__smartdoc_dupResolver?.('skip')}
        />
      )}
    </Space>
  )
}
```

> 设计说明：用 `window.__smartdoc_dupResolver` 把 Promise 与 antd Modal 解耦，避免引入额外 reducer。Part 2 末尾不会有第三处需要它，YAGNI。

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/TopBar.tsx
git commit -m "feat(renderer): TopBar with debounced search and import flow"
```

---

## Task 15: SidePanel（快捷筛选 + 类型 + 标签云）

**Files:**
- Create: `src/renderer/src/components/SidePanel.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/SidePanel.tsx`**

```tsx
import { useMemo } from 'react'
import { Divider, Space, Typography } from 'antd'
import { useAppStore } from '@renderer/store/app-store'
import { TagChip } from './TagChip'

const QUICK_PRESETS: Array<{
  key: string
  label: string
  apply: () => void
  active: (filter: ReturnType<typeof useAppStore.getState>['filter']) => boolean
}> = [
  {
    key: 'all',
    label: '全部',
    apply: () => useAppStore.getState().resetFilter(),
    active: (f) =>
      !f.untagged && !f.topOpenedLimit && !f.exts && !f.tagIds && !f.keyword
  },
  {
    key: 'untagged',
    label: '未打标签',
    apply: () => useAppStore.getState().patchFilter({ untagged: true }),
    active: (f) => !!f.untagged
  },
  {
    key: 'top',
    label: '常用文档',
    apply: () => useAppStore.getState().patchFilter({ topOpenedLimit: 20 }),
    active: (f) => !!f.topOpenedLimit
  }
]

export function SidePanel(): JSX.Element {
  const files = useAppStore((s) => s.files)
  const tags = useAppStore((s) => s.tags)
  const filter = useAppStore((s) => s.filter)
  const patchFilter = useAppStore((s) => s.patchFilter)

  const extCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of files) m.set(f.ext, (m.get(f.ext) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [files])

  const selectedTagIds = filter.tagIds ?? []

  function toggleTag(id: string): void {
    const has = selectedTagIds.includes(id)
    const next = has
      ? selectedTagIds.filter((t) => t !== id)
      : [...selectedTagIds, id]
    patchFilter({ tagIds: next.length === 0 ? undefined : next })
  }

  function toggleExt(ext: string): void {
    const cur = filter.exts ?? []
    const has = cur.includes(ext)
    const next = has ? cur.filter((e) => e !== ext) : [...cur, ext]
    patchFilter({ exts: next.length === 0 ? undefined : next })
  }

  return (
    <div style={{ padding: 12 }}>
      <Typography.Title level={5}>⚡ 快捷筛选</Typography.Title>
      <Space direction="vertical">
        {QUICK_PRESETS.map((p) => (
          <a
            key={p.key}
            data-testid={`quick-${p.key}`}
            onClick={p.apply}
            style={{ fontWeight: p.active(filter) ? 600 : 400 }}
          >
            {p.label}
          </a>
        ))}
      </Space>

      <Divider />
      <Typography.Title level={5}>📑 类型</Typography.Title>
      <Space direction="vertical">
        {extCounts.map(([ext, count]) => (
          <a
            key={ext}
            data-testid={`ext-${ext}`}
            onClick={() => toggleExt(ext)}
            style={{
              fontWeight: filter.exts?.includes(ext) ? 600 : 400
            }}
          >
            .{ext} ({count})
          </a>
        ))}
      </Space>

      <Divider />
      <Typography.Title level={5}>🏷️ 标签</Typography.Title>
      <Space wrap>
        {tags.map((t) => (
          <TagChip
            key={t.id}
            tag={t}
            onClick={() => toggleTag(t.id)}
            selected={selectedTagIds.includes(t.id)}
          />
        ))}
      </Space>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/SidePanel.tsx
git commit -m "feat(renderer): SidePanel with quick filters, ext counts, tag cloud"
```

---

## Task 16: FileTable（中间看板）

**Files:**
- Create: `src/renderer/src/components/FileTable.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/FileTable.tsx`**

```tsx
import { Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FileWithTags } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { fileIconFor } from './file-icon'
import { TagChip } from './TagChip'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

export function FileTable(): JSX.Element {
  const files = useAppStore((s) => s.files)
  const tags = useAppStore((s) => s.tags)
  const select = useAppStore((s) => s.select)
  const selectedId = useAppStore((s) => s.selectedId)
  const loading = useAppStore((s) => s.loading)

  const tagsById = new Map(tags.map((t) => [t.id, t] as const))

  const columns: ColumnsType<FileWithTags> = [
    {
      title: '文件名',
      key: 'name',
      render: (_v, record) => (
        <Space>
          {fileIconFor(record.ext)}
          <span>{record.name}</span>
          {record.tagIds.map((tid) => {
            const t = tagsById.get(tid)
            return t ? <TagChip key={tid} tag={t} /> : null
          })}
        </Space>
      )
    },
    {
      title: '大小',
      key: 'size',
      width: 100,
      render: (_v, r) => formatSize(r.size)
    },
    {
      title: '导入时间',
      key: 'importedAt',
      width: 120,
      render: (_v, r) => formatDate(r.importedAt)
    }
  ]

  return (
    <Table<FileWithTags>
      rowKey="id"
      columns={columns}
      dataSource={files}
      loading={loading}
      pagination={false}
      size="middle"
      data-testid="file-table"
      rowClassName={(r, idx) =>
        `${r.id === selectedId ? 'row-selected' : ''} ${
          idx % 2 === 0 ? 'row-even' : 'row-odd'
        }`
      }
      onRow={(record) => ({
        onClick: () => select(record.id),
        onDoubleClick: () => {
          void window.api.file.open(record.id)
        }
      })}
    />
  )
}
```

- [ ] **Step 2: 添加配套样式 `src/renderer/src/components/file-table.css`**

```css
.row-even { background-color: #fafafa; }
.row-odd  { background-color: #ffffff; }
.row-selected { background-color: #e6f4ff !important; }
```

并在 `FileTable.tsx` 顶部 `import './file-table.css'`。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/FileTable.tsx src/renderer/src/components/file-table.css
git commit -m "feat(renderer): FileTable with icon, tags, and zebra rows"
```

---

## Task 17: FileDrawer（详情抽屉）

**Files:**
- Create: `src/renderer/src/components/FileDrawer.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/FileDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react'
import {
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Typography,
  message
} from 'antd'
import { FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons'
import type { FileWithTags, TagInfo } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { refreshAll } from '@renderer/api/use-files'
import { TagChip } from './TagChip'

export function FileDrawer(): JSX.Element {
  const selectedId = useAppStore((s) => s.selectedId)
  const select = useAppStore((s) => s.select)
  const files = useAppStore((s) => s.files)
  const tags = useAppStore((s) => s.tags)
  const file: FileWithTags | undefined = files.find((f) => f.id === selectedId)

  const [note, setNote] = useState('')
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([])

  useEffect(() => {
    if (file) {
      setNote(file.note)
      setPendingTagIds(file.tagIds)
    }
  }, [file?.id])

  if (!file) return <Drawer open={false} onClose={() => undefined} />

  async function commitNote(): Promise<void> {
    await window.api.file.update(file!.id, { note })
    await refreshAll()
    message.success('备注已保存')
  }

  async function commitTags(next: string[]): Promise<void> {
    setPendingTagIds(next)
    await window.api.tag.setOnFile(file!.id, next)
    await refreshAll()
  }

  async function createAndApplyTag(name: string): Promise<void> {
    if (!name.trim()) return
    const t = await window.api.tag.create({ name: name.trim() })
    await commitTags([...pendingTagIds, t.id])
  }

  return (
    <Drawer
      open={!!selectedId}
      onClose={() => select(null)}
      width={320}
      title={file.name}
      data-testid="file-drawer"
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Title level={5}>标签</Typography.Title>
        <Space wrap>
          {pendingTagIds.map((tid) => {
            const t = tags.find((x) => x.id === tid)
            return t ? (
              <TagChip
                key={tid}
                tag={t}
                closable
                onClose={() =>
                  commitTags(pendingTagIds.filter((x) => x !== tid))
                }
              />
            ) : null
          })}
        </Space>
        <Select
          mode="tags"
          style={{ width: '100%' }}
          placeholder="添加标签（回车提交）"
          value={[]}
          onSelect={(value: string) => {
            const known = tags.find((t) => t.name === value)
            if (known) commitTags([...pendingTagIds, known.id])
            else void createAndApplyTag(value)
          }}
          options={tags
            .filter((t) => !pendingTagIds.includes(t.id))
            .map((t) => ({ label: t.name, value: t.name }))}
        />

        <Typography.Title level={5}>备注</Typography.Title>
        <Input.TextArea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
        />

        <Typography.Title level={5}>文件信息</Typography.Title>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="大小">{file.size} B</Descriptions.Item>
          <Descriptions.Item label="导入时间">{file.importedAt}</Descriptions.Item>
          <Descriptions.Item label="路径">{file.storagePath}</Descriptions.Item>
        </Descriptions>

        <Space>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={() => window.api.file.showInDir(file.id)}
          >
            定位文件
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={async () => {
              await window.api.file.delete([file.id])
              select(null)
              await refreshAll()
            }}
          >
            删除
          </Button>
        </Space>
      </Space>
    </Drawer>
  )
}
```

- [ ] **Step 2: 在 preload 上补 `file.update`（若 Part 1 未导出）**

打开 `src/preload/index.ts`，在 `file` 对象内追加：

```ts
update: (id: string, fields: { note?: string }): Promise<FileInfo | null> =>
  ipcRenderer.invoke('file:update', id, fields)
```

并在 `src/shared/ipc-channels.ts` 的 IPC 对象追加 `FileUpdate: 'file:update'`，把 preload 改为引用常量。

修改 `src/main/ipc/file-ipc.ts`，注册 update：

```ts
ipcMain.handle(IPC.FileUpdate, (_e, id: string, fields: { note?: string }) => {
  if (typeof fields.note === 'string') return svc.updateNote(id, fields.note)
  return svc.list({ filter: {} }).find((f) => f.id === id) ?? null
})
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/FileDrawer.tsx src/preload/index.ts src/shared/ipc-channels.ts src/main/ipc/file-ipc.ts
git commit -m "feat(renderer): FileDrawer with tag/note editing and file actions"
```

---

## Task 18: DropZone（全窗口拖拽遮罩）

**Files:**
- Create: `src/renderer/src/components/DropZone.tsx`

- [ ] **Step 1: 在 main 端追加 `dialog:resolveDroppedPaths`（直接用浏览器 File 对象的 `path` 属性即可，不需要 IPC——Electron 的 File 对象会带 absolute path）**

确认无需 main 端改动。

- [ ] **Step 2: 写 `src/renderer/src/components/DropZone.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { ImportItemStatus } from '@shared/types'
import { refreshAll } from '@renderer/api/use-files'

interface Props {
  onDuplicate: (
    sourcePath: string,
    existing: import('@shared/types').FileInfo
  ) => Promise<'skip' | 'overwrite' | 'keep-both'>
}

/** 监听整个 window 的 dragover / drop，渲染半透明遮罩。 */
export function DropZone({ onDuplicate }: Props): JSX.Element | null {
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    let depth = 0
    function onEnter(e: DragEvent): void {
      e.preventDefault()
      depth++
      setHovering(true)
    }
    function onLeave(e: DragEvent): void {
      e.preventDefault()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setHovering(false)
    }
    function onOver(e: DragEvent): void {
      e.preventDefault()
    }
    async function onDrop(e: DragEvent): Promise<void> {
      e.preventDefault()
      depth = 0
      setHovering(false)
      const files = e.dataTransfer?.files
      if (!files) return
      for (let i = 0; i < files.length; i++) {
        const f = files[i] as File & { path?: string }
        if (!f.path) continue
        let r: ImportItemStatus = await window.api.file.import({
          sourcePath: f.path
        })
        if (r.status === 'duplicate') {
          const action = await onDuplicate(r.sourcePath, r.existing)
          r = await window.api.file.import({
            sourcePath: f.path,
            duplicateAction: action
          })
        }
      }
      await refreshAll()
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onDuplicate])

  if (!hovering) return null
  return (
    <div
      data-testid="drop-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(99, 102, 241, 0.15)',
        border: '4px dashed #6366f1',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        pointerEvents: 'none'
      }}
    >
      松开以导入
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/DropZone.tsx
git commit -m "feat(renderer): DropZone overlay for window-wide file drop"
```

---

## Task 19: AppShell（总布局）+ 替换 App.tsx

**Files:**
- Create: `src/renderer/src/components/AppShell.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: 写 `src/renderer/src/components/AppShell.tsx`**

```tsx
import { useState } from 'react'
import { Layout } from 'antd'
import type { DuplicateAction, FileInfo } from '@shared/types'
import { useFiles } from '@renderer/api/use-files'
import { TopBar } from './TopBar'
import { SidePanel } from './SidePanel'
import { FileTable } from './FileTable'
import { FileDrawer } from './FileDrawer'
import { DropZone } from './DropZone'
import { DuplicateDialog } from './DuplicateDialog'

export function AppShell(): JSX.Element {
  useFiles()

  const [dup, setDup] = useState<{
    sourcePath: string
    existing: FileInfo
    resolve: (a: DuplicateAction) => void
  } | null>(null)

  function askDuplicate(
    sourcePath: string,
    existing: FileInfo
  ): Promise<DuplicateAction> {
    return new Promise((resolve) => setDup({ sourcePath, existing, resolve }))
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Header
        style={{ background: '#fff', padding: 0, borderBottom: '1px solid #eee' }}
      >
        <TopBar />
      </Layout.Header>
      <Layout>
        <Layout.Sider width={220} style={{ background: '#fff' }}>
          <SidePanel />
        </Layout.Sider>
        <Layout.Content style={{ overflow: 'auto', padding: 12 }}>
          <FileTable />
        </Layout.Content>
      </Layout>
      <FileDrawer />
      <DropZone onDuplicate={askDuplicate} />
      {dup && (
        <DuplicateDialog
          open
          sourcePath={dup.sourcePath}
          existing={dup.existing}
          onChoose={(a) => {
            dup.resolve(a)
            setDup(null)
          }}
          onCancel={() => {
            dup.resolve('skip')
            setDup(null)
          }}
        />
      )}
    </Layout>
  )
}
```

- [ ] **Step 2: 替换 `src/renderer/src/App.tsx`**

```tsx
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AppShell } from './components/AppShell'

export function App(): JSX.Element {
  return (
    <ConfigProvider locale={zhCN}>
      <AppShell />
    </ConfigProvider>
  )
}
```

- [ ] **Step 3: 在 `main.tsx` 引入 antd reset 样式**

```tsx
import 'antd/dist/reset.css'
```

放在 `import { createRoot }` 之上即可。

- [ ] **Step 4: typecheck + 启动验证**

Run:
```bash
npm run typecheck
npm run dev
```
Expected: 三栏 antd 布局加载。

手动验证清单：
- [ ] 顶部搜索框输入"report"等，列表 300ms 后过滤
- [ ] 点击列表行 → 右侧抽屉打开
- [ ] 抽屉内添加新标签 → 左侧标签云出现 → 点击该标签 → 列表过滤
- [ ] 双击行 → 调系统默认程序打开
- [ ] 拖文件到窗口 → 出现紫色遮罩 → 松开 → 导入
- [ ] 拖入同名文件 → 弹"文件已存在"对话框 → 三个选项均可点击

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src
git commit -m "feat(renderer): full antd shell with side panel, table, drawer, drop zone"
```

---

## Task 20: Playwright 配置与 fixture

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`

- [ ] **Step 1: 写 `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,           // Electron 实例不并行
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 10_000,
    trace: 'retain-on-failure'
  }
})
```

- [ ] **Step 2: 写 `tests/e2e/fixtures.ts`**

```ts
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
```

- [ ] **Step 3: 修改 `src/main/index.ts`，让其支持 `SMARTDOC_USER_DATA` 环境变量覆盖 userData**

在 `app.whenReady` 之前追加：

```ts
if (process.env['SMARTDOC_USER_DATA']) {
  app.setPath('userData', process.env['SMARTDOC_USER_DATA'])
}
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck:node`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add playwright.config.ts tests/e2e/fixtures.ts src/main/index.ts
git commit -m "test(e2e): playwright fixtures with isolated repo and userData"
```

---

## Task 21: E2E—— 导入与重名对话框

**Files:**
- Create: `tests/e2e/import.spec.ts`

- [ ] **Step 1: 写 `tests/e2e/import.spec.ts`**

```ts
import { test, expect } from './fixtures'
import fs from 'node:fs/promises'
import path from 'node:path'

test.describe('import', () => {
  test('import via dialog adds row to table', async ({ page, app, writeSource }) => {
    const src = await writeSource('hello.pdf', 'pdf-bytes')

    // mock dialog.showOpenDialog 返回我们指定的路径
    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () =>
        ({ canceled: false, filePaths: [p] } as any)
    }, src)

    await page.getByRole('button', { name: '导入文件' }).click()

    const table = page.getByTestId('file-table')
    await expect(table.getByText('hello.pdf')).toBeVisible()
  })

  test('duplicate filename triggers dialog and "keep both" produces a (2)', async ({
    page,
    app,
    writeSource
  }) => {
    const src1 = await writeSource('dup.pdf', 'v1')

    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () =>
        ({ canceled: false, filePaths: [p] } as any)
    }, src1)

    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(page.getByTestId('file-table').getByText('dup.pdf')).toBeVisible()

    // 第二次导入同名
    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(page.getByText('文件已存在')).toBeVisible()

    await page.getByRole('button', { name: '保留两份' }).click()
    await expect(
      page.getByTestId('file-table').getByText('dup (2).pdf')
    ).toBeVisible()
  })
})
```

- [ ] **Step 2: 先 build，再跑 E2E**

Run:
```bash
npm run build
npm run test:e2e
```
Expected: 2 个用例 PASS。失败时检查 `playwright-report/index.html`。

- [ ] **Step 3: 提交**

```bash
git add tests/e2e/import.spec.ts
git commit -m "test(e2e): import flow including duplicate dialog"
```

---

## Task 22: E2E—— 标签与搜索

**Files:**
- Create: `tests/e2e/tags-and-search.spec.ts`

- [ ] **Step 1: 写 `tests/e2e/tags-and-search.spec.ts`**

```ts
import { test, expect } from './fixtures'

test.describe('tags and search', () => {
  test.beforeEach(async ({ page, app, writeSource }) => {
    // 预置三条文件
    const a = await writeSource('Report.pdf')
    const b = await writeSource('photo.jpg')
    const c = await writeSource('plan.txt')
    await app.evaluate(
      async ({ dialog }, [pa, pb, pc]) => {
        dialog.showOpenDialog = async () =>
          ({ canceled: false, filePaths: [pa, pb, pc] } as any)
      },
      [a, b, c]
    )
    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(page.getByTestId('file-table').getByText('Report.pdf')).toBeVisible()
  })

  test('add tag via drawer; click in side panel to filter', async ({ page }) => {
    // 点 Report.pdf 行 → 抽屉
    await page.getByTestId('file-table').getByText('Report.pdf').click()
    const drawer = page.getByTestId('file-drawer')
    await expect(drawer).toBeVisible()

    // 在 Select(mode=tags) 中输入并提交
    const select = drawer.locator('.ant-select')
    await select.click()
    await page.keyboard.type('work')
    await page.keyboard.press('Enter')
    await expect(drawer.getByText('work')).toBeVisible()

    // 关抽屉，点击侧栏的 work 标签
    await page.keyboard.press('Escape')
    await page.getByText('work', { exact: true }).first().click()

    const table = page.getByTestId('file-table')
    await expect(table.getByText('Report.pdf')).toBeVisible()
    await expect(table.getByText('photo.jpg')).toHaveCount(0)
  })

  test('keyword search filters table after debounce', async ({ page }) => {
    await page.getByPlaceholder('搜索文件名 / 标签 / 备注').fill('plan')
    const table = page.getByTestId('file-table')
    await expect(table.getByText('plan.txt')).toBeVisible()
    await expect(table.getByText('Report.pdf')).toHaveCount(0)
    await expect(table.getByText('photo.jpg')).toHaveCount(0)
  })
})
```

- [ ] **Step 2: 跑 E2E**

Run: `npm run test:e2e`
Expected: 3 个新用例 + Task 21 的 2 个，共 5 个 PASS。

- [ ] **Step 3: 提交**

```bash
git add tests/e2e/tags-and-search.spec.ts
git commit -m "test(e2e): tag editing in drawer + keyword search"
```

---

## Task 23: 错误处理与边界（设计文档第 8 节最低必要项）

**Files:**
- Modify: `src/main/services/file-service.ts`
- Modify: `src/renderer/src/components/FileTable.tsx`

- [ ] **Step 1: 在 FileService 末尾追加 `existsOnDisk`**

```ts
async existsOnDisk(id: string): Promise<boolean> {
  const f = this.list({ filter: {} }).find((x) => x.id === id)
  if (!f) return false
  const parts = f.storagePath.split('/')
  // parts: ['files', uuid, name]
  return this.repo.exists(parts[1], parts.slice(2).join('/'))
}
```

并在 `src/preload/index.ts` 暴露 `file.existsOnDisk: (id) => ipcRenderer.invoke('file:existsOnDisk', id)`，在 `src/shared/ipc-channels.ts` 加 `FileExistsOnDisk: 'file:existsOnDisk'`，在 `src/main/ipc/file-ipc.ts` 注册：

```ts
ipcMain.handle(IPC.FileExistsOnDisk, async (_e, id: string): Promise<boolean> =>
  svc.existsOnDisk(id)
)
```

- [ ] **Step 2: 在 `FileTable.tsx` 中标识"文件丢失"**

懒加载策略：列表渲染时不 stat（成本高）。改为**双击时**检查；不存在则弹 `message.error('文件已丢失，请检查仓库目录或移除记录')`。

修改 `onDoubleClick`：

```tsx
onDoubleClick: async () => {
  const ok = await window.api.file.existsOnDisk(record.id)
  if (!ok) {
    const { message } = await import('antd')
    message.error('文件已丢失，无法打开')
    return
  }
  void window.api.file.open(record.id)
}
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src
git commit -m "feat: detect missing files on open"
```

---

## Task 24: Part 2 收尾

- [ ] **Step 1: 全量回归**

Run: `npm run typecheck && npm run test:run && npm run build && npm run test:e2e`
Expected: 单测 4-5 个文件全绿、build 成功、E2E 5 个用例 PASS。

- [ ] **Step 2: 更新 `README.md`，把 "[ ] Part 2" 勾上**

```markdown
- [x] Part 1：脚手架、主进程基础设施、最小占位 UI
- [x] Part 2：完整 UI（antd 布局、标签、搜索、详情抽屉、Playwright E2E）
- [ ] Part 3：electron-builder 打包 + electron-updater 自动更新
```

- [ ] **Step 3: 推送分支**

```bash
git add README.md
git commit -m "docs: mark part 2 complete"
git push -u origin feat/part2-ui
```

---

## 自查清单

- 设计文档第 4 节（三栏布局、左侧聚合、中间列表、右侧详情、单击/双击/拖拽语义） → Task 14-19 落实
- 第 5 节 IPC（tag:* / search:suggest） → Task 7 / 8 落实，`search:files` 复用 `file:list({filter})`
- 第 6 节（重名对话框 跳过/覆盖/保留两份） → Task 11 / 14 / 19（DuplicateDialog 在 TopBar 与 DropZone 两路触发）
- 第 7 节搜索（300ms debounce、文件名/标签/备注、相关度优先级） → Task 5（rankFiles 单测）+ Task 14（debounce）+ Task 3（SQL 过滤）
- 第 8 节"仓库文件被外部删除" → Task 23
- 第 10.5 节 Vitest 列表（database / file-repo / search / tag） → Part 1 已覆盖 database / duplicate / sequence-name / file-service；Part 2 补 search-rank / tag-service
- 第 10.5 节 Playwright 五大用例：导入 ✓ / 加标签筛选 ✓ / 搜索排序 ✓ / 双击打开 → 第 23 任务覆盖（用 mock 后续可加），首次启动引导仓库选择留 Part 3 安装包验证

**Part 2 不覆盖的范围（明确推迟）：**
- 超大文件 >500MB 进度条 → Part 3（包测试时一并 verify）
- electron-builder 打包配置、自动更新 → Part 3
- "首次启动引导仓库选择"的 E2E（依赖未预置 config 文件） → Part 3 包测时覆盖



