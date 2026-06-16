# smartDoc 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分两部分实现 smartDoc Windows 桌面文档管理软件：第一部分后台功能 + 简略原生前端验证，第二部分 React + Ant Design 完整前端。

**Architecture:** Electron 主进程负责 SQLite 操作和文件管理，通过 IPC 与渲染进程通信。第一部分渲染进程使用原生 HTML/CSS/JS 做功能验证，第二部分替换为 React + TypeScript + Ant Design 完整 UI。

**Tech Stack:** Electron, better-sqlite3, Node.js (crypto/uuid/fs/path), Part 2 加 React + TypeScript + Vite + Ant Design + @ant-design/icons

---

## 文件结构

### 第一部分（最终状态）
```
smartDoc/
├── package.json
├── src/
│   ├── main/
│   │   ├── main.js              # Electron 入口，创建窗口
│   │   ├── database.js          # SQLite 初始化与表创建
│   │   ├── ipc-handlers.js      # 全部 IPC 通道处理器
│   │   └── file-repo.js         # 文件系统操作（导入/删除/去重/MD5）
│   ├── preload/
│   │   └── preload.js           # contextBridge 暴露 API
│   └── renderer/
│       ├── index.html           # 简略前端页面
│       ├── style.css            # 基本样式
│       └── app.js               # 前端逻辑，调用 IPC
└── repo/                        # 文件仓库目录（用户配置，.gitignore）
    └── files/                   # 扁平存储 {uuid}.{ext}
```

### 第二部分（新增/修改）
```
smartDoc/
├── package.json                 # 新增 React/Vite/AntD 依赖和脚本
├── src/
│   ├── main/                    # 保持不变
│   ├── preload/                 # 可能微调
│   └── renderer-react/          # 新建 React 项目
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           │   └── ipc.ts       # IPC 调用封装（类型安全）
│           ├── components/
│           │   ├── TagPanel.tsx       # 左侧标签聚合面板
│           │   ├── FileList.tsx       # 中间文档主看板
│           │   ├── FileDetail.tsx     # 右侧详情 Drawer
│           │   ├── SearchBar.tsx      # 顶部搜索栏
│           │   ├── ImportZone.tsx     # 拖拽导入区域
│           │   └── TagChip.tsx        # 标签 Chip 组件
│           └── types/
│               └── index.ts    # TypeScript 类型定义
```

---

# 第一部分：后台功能 + 简略前端

---

### Task 1: 项目初始化与依赖安装

**Files:**
- Modify: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: 更新 package.json**

将 `package.json` 替换为以下内容：

```json
{
  "name": "smartDoc",
  "version": "1.0.0",
  "description": "Windows 桌面文档管理软件",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  },
  "private": true,
  "devDependencies": {
    "electron": "^33.0.0",
    "@electron/rebuild": "^3.6.0"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  }
}
```

- [ ] **Step 2: 更新 .gitignore**

确保 `.gitignore` 包含：

```
node_modules/
repo/
dist/
.superpowers/
```

- [ ] **Step 3: 安装依赖**

```bash
cd E:\code\smartDoc && npm install
```

预期：依赖安装成功，electron-rebuild 重新编译 better-sqlite3。

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: init Electron + better-sqlite3 project"
```

---

### Task 2: 数据库模块

**Files:**
- Create: `src/main/database.js`

- [ ] **Step 1: 实现数据库初始化**

```js
// src/main/database.js
const Database = require('better-sqlite3');
const path = require('path');

let db = null;

function init(dbPath) {
  if (db) return db;

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      ext          TEXT NOT NULL,
      size         INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      note         TEXT DEFAULT '',
      imported_at  TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT DEFAULT '#6366f1',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_tags (
      file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
      tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (file_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS file_opens (
      id        TEXT PRIMARY KEY,
      file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      opened_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_file_opens_file ON file_opens(file_id);
    CREATE INDEX IF NOT EXISTS idx_file_opens_time ON file_opens(opened_at);
    CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
    CREATE INDEX IF NOT EXISTS idx_files_ext ON files(ext);
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call init() first.');
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { init, getDb, close };
```

- [ ] **Step 2: Commit**

```bash
git add src/main/database.js
git commit -m "feat: add SQLite database module with schema"
```

---

### Task 3: 文件仓库模块

**Files:**
- Create: `src/main/file-repo.js`

- [ ] **Step 1: 实现文件仓库操作**

```js
// src/main/file-repo.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 确保仓库目录存在
 */
function ensureRepoDir(repoPath) {
  const filesDir = path.join(repoPath, 'files');
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true });
  }
  return filesDir;
}

/**
 * 计算文件 MD5
 */
function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 检查磁盘剩余空间（字节）
 */
function checkDiskSpace(dirPath) {
  // 使用 fs.statfs 或简单估算
  // Windows 上可用简单方式
  try {
    const stats = fs.statfsSync ? fs.statfsSync(dirPath) : null;
    if (stats) return stats.bsize * stats.bavail;
  } catch (_) {}
  return Infinity; // 无法获取时不阻止
}

/**
 * 复制文件到仓库
 * @returns {{ storagePath: string, md5: string }}
 */
function copyToRepo(sourcePath, repoPath) {
  const filesDir = ensureRepoDir(repoPath);
  const ext = path.extname(sourcePath).toLowerCase();
  const id = crypto.randomUUID();
  const storageName = `${id}${ext}`;
  const destPath = path.join(filesDir, storageName);
  const relativePath = `files/${storageName}`;

  fs.copyFileSync(sourcePath, destPath);

  return { storagePath: relativePath, id };
}

/**
 * 删除仓库中的文件
 */
function deleteFromRepo(storagePath, repoPath) {
  const fullPath = path.join(repoPath, storagePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

/**
 * 批量获取文件信息（用于重复检测）
 */
function getFileStats(filePaths) {
  return filePaths.map(p => {
    const stat = fs.statSync(p);
    return {
      path: p,
      name: path.basename(p),
      ext: path.extname(p).toLowerCase(),
      size: stat.size,
    };
  });
}

module.exports = {
  ensureRepoDir,
  md5File,
  checkDiskSpace,
  copyToRepo,
  deleteFromRepo,
  getFileStats,
};
```

- [ ] **Step 2: 验证 file-repo 模块可独立工作**

在项目根目录临时创建一个测试脚本（不提交）：

```js
// test-repo.js
const { ensureRepoDir, copyToRepo, deleteFromRepo } = require('./src/main/file-repo');
const path = require('path');
const fs = require('fs');

const testRepo = path.join(__dirname, 'test-temp-repo');
const testFile = path.join(__dirname, 'test-temp.txt');
fs.writeFileSync(testFile, 'hello world');

const { storagePath, id } = copyToRepo(testFile, testRepo);
console.log('Copied to:', storagePath, 'id:', id);
console.log('File exists:', fs.existsSync(path.join(testRepo, storagePath)));

deleteFromRepo(storagePath, testRepo);
console.log('Deleted, exists:', fs.existsSync(path.join(testRepo, storagePath)));

// Cleanup
fs.unlinkSync(testFile);
fs.rmdirSync(path.join(testRepo, 'files'));
fs.rmdirSync(testRepo);
console.log('All tests passed!');
```

```bash
node test-repo.js
```

预期输出：`Copied to: files/{uuid}.txt id: ...`、`File exists: true`、`Deleted, exists: false`、`All tests passed!`

删除 `test-repo.js` 和 `test-temp.txt`。

- [ ] **Step 3: Commit**

```bash
git add src/main/file-repo.js
git commit -m "feat: add file repository module (import/delete/duplicate detect)"
```

---

### Task 4: IPC 处理器

**Files:**
- Create: `src/main/ipc-handlers.js`

- [ ] **Step 1: 实现全部 IPC 处理器**

```js
// src/main/ipc-handlers.js
const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./database');
const {
  copyToRepo,
  deleteFromRepo,
  checkDiskSpace,
  getFileStats,
} = require('./file-repo');

let repoPath = null;

function setRepoPath(p) { repoPath = p; }

function registerAllHandlers() {
  if (!repoPath) throw new Error('repoPath not set. Call setRepoPath() first.');
  // ========== 文件操作 ==========

  // file:import — 导入文件
  ipcMain.handle('file:import', async (_event, filePaths) => {
    const db = getDb();
    const results = [];
    const now = new Date().toISOString();

    for (const filePath of filePaths) {
      try {
        const stat = require('fs').statSync(filePath);
        const name = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const size = stat.size;

        // 超大文件确认 (>500MB) — 第一版简化，直接导入
        // 重复检测
        const existing = db.prepare(
          'SELECT id, storage_path FROM files WHERE name = ? AND size = ?'
        ).get(name, size);

        if (existing) {
          results.push({
            path: filePath,
            status: 'duplicate',
            existingId: existing.id,
            name,
          });
          continue;
        }

        // 磁盘空间检查
        const available = checkDiskSpace(repoPath);
        if (size > available) {
          results.push({ path: filePath, status: 'error', error: '磁盘空间不足' });
          continue;
        }

        // 复制到仓库
        const { storagePath, id } = copyToRepo(filePath, repoPath);

        // 写入数据库
        db.prepare(`
          INSERT INTO files (id, name, ext, size, storage_path, imported_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, ext, size, storagePath, now, now);

        results.push({ path: filePath, status: 'imported', id, name, size, ext });
      } catch (err) {
        results.push({ path: filePath, status: 'error', error: err.message });
      }
    }

    return results;
  });

  // file:delete — 删除文件
  ipcMain.handle('file:delete', async (_event, ids) => {
    const db = getDb();
    const deleteStmt = db.prepare('SELECT storage_path FROM files WHERE id = ?');
    const deleteFileStmt = db.prepare('DELETE FROM files WHERE id = ?');

    for (const id of ids) {
      const row = deleteStmt.get(id);
      if (row) {
        deleteFromRepo(row.storage_path, repoPath);
        deleteFileStmt.run(id);
      }
    }
  });

  // file:update — 更新文件信息（备注等）
  ipcMain.handle('file:update', async (_event, id, fields) => {
    const db = getDb();
    const now = new Date().toISOString();

    if (fields.note !== undefined) {
      db.prepare('UPDATE files SET note = ?, updated_at = ? WHERE id = ?')
        .run(fields.note, now, id);
    }

    return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  });

  // file:list — 列出文件（支持筛选条件）
  ipcMain.handle('file:list', async (_event, query = {}) => {
    const db = getDb();
    let sql = 'SELECT * FROM files WHERE 1=1';
    const params = [];

    if (query.ext) {
      sql += ' AND ext = ?';
      params.push(query.ext);
    }
    if (query.exts && query.exts.length > 0) {
      const placeholders = query.exts.map(() => '?').join(',');
      sql += ` AND ext IN (${placeholders})`;
      params.push(...query.exts);
    }
    if (query.tagIds && query.tagIds.length > 0) {
      const placeholders = query.tagIds.map(() => '?').join(',');
      sql += ` AND id IN (
        SELECT file_id FROM file_tags WHERE tag_id IN (${placeholders})
        GROUP BY file_id HAVING COUNT(DISTINCT tag_id) = ?
      )`;
      params.push(...query.tagIds, query.tagIds.length);
    }
    if (query.untagged) {
      sql += ' AND id NOT IN (SELECT file_id FROM file_tags)';
    }
    if (query.ids && query.ids.length > 0) {
      const placeholders = query.ids.map(() => '?').join(',');
      sql += ` AND id IN (${placeholders})`;
      params.push(...query.ids);
    }

    sql += ` ORDER BY ${query.sortBy || 'imported_at'} ${query.sortOrder || 'DESC'}`;

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const files = db.prepare(sql).all(...params);

    // 为每个文件附加标签
    const tagStmt = db.prepare(`
      SELECT t.id, t.name, t.color FROM tags t
      JOIN file_tags ft ON t.id = ft.tag_id
      WHERE ft.file_id = ?
    `);

    return files.map(f => ({
      ...f,
      tags: tagStmt.all(f.id),
    }));
  });

  // file:open — 使用系统默认程序打开文件
  ipcMain.handle('file:open', async (_event, id) => {
    const db = getDb();
    const file = db.prepare('SELECT storage_path FROM files WHERE id = ?').get(id);
    if (!file) throw new Error('文件不存在');
    const fullPath = path.join(repoPath, file.storage_path);

    const fs = require('fs');
    if (!fs.existsSync(fullPath)) {
      throw new Error('FILE_MISSING');
    }

    // 记录打开
    const openId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO file_opens (id, file_id, opened_at) VALUES (?, ?, ?)')
      .run(openId, id, now);

    return shell.openPath(fullPath);
  });

  // file:showInDir — 在资源管理器中定位文件
  ipcMain.handle('file:showInDir', async (_event, id) => {
    const db = getDb();
    const file = db.prepare('SELECT storage_path FROM files WHERE id = ?').get(id);
    if (!file) throw new Error('文件不存在');
    shell.showItemInFolder(path.join(repoPath, file.storage_path));
  });

  // 获取文件详情（含标签、打开次数）
  ipcMain.handle('file:detail', async (_event, id) => {
    const db = getDb();
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (!file) throw new Error('文件不存在');

    const tags = db.prepare(`
      SELECT t.id, t.name, t.color FROM tags t
      JOIN file_tags ft ON t.id = ft.tag_id
      WHERE ft.file_id = ?
    `).all(id);

    const openCount = db.prepare(
      'SELECT COUNT(*) as count FROM file_opens WHERE file_id = ?'
    ).get(id).count;

    return { ...file, tags, openCount };
  });

  // ========== 标签操作 ==========

  // tag:list — 列出所有标签
  ipcMain.handle('tag:list', async () => {
    const db = getDb();
    const tags = db.prepare(`
      SELECT t.*, COUNT(ft.file_id) as file_count
      FROM tags t
      LEFT JOIN file_tags ft ON t.id = ft.tag_id
      GROUP BY t.id
      ORDER BY t.name
    `).all();
    return tags;
  });

  // tag:create — 创建标签
  ipcMain.handle('tag:create', async (_event, name, color) => {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
        .run(id, name, color || '#6366f1', now);
      return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        throw new Error('标签名已存在');
      }
      throw err;
    }
  });

  // tag:delete — 删除标签
  ipcMain.handle('tag:delete', async (_event, id) => {
    const db = getDb();
    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  });

  // tag:update — 更新标签
  ipcMain.handle('tag:update', async (_event, id, fields) => {
    const db = getDb();
    if (fields.name !== undefined) {
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(fields.name, id);
    }
    if (fields.color !== undefined) {
      db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(fields.color, id);
    }
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  });

  // tag:setOnFile — 设置文件的标签
  ipcMain.handle('tag:setOnFile', async (_event, fileId, tagIds) => {
    const db = getDb();
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(fileId);
      const insert = db.prepare('INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)');
      for (const tagId of tagIds) {
        insert.run(fileId, tagId);
      }
    });
    transaction();
  });

  // ========== 搜索 ==========

  // search:files — 搜索文件
  ipcMain.handle('search:files', async (_event, keyword, filters = {}) => {
    const db = getDb();
    if (!keyword || !keyword.trim()) {
      return db.prepare(`
        SELECT f.* FROM files f
        ORDER BY f.imported_at DESC
        LIMIT 50
      `).all().map(attachTags);
    }

    const kw = `%${keyword.trim()}%`;
    const files = db.prepare(`
      SELECT DISTINCT f.* FROM files f
      LEFT JOIN file_tags ft ON f.id = ft.file_id
      LEFT JOIN tags t ON ft.tag_id = t.id
      WHERE f.name LIKE ?
         OR t.name LIKE ?
         OR f.note LIKE ?
      ORDER BY
        CASE
          WHEN f.name = ? THEN 1
          WHEN f.name LIKE ? THEN 2
          WHEN t.name LIKE ? THEN 3
          WHEN f.note LIKE ? THEN 4
          ELSE 5
        END,
        f.imported_at DESC
      LIMIT 100
    `).all(kw, kw, kw, keyword.trim(), kw, kw, kw);

    return files.map(attachTags);
  });

  // search:suggest — 搜索建议
  ipcMain.handle('search:suggest', async (_event, prefix) => {
    const db = getDb();
    const p = `%${prefix}%`;
    const fileNames = db.prepare(
      'SELECT DISTINCT name FROM files WHERE name LIKE ? LIMIT 5'
    ).all(p).map(r => ({ type: 'file', text: r.name }));
    const tagNames = db.prepare(
      'SELECT DISTINCT name FROM tags WHERE name LIKE ? LIMIT 5'
    ).all(p).map(r => ({ type: 'tag', text: r.name }));
    return [...fileNames, ...tagNames];
  });

  // ========== 左侧面板数据 ==========

  // panel:recent — 最近添加
  ipcMain.handle('panel:recent', async (_event, limit = 50) => {
    const db = getDb();
    const files = db.prepare(
      'SELECT * FROM files ORDER BY imported_at DESC LIMIT ?'
    ).all(limit);
    return { files: files.map(attachTags), total: files.length };
  });

  // panel:untagged — 未打标签
  ipcMain.handle('panel:untagged', async () => {
    const db = getDb();
    const files = db.prepare(`
      SELECT f.* FROM files f
      WHERE f.id NOT IN (SELECT file_id FROM file_tags)
      ORDER BY f.imported_at DESC
    `).all();
    return { files: files.map(attachTags), total: files.length };
  });

  // panel:frequent — 常用文档（按打开次数倒序，前20）
  ipcMain.handle('panel:frequent', async () => {
    const db = getDb();
    const files = db.prepare(`
      SELECT f.*, COUNT(fo.id) as open_count
      FROM files f
      JOIN file_opens fo ON f.id = fo.file_id
      GROUP BY f.id
      ORDER BY open_count DESC
      LIMIT 20
    `).all();
    return { files: files.map(f => ({ ...attachTags(f), openCount: f.open_count })), total: files.length };
  });

  // panel:typeCounts — 文件类型计数
  ipcMain.handle('panel:typeCounts', async () => {
    const db = getDb();
    const raw = db.prepare(
      'SELECT ext, COUNT(*) as count FROM files GROUP BY ext ORDER BY count DESC'
    ).all();

    // 归类到五大类别
    const categories = { 'pdf': 0, 'word': 0, 'excel': 0, 'image': 0, 'other': 0 };
    const wordExts = ['.doc', '.docx', '.docm', '.dotx', '.odt', '.rtf'];
    const excelExts = ['.xls', '.xlsx', '.xlsm', '.csv', '.xltx', '.ods'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];

    for (const row of raw) {
      if (row.ext === '.pdf') categories.pdf += row.count;
      else if (excelExts.includes(row.ext)) categories.excel += row.count;
      else if (wordExts.includes(row.ext)) categories.word += row.count;
      else if (imageExts.includes(row.ext)) categories.image += row.count;
      else categories.other += row.count;
    }

    return categories;
  });

  // panel:tagsWithCount — 标签及文件数
  ipcMain.handle('panel:tagsWithCount', async () => {
    const db = getDb();
    return db.prepare(`
      SELECT t.*, COUNT(ft.file_id) as file_count
      FROM tags t
      LEFT JOIN file_tags ft ON t.id = ft.tag_id
      GROUP BY t.id
      ORDER BY t.name
    `).all();
  });

  // 发送事件（导入进度等）
  ipcMain.handle('file:importWithProgress', async (event, filePaths) => {
    // 复用 file:import 逻辑，通过 event.sender.send 通知进度
    // 第一版简化，直接调用 file:import handler
    return ipcMain.emit('file:import', event, filePaths);
  });

  // 打开文件选择对话框
  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '所有文件', extensions: ['*'] }],
    });
    return result.filePaths;
  });
}

// 辅助：为文件附加标签
function attachTags(file) {
  const db = getDb();
  const tags = db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    JOIN file_tags ft ON t.id = ft.tag_id
    WHERE ft.file_id = ?
  `).all(file.id);
  return { ...file, tags };
}

module.exports = { setRepoPath, registerAllHandlers };
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "feat: add all IPC handlers (file/tag/search/panel)"
```

---

### Task 5: Electron 主进程入口

**Files:**
- Create: `src/main/main.js`

- [ ] **Step 1: 实现主进程入口**

```js
// src/main/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { init } = require('./database');
const { setRepoPath, registerAllHandlers } = require('./ipc-handlers');
const { ensureRepoDir } = require('./file-repo');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 开发时打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // 初始化数据库
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'smartdoc.db');
  init(dbPath);

  // 初始化文件仓库
  const repoPath = path.join(app.getPath('documents'), 'smartDoc-repo');
  ensureRepoDir(repoPath);

  // 注册 IPC 处理器（传入 repo 路径）
  setRepoPath(repoPath);
  registerAllHandlers();

  createWindow();
});

app.on('window-all-closed', () => {
  const { close } = require('./database');
  close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/main/main.js
git commit -m "feat: add Electron main process entry"
```

---

### Task 6: Preload 脚本

**Files:**
- Create: `src/preload/preload.js`

- [ ] **Step 1: 实现 preload 脚本**

```js
// src/preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  file: {
    import: (paths) => ipcRenderer.invoke('file:import', paths),
    delete: (ids) => ipcRenderer.invoke('file:delete', ids),
    update: (id, fields) => ipcRenderer.invoke('file:update', id, fields),
    list: (query) => ipcRenderer.invoke('file:list', query),
    open: (id) => ipcRenderer.invoke('file:open', id),
    showInDir: (id) => ipcRenderer.invoke('file:showInDir', id),
    detail: (id) => ipcRenderer.invoke('file:detail', id),
  },
  tag: {
    list: () => ipcRenderer.invoke('tag:list'),
    create: (name, color) => ipcRenderer.invoke('tag:create', name, color),
    delete: (id) => ipcRenderer.invoke('tag:delete', id),
    update: (id, fields) => ipcRenderer.invoke('tag:update', id, fields),
    setOnFile: (fileId, tagIds) => ipcRenderer.invoke('tag:setOnFile', fileId, tagIds),
  },
  search: {
    files: (keyword, filters) => ipcRenderer.invoke('search:files', keyword, filters),
    suggest: (prefix) => ipcRenderer.invoke('search:suggest', prefix),
  },
  panel: {
    recent: (limit) => ipcRenderer.invoke('panel:recent', limit),
    untagged: () => ipcRenderer.invoke('panel:untagged'),
    frequent: () => ipcRenderer.invoke('panel:frequent'),
    typeCounts: () => ipcRenderer.invoke('panel:typeCounts'),
    tagsWithCount: () => ipcRenderer.invoke('panel:tagsWithCount'),
  },
  dialog: {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/preload.js
git commit -m "feat: add preload script with contextBridge API"
```

---

### Task 7: 简略前端 — HTML 页面结构

**Files:**
- Create: `src/renderer/index.html`

- [ ] **Step 1: 创建 HTML 页面**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'">
  <title>smartDoc — 后台功能验证</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <!-- 顶部操作栏 -->
    <header id="header">
      <h1>smartDoc</h1>
      <div id="search-bar">
        <input type="text" id="search-input" placeholder="搜索文件名、标签...">
      </div>
      <div id="header-actions">
        <button id="btn-import">📥 导入文件</button>
      </div>
    </header>

    <div id="main-layout">
      <!-- 左侧面板 -->
      <aside id="left-panel">
        <!-- 快捷筛选 -->
        <section class="panel-section">
          <h3>⚡ 快捷筛选</h3>
          <ul id="quick-filters">
            <li data-filter="recent">🕐 最近添加</li>
            <li data-filter="untagged">🏷️ 未打标签</li>
            <li data-filter="frequent">⭐ 常用文档</li>
          </ul>
        </section>

        <!-- 文件类型 -->
        <section class="panel-section">
          <h3>📑 文件类型</h3>
          <ul id="type-filters">
            <li data-type="pdf">📄 PDF <span class="count">0</span></li>
            <li data-type="word">📝 Word <span class="count">0</span></li>
            <li data-type="excel">📊 Excel <span class="count">0</span></li>
            <li data-type="image">🖼️ 图片 <span class="count">0</span></li>
            <li data-type="other">📦 其他 <span class="count">0</span></li>
          </ul>
        </section>

        <!-- 标签管理 -->
        <section class="panel-section">
          <h3>🏷️ 标签</h3>
          <div id="tag-create">
            <input type="text" id="new-tag-name" placeholder="新标签名">
            <input type="color" id="new-tag-color" value="#6366f1" style="width:30px;height:24px;padding:0;border:none;">
            <button id="btn-create-tag">+</button>
          </div>
          <div id="tag-cloud"></div>
          <div id="selected-tags-bar" style="display:none;">
            已选标签：<span id="selected-tags-list"></span>
            <button id="btn-clear-tags">清除</button>
          </div>
        </section>
      </aside>

      <!-- 中间文件列表 -->
      <main id="file-list-container">
        <div id="file-list-header">
          <span id="current-filter-label">📋 全部文件</span>
          <span id="file-count">0 个文件</span>
        </div>
        <div id="file-list"></div>
      </main>

      <!-- 右侧详情（单击文件后显示） -->
      <aside id="detail-panel" style="display:none;">
        <div id="detail-content">
          <h3 id="detail-name"></h3>
          <p id="detail-meta"></p>
          <div class="detail-section">
            <label>标签</label>
            <div id="detail-tags"></div>
            <select id="detail-add-tag-select" style="display:none;"></select>
            <button id="btn-detail-add-tag">+ 添加标签</button>
          </div>
          <div class="detail-section">
            <label>备注</label>
            <textarea id="detail-note" placeholder="添加备注..."></textarea>
          </div>
          <div class="detail-section">
            <label>文件信息</label>
            <div id="detail-info"></div>
          </div>
          <div class="detail-actions">
            <button id="btn-open-file">打开文件</button>
            <button id="btn-show-in-dir">定位文件</button>
            <button id="btn-delete-file" class="danger">删除</button>
          </div>
        </div>
      </aside>
    </div>

    <!-- 拖拽遮罩 -->
    <div id="drop-overlay" style="display:none;">📥 松开以导入文件</div>

    <!-- Toast 消息 -->
    <div id="toast" style="display:none;"></div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: add minimal frontend HTML structure"
```

---

### Task 8: 简略前端 — CSS 样式

**Files:**
- Create: `src/renderer/style.css`

- [ ] **Step 1: 创建样式文件**

```css
/* src/renderer/style.css */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Microsoft YaHei", sans-serif; font-size: 13px; background: #f5f5f5; color: #333; }
#app { display: flex; flex-direction: column; height: 100vh; }

/* 顶部栏 */
#header {
  display: flex; align-items: center; padding: 8px 16px;
  background: #fff; border-bottom: 1px solid #e0e0e0; gap: 12px;
}
#header h1 { font-size: 18px; color: #6366f1; }
#search-bar { flex: 1; }
#search-bar input { width: 100%; padding: 6px 12px; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 13px; }
button { padding: 5px 12px; border: 1px solid #d0d0d0; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px; }
button:hover { background: #f0f0f0; }
button.primary { background: #6366f1; color: #fff; border-color: #6366f1; }

/* 主布局 */
#main-layout { display: flex; flex: 1; overflow: hidden; }

/* 左侧面板 */
#left-panel {
  width: 220px; background: #fff; border-right: 1px solid #e0e0e0;
  overflow-y: auto; padding: 8px 0; flex-shrink: 0;
}
.panel-section { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
.panel-section h3 { font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 4px; }
.panel-section ul { list-style: none; }
.panel-section li {
  padding: 4px 8px; cursor: pointer; border-radius: 4px; display: flex; justify-content: space-between; font-size: 12px;
}
.panel-section li:hover { background: #f5f0ff; }
.panel-section li.active { background: #ede9fe; color: #6366f1; font-weight: 600; }
.count { color: #999; font-size: 11px; }
#tag-create { display: flex; gap: 4px; margin-bottom: 8px; }
#tag-create input[type="text"] { flex: 1; padding: 3px 6px; border: 1px solid #d0d0d0; border-radius: 3px; font-size: 12px; }
#tag-cloud { display: flex; flex-wrap: wrap; gap: 4px; }
.tag-chip {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: 11px; cursor: pointer; border: 1px solid transparent; user-select: none;
}
.tag-chip.selected { border-width: 2px; font-weight: 600; }
#selected-tags-bar { margin-top: 8px; padding: 6px; background: #f5f5f5; border-radius: 4px; font-size: 11px; }

/* 中间文件列表 */
#file-list-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
#file-list-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; background: #fff; border-bottom: 1px solid #e0e0e0;
}
#file-list { flex: 1; overflow-y: auto; padding: 4px 8px; }
.file-row {
  display: flex; align-items: center; padding: 8px 12px; margin: 1px 0;
  border-radius: 6px; gap: 10px; cursor: pointer;
}
.file-row:nth-child(even) { background: #fafafa; }
.file-row:hover { background: #f0eaff; }
.file-row.selected { background: #ede9fe; }
.file-row.missing { opacity: 0.5; }
.file-icon { font-size: 24px; width: 32px; text-align: center; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-meta { font-size: 11px; color: #999; margin-top: 1px; }
.file-tags { display: flex; gap: 3px; flex-wrap: wrap; max-width: 180px; justify-content: flex-end; }

/* 右侧详情 */
#detail-panel {
  width: 240px; background: #fff; border-left: 1px solid #e0e0e0;
  padding: 16px; overflow-y: auto; flex-shrink: 0; display: flex; flex-direction: column;
}
#detail-panel h3 { font-size: 14px; margin-bottom: 4px; word-break: break-all; }
#detail-meta { font-size: 11px; color: #999; margin-bottom: 12px; }
.detail-section { margin-bottom: 12px; }
.detail-section label { font-size: 10px; color: #999; text-transform: uppercase; display: block; margin-bottom: 4px; }
#detail-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
#detail-note { width: 100%; height: 60px; font-size: 12px; border: 1px solid #e0e0e0; border-radius: 4px; padding: 6px; resize: vertical; }
.detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.detail-actions button.danger { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
.detail-actions button.danger:hover { background: #fee2e2; }
#detail-info { font-size: 11px; color: #999; line-height: 1.6; }

/* 拖拽遮罩 */
#drop-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(99, 102, 241, 0.15); display: flex;
  align-items: center; justify-content: center;
  font-size: 32px; color: #6366f1; z-index: 999; pointer-events: none;
}

/* Toast */
#toast {
  position: fixed; bottom: 24px; right: 24px; padding: 10px 20px;
  background: #333; color: #fff; border-radius: 8px; font-size: 13px; z-index: 1000;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/style.css
git commit -m "feat: add minimal frontend styles"
```

---

### Task 9: 简略前端 — JavaScript 交互逻辑

**Files:**
- Create: `src/renderer/app.js`

- [ ] **Step 1: 创建前端 JS 逻辑**

```js
// src/renderer/app.js
// ========== 状态 ==========
const state = {
  currentFiles: [],
  selectedFileId: null,
  selectedTagIds: [], // Ctrl+多选的标签
  currentFilter: null, // 'recent' | 'untagged' | 'frequent' | null
  allTags: [],
};

// ========== 工具函数 ==========
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
function getFileIcon(ext) {
  const map = { '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.xls': '📊', '.xlsx': '📊',
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.bmp': '🖼️', '.svg': '🖼️',
    '.txt': '📃', '.csv': '📊', '.zip': '📦', '.rar': '📦', '.7z': '📦',
    '.mp3': '🎵', '.mp4': '🎬', '.ppt': '📽️', '.pptx': '📽️' };
  return map[ext] || '📄';
}

// ========== Toast ==========
function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ========== 搜索（debounce 300ms） ==========
let searchTimer = null;
$('#search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 300);
});

async function doSearch() {
  const keyword = $('#search-input').value.trim();
  if (!keyword) { loadAllFiles(); return; }
  const files = await window.api.search.files(keyword);
  state.currentFiles = files;
  renderFileList();
}

// ========== 文件操作 ==========
async function loadAllFiles(query = {}) {
  // 如果有选中的标签，附加标签筛选
  if (state.selectedTagIds.length > 0) {
    query.tagIds = state.selectedTagIds;
  }
  state.currentFiles = await window.api.file.list(query);
  renderFileList();
}

async function handleImport(paths) {
  if (!paths || paths.length === 0) return;
  const results = await window.api.file.import(paths);
  const imported = results.filter(r => r.status === 'imported');
  const dupes = results.filter(r => r.status === 'duplicate');
  const errors = results.filter(r => r.status === 'error');
  let msg = `成功导入 ${imported.length} 个文件`;
  if (dupes.length > 0) msg += `，${dupes.length} 个重复已跳过`;
  if (errors.length > 0) msg += `，${errors.length} 个失败`;
  showToast(msg);
  refreshAll();
}

async function handleOpenFile(id) {
  try {
    await window.api.file.open(id);
  } catch (err) {
    if (err.message === 'FILE_MISSING') {
      showToast('文件丢失，已被外部删除');
    } else {
      showToast('打开失败: ' + err.message);
    }
  }
  refreshAll();
}

async function handleDeleteFile(id) {
  if (!confirm('确定删除此文件？')) return;
  await window.api.file.delete([id]);
  state.selectedFileId = null;
  $('#detail-panel').style.display = 'none';
  showToast('文件已删除');
  refreshAll();
}

async function handleUpdateNote(id, note) {
  await window.api.file.update(id, { note });
}

async function showFileDetail(id) {
  state.selectedFileId = id;
  const detail = await window.api.file.detail(id);
  $('#detail-name').textContent = detail.name;
  $('#detail-meta').textContent = `${detail.ext} · ${formatSize(detail.size)} · 打开 ${detail.openCount} 次`;
  $('#detail-note').value = detail.note || '';

  // 标签
  $('#detail-tags').innerHTML = detail.tags.map(t =>
    `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border-color:${t.color}" onclick="removeTagFromFile('${detail.id}','${t.id}')">${t.name} ✕</span>`
  ).join('');

  // 文件信息
  $('#detail-info').innerHTML = `
    导入：${formatDate(detail.imported_at)}<br>
    路径：${detail.storage_path}<br>
    大小：${formatSize(detail.size)}
  `;

  $('#detail-panel').style.display = 'flex';
  $('#file-list').querySelectorAll('.file-row').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
}

async function removeTagFromFile(fileId, tagId) {
  const detail = await window.api.file.detail(fileId);
  const newTagIds = detail.tags.filter(t => t.id !== tagId).map(t => t.id);
  await window.api.tag.setOnFile(fileId, newTagIds);
  showFileDetail(fileId);
  refreshAll();
}

// ========== 标签操作 ==========
async function loadTags() {
  const tags = await window.api.tag.list();
  state.allTags = tags;
  renderTagCloud();
}

function renderTagCloud() {
  const cloud = $('#tag-cloud');
  cloud.innerHTML = state.allTags.map(t => {
    const selected = state.selectedTagIds.includes(t.id);
    return `<span class="tag-chip ${selected ? 'selected' : ''}"
      style="background:${t.color}20;color:${t.color};${selected ? 'border-color:'+t.color : ''}"
      data-tag-id="${t.id}"
      onclick="toggleTagFilter('${t.id}', event)">
      ${t.name} <small>(${t.file_count})</small>
    </span>`;
  }).join('');
}

function toggleTagFilter(tagId, event) {
  if (event.ctrlKey) {
    // Ctrl+点击：多选模式
    const idx = state.selectedTagIds.indexOf(tagId);
    if (idx >= 0) state.selectedTagIds.splice(idx, 1);
    else state.selectedTagIds.push(tagId);
  } else {
    // 普通点击：单选模式
    if (state.selectedTagIds.length === 1 && state.selectedTagIds[0] === tagId) {
      state.selectedTagIds = [];
    } else {
      state.selectedTagIds = [tagId];
    }
  }

  if (state.selectedTagIds.length > 0) {
    $('#selected-tags-bar').style.display = 'block';
    $('#selected-tags-list').textContent = state.selectedTagIds
      .map(id => state.allTags.find(t => t.id === id)?.name).join(' + ');
  } else {
    $('#selected-tags-bar').style.display = 'none';
  }

  loadAllFiles();
  renderTagCloud();
}

$('#btn-clear-tags').addEventListener('click', () => {
  state.selectedTagIds = [];
  $('#selected-tags-bar').style.display = 'none';
  loadAllFiles();
  renderTagCloud();
});

$('#btn-create-tag').addEventListener('click', async () => {
  const name = $('#new-tag-name').value.trim();
  if (!name) return;
  const color = $('#new-tag-color').value;
  try {
    await window.api.tag.create(name, color);
    $('#new-tag-name').value = '';
    refreshAll();
  } catch (err) {
    showToast(err.message);
  }
});

$('#btn-detail-add-tag').addEventListener('click', async () => {
  const fileId = state.selectedFileId;
  if (!fileId) return;
  const detail = await window.api.file.detail(fileId);
  const existingIds = detail.tags.map(t => t.id);
  const available = state.allTags.filter(t => !existingIds.includes(t.id));

  if (available.length === 0) {
    showToast('没有可添加的标签，请先创建新标签');
    return;
  }

  const tagName = prompt('输入要添加的标签名（或新标签名）:\n已有标签：' + available.map(t => t.name).join(', '));
  if (!tagName) return;

  let tag = state.allTags.find(t => t.name === tagName);
  if (!tag) {
    tag = await window.api.tag.create(tagName, '#6366f1');
  }
  await window.api.tag.setOnFile(fileId, [...existingIds, tag.id]);
  showFileDetail(fileId);
  refreshAll();
});

// ========== 左侧面板筛选 ==========
$('#quick-filters').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;

  state.selectedTagIds = [];
  state.currentFilter = li.dataset.filter;

  let result;
  switch (li.dataset.filter) {
    case 'recent': result = await window.api.panel.recent(50); break;
    case 'untagged': result = await window.api.panel.untagged(); break;
    case 'frequent': result = await window.api.panel.frequent(); break;
  }

  state.currentFiles = result.files;
  renderFileList();
  updateFilterLabel(li.textContent.trim());

  // 高亮当前
  $$('#quick-filters li').forEach(l => l.classList.remove('active'));
  li.classList.add('active');
  $$('#type-filters li').forEach(l => l.classList.remove('active'));
});

$('#type-filters').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;

  state.currentFilter = 'type:' + li.dataset.type;

  const typeMap = {
    pdf: '.pdf',
    word: ['.doc', '.docx', '.docm', '.dotx', '.odt', '.rtf'],
    excel: ['.xls', '.xlsx', '.xlsm', '.csv', '.xltx', '.ods'],
    image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'],
  };

  const exts = typeMap[li.dataset.type];
  if (!exts) { loadAllFiles(); return; }

  if (Array.isArray(exts)) {
    // 多扩展名类型
    const results = await Promise.all(exts.map(ext => window.api.file.list({ ext })));
    state.currentFiles = results.flat();
  } else {
    state.currentFiles = await window.api.file.list({ ext: exts });
  }

  renderFileList();
  updateFilterLabel(li.textContent.trim());

  $$('#quick-filters li').forEach(l => l.classList.remove('active'));
  $$('#type-filters li').forEach(l => l.classList.remove('active'));
  li.classList.add('active');
});

function updateFilterLabel(text) {
  $('#current-filter-label').textContent = text;
}

// ========== 渲染文件列表 ==========
function renderFileList() {
  const container = $('#file-list');
  if (state.currentFiles.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无文件，拖拽文件到此处或点击"导入文件"</div>';
  } else {
    container.innerHTML = state.currentFiles.map(f => `
      <div class="file-row" data-id="${f.id}" onclick="showFileDetail('${f.id}')" ondblclick="handleOpenFile('${f.id}')">
        <div class="file-icon">${getFileIcon(f.ext)}</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(f.name)}</div>
          <div class="file-meta">${formatSize(f.size)} · ${formatDate(f.imported_at)}</div>
        </div>
        <div class="file-tags">
          ${(f.tags || []).map(t => `<span class="tag-chip" style="background:${t.color}20;color:${t.color}">${escapeHtml(t.name)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }
  $('#file-count').textContent = state.currentFiles.length + ' 个文件';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== 详情面板操作 ==========
let noteSaveTimer = null;
$('#detail-note').addEventListener('input', () => {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(async () => {
    if (state.selectedFileId) {
      await handleUpdateNote(state.selectedFileId, $('#detail-note').value);
    }
  }, 500);
});

$('#btn-open-file').addEventListener('click', () => {
  if (state.selectedFileId) handleOpenFile(state.selectedFileId);
});
$('#btn-show-in-dir').addEventListener('click', () => {
  if (state.selectedFileId) window.api.file.showInDir(state.selectedFileId);
});
$('#btn-delete-file').addEventListener('click', () => {
  if (state.selectedFileId) handleDeleteFile(state.selectedFileId);
});

// ========== 导入 ==========
$('#btn-import').addEventListener('click', async () => {
  const paths = await window.api.dialog.openFiles();
  if (paths && paths.length > 0) handleImport(paths);
});

// ========== 拖拽导入 ==========
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  $('#drop-overlay').style.display = 'flex';
});
document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.target === document.documentElement) {
    $('#drop-overlay').style.display = 'none';
  }
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  $('#drop-overlay').style.display = 'none';
  const files = Array.from(e.dataTransfer.files);
  const paths = files.map(f => f.path).filter(Boolean);
  if (paths.length > 0) handleImport(paths);
});

// ========== 刷新全部 ==========
async function refreshAll() {
  await loadTags();
  await loadTypeCounts();

  switch (state.currentFilter) {
    case 'recent': {
      const r = await window.api.panel.recent(50);
      state.currentFiles = r.files;
      break;
    }
    case 'untagged': {
      const r = await window.api.panel.untagged();
      state.currentFiles = r.files;
      break;
    }
    case 'frequent': {
      const r = await window.api.panel.frequent();
      state.currentFiles = r.files;
      break;
    }
    default:
      await loadAllFiles();
  }
  renderFileList();
}

async function loadTypeCounts() {
  const counts = await window.api.panel.typeCounts();
  const map = { pdf: 'pdf', word: 'word', excel: 'excel', image: 'image', other: 'other' };
  for (const [key, liType] of Object.entries(map)) {
    const el = $(`#type-filters [data-type="${liType}"] .count`);
    if (el) el.textContent = counts[key] || 0;
  }
}

// ========== 初始化 ==========
async function init() {
  await refreshAll();
}

init();
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: add minimal frontend JavaScript logic"
```

---

### Task 10: 启动应用验证

- [ ] **Step 1: 启动 Electron 应用**

```bash
cd E:\code\smartDoc && npm start
```

预期：Electron 窗口打开，显示 smartDoc 界面。

- [ ] **Step 2: 验证导入功能**

1. 点击"导入文件"按钮，选择几个测试文件
2. 确认文件出现在列表中
3. 确认文件被复制到 `~/Documents/smartDoc-repo/files/` 目录

- [ ] **Step 3: 验证标签功能**

1. 在左侧面板创建几个标签
2. 单击文件，在右侧详情面板添加标签
3. 确认标签 Chip 出现在文件行和详情面板

- [ ] **Step 4: 验证筛选功能**

1. 点击"最近添加"/"未打标签" — 确认列表正确过滤
2. 点击文件类型分类 — 确认按类型筛选
3. Ctrl+点击标签云中的标签 — 确认交集筛选

- [ ] **Step 5: 验证搜索功能**

1. 在搜索栏输入关键词
2. 确认 300ms 后自动搜索并显示结果

- [ ] **Step 6: 验证文件操作**

1. 双击文件 — 确认用系统默认程序打开
2. 点击"定位文件" — 确认打开资源管理器
3. 修改备注 — 确认自动保存

- [ ] **Step 7: 验证拖拽导入**

1. 从文件管理器拖拽文件到窗口
2. 确认显示导入遮罩
3. 松开后文件导入成功

- [ ] **Step 8: Commit（如有微调）**

```bash
git add -A && git commit -m "feat: complete Part 1 — backend + minimal frontend, verified"
```

---

**第一部分完成。验收检查清单：**

- [ ] 导入文件 → 数据库记录正确，仓库文件存在
- [ ] 创建/删除/编辑标签 → 正常
- [ ] 标签关联文件 → 正常
- [ ] 标签多选交集筛选 → 正常
- [ ] 快捷筛选（最近/未标签/常用） → 数据正确
- [ ] 文件类型分类计数 → 正确
- [ ] 搜索（文件名+标签名+备注） → 结果正确
- [ ] 双击打开文件 → 调用系统程序，打开记录写入 DB
- [ ] 拖拽导入 → 正常
- [ ] 备注编辑 → 自动保存

---

# 第二部分：React + Ant Design 完整前端

---

### Task 11: React 项目搭建

**Files:**
- Modify: `package.json`
- Create: `src/renderer-react/index.html`, `src/renderer-react/vite.config.ts`, `src/renderer-react/tsconfig.json`, `src/renderer-react/tsconfig.node.json`

- [ ] **Step 1: 更新 package.json 添加 React 依赖**

将 `package.json` 更新为以下内容（新增 devDependencies 中的 Vite/React/TypeScript 相关，dependencies 中新增 antd/icons）：

```json
{
  "name": "smartDoc",
  "version": "1.0.0",
  "description": "Windows 桌面文档管理软件",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "dev": "concurrently \"cd src/renderer-react && npx vite --port 5173\" \"wait-on http://localhost:5173 && electron . --dev\"",
    "build": "cd src/renderer-react && npx vite build",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  },
  "private": true,
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.0.0",
    "electron": "^33.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "wait-on": "^8.0.0"
  },
  "dependencies": {
    "@ant-design/icons": "^5.5.0",
    "antd": "^5.22.0",
    "better-sqlite3": "^11.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: 安装新依赖**

```bash
cd E:\code\smartDoc && npm install
```

- [ ] **Step 3: 创建 index.html**

```html
<!-- src/renderer-react/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>smartDoc</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: 创建 vite.config.ts**

```ts
// src/renderer-react/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 5: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/renderer-react/
git commit -m "chore: scaffold React + Vite + TypeScript + Ant Design project"
```

---

### Task 12: TypeScript 类型定义

**Files:**
- Create: `src/renderer-react/src/types/index.ts`

- [ ] **Step 1: 定义类型**

```ts
// src/renderer-react/src/types/index.ts

export interface FileInfo {
  id: string;
  name: string;
  ext: string;
  size: number;
  storage_path: string;
  note: string;
  imported_at: string;
  updated_at: string;
  tags: TagInfo[];
  openCount?: number;
}

export interface TagInfo {
  id: string;
  name: string;
  color: string;
  created_at?: string;
  file_count?: number;
}

export interface FileDetail extends FileInfo {
  openCount: number;
}

export interface ImportResult {
  path: string;
  status: 'imported' | 'duplicate' | 'error';
  id?: string;
  name?: string;
  size?: number;
  ext?: string;
  existingId?: string;
  error?: string;
}

export interface TypeCounts {
  pdf: number;
  word: number;
  excel: number;
  image: number;
  other: number;
}

export interface PanelResult {
  files: FileInfo[];
  total: number;
}

export interface SearchSuggestion {
  type: 'file' | 'tag';
  text: string;
}

export interface FileListQuery {
  ext?: string;
  exts?: string[];
  tagIds?: string[];
  untagged?: boolean;
  ids?: string[];
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
}

// Window API 类型声明
declare global {
  interface Window {
    api: {
      file: {
        import: (paths: string[]) => Promise<ImportResult[]>;
        delete: (ids: string[]) => Promise<void>;
        update: (id: string, fields: { note?: string }) => Promise<FileInfo>;
        list: (query?: FileListQuery) => Promise<FileInfo[]>;
        open: (id: string) => Promise<void>;
        showInDir: (id: string) => Promise<void>;
        detail: (id: string) => Promise<FileDetail>;
      };
      tag: {
        list: () => Promise<TagInfo[]>;
        create: (name: string, color?: string) => Promise<TagInfo>;
        delete: (id: string) => Promise<void>;
        update: (id: string, fields: { name?: string; color?: string }) => Promise<TagInfo>;
        setOnFile: (fileId: string, tagIds: string[]) => Promise<void>;
      };
      search: {
        files: (keyword: string, filters?: Record<string, unknown>) => Promise<FileInfo[]>;
        suggest: (prefix: string) => Promise<SearchSuggestion[]>;
      };
      panel: {
        recent: (limit?: number) => Promise<PanelResult>;
        untagged: () => Promise<PanelResult>;
        frequent: () => Promise<PanelResult>;
        typeCounts: () => Promise<TypeCounts>;
        tagsWithCount: () => Promise<TagInfo[]>;
      };
      dialog: {
        openFiles: () => Promise<string[]>;
      };
    };
  }
}

export {};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/types/index.ts
git commit -m "feat: add TypeScript type definitions and window.api declaration"
```

---

### Task 13: IPC 调用封装与 App 入口

**Files:**
- Create: `src/renderer-react/src/api/ipc.ts`
- Create: `src/renderer-react/src/main.tsx`
- Create: `src/renderer-react/src/App.tsx`

- [ ] **Step 1: API 封装**

```ts
// src/renderer-react/src/api/ipc.ts
import type { FileInfo, FileDetail, TagInfo, ImportResult, TypeCounts, PanelResult, SearchSuggestion, FileListQuery } from '@/types';

export const fileApi = {
  import: (paths: string[]): Promise<ImportResult[]> => window.api.file.import(paths),
  delete: (ids: string[]): Promise<void> => window.api.file.delete(ids),
  update: (id: string, fields: { note?: string }): Promise<FileInfo> => window.api.file.update(id, fields),
  list: (query?: FileListQuery): Promise<FileInfo[]> => window.api.file.list(query),
  open: (id: string): Promise<void> => window.api.file.open(id),
  showInDir: (id: string): Promise<void> => window.api.file.showInDir(id),
  detail: (id: string): Promise<FileDetail> => window.api.file.detail(id),
};

export const tagApi = {
  list: (): Promise<TagInfo[]> => window.api.tag.list(),
  create: (name: string, color?: string): Promise<TagInfo> => window.api.tag.create(name, color),
  delete: (id: string): Promise<void> => window.api.tag.delete(id),
  update: (id: string, fields: { name?: string; color?: string }): Promise<TagInfo> => window.api.tag.update(id, fields),
  setOnFile: (fileId: string, tagIds: string[]): Promise<void> => window.api.tag.setOnFile(fileId, tagIds),
};

export const searchApi = {
  files: (keyword: string): Promise<FileInfo[]> => window.api.search.files(keyword),
  suggest: (prefix: string): Promise<SearchSuggestion[]> => window.api.search.suggest(prefix),
};

export const panelApi = {
  recent: (limit = 50): Promise<PanelResult> => window.api.panel.recent(limit),
  untagged: (): Promise<PanelResult> => window.api.panel.untagged(),
  frequent: (): Promise<PanelResult> => window.api.panel.frequent(),
  typeCounts: (): Promise<TypeCounts> => window.api.panel.typeCounts(),
  tagsWithCount: (): Promise<TagInfo[]> => window.api.panel.tagsWithCount(),
};

export const dialogApi = {
  openFiles: (): Promise<string[]> => window.api.dialog.openFiles(),
};
```

- [ ] **Step 2: main.tsx 入口**

```tsx
// src/renderer-react/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          borderRadius: 6,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 3: App.tsx 骨架**

```tsx
// src/renderer-react/src/App.tsx
import { useState, useCallback, useEffect } from 'react';
import { Layout, message } from 'antd';
import type { FileInfo, TagInfo, TypeCounts } from '@/types';
import SearchBar from '@/components/SearchBar';
import TagPanel from '@/components/TagPanel';
import FileList from '@/components/FileList';
import FileDetail from '@/components/FileDetail';
import ImportZone from '@/components/ImportZone';
import { fileApi, tagApi, panelApi } from '@/api/ipc';

const { Header, Sider, Content } = Layout;

type FilterType = 'all' | 'recent' | 'untagged' | 'frequent' | 'type';

export default function App() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [typeCounts, setTypeCounts] = useState<TypeCounts>({ pdf: 0, word: 0, excel: 0, image: 0, other: 0 });
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentFilter, setCurrentFilter] = useState<FilterType>('all');
  const [currentTypeExts, setCurrentTypeExts] = useState<string[] | null>(null);
  const [currentTypeKey, setCurrentTypeKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refreshFiles = useCallback(async () => {
    let result: FileInfo[];
    if (searchKeyword) {
      result = await searchApi.files(searchKeyword);
    } else if (selectedTagIds.length > 0) {
      result = await fileApi.list({ tagIds: selectedTagIds });
    } else if (currentFilter === 'recent') {
      result = (await panelApi.recent(50)).files;
    } else if (currentFilter === 'untagged') {
      result = (await panelApi.untagged()).files;
    } else if (currentFilter === 'frequent') {
      result = (await panelApi.frequent()).files;
    } else if (currentFilter === 'type' && currentTypeExts) {
      result = await fileApi.list({ exts: currentTypeExts });
    } else {
      result = await fileApi.list({});
    }
    setFiles(result);
  }, [searchKeyword, selectedTagIds, currentFilter, currentTypeExts]);

  const refreshAll = useCallback(async () => {
    await refreshFiles();
    const [tagsData, counts] = await Promise.all([
      panelApi.tagsWithCount(),
      panelApi.typeCounts(),
    ]);
    setTags(tagsData);
    setTypeCounts(counts);
  }, [refreshFiles]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const handleFileClick = async (id: string) => {
    setSelectedFileId(id);
    setDrawerOpen(true);
  };

  const handleFileDoubleClick = async (id: string) => {
    try {
      await fileApi.open(id);
      refreshAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '打开失败';
      if (msg.includes('FILE_MISSING')) {
        message.warning('文件丢失，已被外部删除');
      } else {
        message.error('打开失败: ' + msg);
      }
    }
  };

  const handleImport = async (paths: string[]) => {
    if (!paths.length) return;
    const results = await fileApi.import(paths);
    const imported = results.filter(r => r.status === 'imported');
    const dupes = results.filter(r => r.status === 'duplicate');
    const errors = results.filter(r => r.status === 'error');
    let msg = `成功导入 ${imported.length} 个文件`;
    if (dupes.length) msg += `，${dupes.length} 个重复已跳过`;
    if (errors.length) msg += `，${errors.length} 个失败`;
    message.success(msg);
    refreshAll();
  };

  return (
    <ImportZone onImport={handleImport}>
      <Layout style={{ height: '100vh' }}>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1', whiteSpace: 'nowrap' }}>smartDoc</div>
          <SearchBar
            onSearch={(kw) => setSearchKeyword(kw)}
            fileCount={files.length}
            onImport={() => dialogApi.openFiles().then(handleImport)}
          />
        </Header>
        <Layout>
          <Sider width={240} style={{ background: '#fff', borderRight: '1px solid #f0f0f0', overflow: 'auto' }}>
            <TagPanel
              tags={tags}
              typeCounts={typeCounts}
              selectedTagIds={selectedTagIds}
              currentFilter={currentFilter}
              currentTypeFilter={currentTypeKey}
              onSelectTags={(ids) => { setSelectedTagIds(ids); setCurrentFilter('all'); setSearchKeyword(''); }}
              onSelectFilter={(filter) => { setCurrentFilter(filter); setSelectedTagIds([]); setSearchKeyword(''); }}
              onSelectType={(typeKey, exts) => { setCurrentTypeKey(typeKey); setCurrentTypeExts(exts); setCurrentFilter('type'); setSelectedTagIds([]); setSearchKeyword(''); }}
              onTagCreated={refreshAll}
            />
          </Sider>
          <Content style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <FileList
              files={files}
              selectedFileId={selectedFileId}
              onFileClick={handleFileClick}
              onFileDoubleClick={handleFileDoubleClick}
              selectedTagIds={selectedTagIds}
              onRemoveTagFilter={(tagId) => setSelectedTagIds(prev => prev.filter(id => id !== tagId))}
            />
          </Content>
        </Layout>
        <FileDetail
          fileId={selectedFileId}
          open={drawerOpen}
          allTags={tags}
          onClose={() => { setDrawerOpen(false); setSelectedFileId(null); }}
          onUpdated={refreshAll}
        />
      </Layout>
    </ImportZone>
  );
}
```

- [ ] **Step 4: 创建基础全局样式**

```css
/* src/renderer-react/src/index.css */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif; }
#root { height: 100vh; }
```

- [ ] **Step 5: 更新主进程以支持 dev 模式加载 Vite**

修改 `src/main/main.js` 中 `createWindow` 函数——当 `--dev` 参数传入时加载 Vite dev server：

```js
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer-react', 'dist', 'index.html'));
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer-react/src/api/ src/renderer-react/src/main.tsx src/renderer-react/src/App.tsx src/renderer-react/src/index.css src/main/main.js
git commit -m "feat: add React app skeleton, IPC API layer, and dev mode support"
```

---

### Task 14: SearchBar 组件

**Files:**
- Create: `src/renderer-react/src/components/SearchBar.tsx`

- [ ] **Step 1: 实现 SearchBar**

```tsx
// src/renderer-react/src/components/SearchBar.tsx
import { Input, Button } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  onSearch: (keyword: string) => void;
  fileCount: number;
  onImport: () => void;
}

export default function SearchBar({ onSearch, fileCount, onImport }: SearchBarProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value.trim());
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [value, onSearch]);

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Input
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="搜索文件名、标签..."
        value={value}
        onChange={e => setValue(e.target.value)}
        allowClear
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>
        共 {fileCount} 个文件
      </span>
      <Button type="primary" icon={<PlusOutlined />} onClick={onImport}>
        导入文件
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/SearchBar.tsx
git commit -m "feat: add SearchBar component with debounce"
```

---

### Task 15: TagPanel 组件

**Files:**
- Create: `src/renderer-react/src/components/TagPanel.tsx`

- [ ] **Step 1: 实现左侧标签聚合面板**

```tsx
// src/renderer-react/src/components/TagPanel.tsx
import { useState } from 'react';
import { Input, Button, Tag, Divider, Space, ColorPicker, message } from 'antd';
import {
  ClockCircleOutlined, TagsOutlined, StarOutlined,
  FilePdfOutlined, FileExcelOutlined, FileWordOutlined,
  FileImageOutlined, FileOutlined, PlusOutlined,
} from '@ant-design/icons';
import type { TagInfo, TypeCounts } from '@/types';
import { tagApi } from '@/api/ipc';

interface TagPanelProps {
  tags: TagInfo[];
  typeCounts: TypeCounts;
  selectedTagIds: string[];
  currentFilter: string;
  currentTypeFilter: string | null;
  onSelectTags: (ids: string[]) => void;
  onSelectFilter: (filter: string) => void;
  onSelectType: (typeKey: string, exts: string[]) => void;
  onTagCreated: () => void;
}

const MENU_STYLE: React.CSSProperties = {
  padding: '4px 16px', cursor: 'pointer', display: 'flex',
  alignItems: 'center', gap: 8, fontSize: 13, borderRadius: 6,
};
const MENU_ACTIVE: React.CSSProperties = {
  ...MENU_STYLE, background: '#ede9fe', color: '#6366f1', fontWeight: 600,
};
const SECTION_HEADER: React.CSSProperties = {
  padding: '12px 16px 4px', fontSize: 11, color: '#999',
  textTransform: 'uppercase', fontWeight: 600,
};

export default function TagPanel({
  tags, typeCounts, selectedTagIds, currentFilter, currentTypeFilter,
  onSelectTags, onSelectFilter, onSelectType, onTagCreated,
}: TagPanelProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      await tagApi.create(name, newTagColor);
      setNewTagName('');
      message.success(`标签"${name}"已创建`);
      onTagCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败';
      message.error(msg);
    }
  };

  const handleTagClick = (tagId: string, e: React.MouseEvent) => {
    if (e.ctrlKey) {
      const idx = selectedTagIds.indexOf(tagId);
      onSelectTags(idx >= 0 ? selectedTagIds.filter(id => id !== tagId) : [...selectedTagIds, tagId]);
    } else {
      onSelectTags(selectedTagIds.length === 1 && selectedTagIds[0] === tagId ? [] : [tagId]);
    }
  };

  const WORD_EXTS = ['.doc', '.docx', '.docm', '.dotx', '.odt', '.rtf'];
  const EXCEL_EXTS = ['.xls', '.xlsx', '.xlsm', '.csv', '.xltx', '.ods'];
  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];

  const typeItems = [
    { key: '.pdf', exts: ['.pdf'], icon: <FilePdfOutlined />, label: 'PDF', count: typeCounts.pdf },
    { key: 'word', exts: WORD_EXTS, icon: <FileWordOutlined />, label: 'Word', count: typeCounts.word },
    { key: 'excel', exts: EXCEL_EXTS, icon: <FileExcelOutlined />, label: 'Excel', count: typeCounts.excel },
    { key: 'image', exts: IMAGE_EXTS, icon: <FileImageOutlined />, label: '图片', count: typeCounts.image },
    { key: 'other', exts: ['__other__'], icon: <FileOutlined />, label: '其他', count: typeCounts.other },
  ];

  return (
    <div style={{ padding: '4px 0' }}>
      {/* 快捷筛选 */}
      <div style={SECTION_HEADER}>⚡ 快捷筛选</div>
      <div
        style={currentFilter === 'recent' ? MENU_ACTIVE : MENU_STYLE}
        onClick={() => onSelectFilter('recent')}
      >
        <ClockCircleOutlined /> 最近添加
      </div>
      <div
        style={currentFilter === 'untagged' ? MENU_ACTIVE : MENU_STYLE}
        onClick={() => onSelectFilter('untagged')}
      >
        <TagsOutlined /> 未打标签
      </div>
      <div
        style={currentFilter === 'frequent' ? MENU_ACTIVE : MENU_STYLE}
        onClick={() => onSelectFilter('frequent')}
      >
        <StarOutlined /> 常用文档
      </div>

      <Divider style={{ margin: '8px 0' }} />

      {/* 文件类型 */}
      <div style={SECTION_HEADER}>📑 文件类型</div>
      {typeItems.map(item => (
        <div
          key={item.key}
          style={currentFilter === 'type' && currentTypeFilter === item.key ? MENU_ACTIVE : MENU_STYLE}
          onClick={() => onSelectType(item.key, item.exts)}
        >
          {item.icon}
          <span style={{ flex: 1 }}>{item.label}</span>
          <span style={{ fontSize: 11, color: '#999' }}>{item.count}</span>
        </div>
      ))}

      <Divider style={{ margin: '8px 0' }} />

      {/* 标签云 */}
      <div style={SECTION_HEADER}>🏷️ 标签云</div>
      <div style={{ padding: '4px 16px', display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {tags.map(tag => {
          const selected = selectedTagIds.includes(tag.id);
          return (
            <Tag
              key={tag.id}
              color={tag.color}
              style={{
                cursor: 'pointer', margin: 0, fontSize: 12,
                border: selected ? `2px solid ${tag.color}` : '1px solid transparent',
                fontWeight: selected ? 600 : 400,
              }}
              onClick={(e) => handleTagClick(tag.id, e)}
            >
              {tag.name} ({tag.file_count})
            </Tag>
          );
        })}
      </div>
      <div style={{ padding: '0 16px', fontSize: 11, color: '#999', marginBottom: 8 }}>
        💡 Ctrl+点击 多选标签，交集筛选
      </div>

      {/* 创建标签 */}
      <div style={{ padding: '0 16px', display: 'flex', gap: 4 }}>
        <Input
          size="small"
          placeholder="新标签名"
          value={newTagName}
          onChange={e => setNewTagName(e.target.value)}
          onPressEnter={handleCreateTag}
          style={{ flex: 1 }}
        />
        <ColorPicker
          value={newTagColor}
          onChange={(_, hex) => setNewTagColor(hex)}
          size="small"
        />
        <Button size="small" icon={<PlusOutlined />} onClick={handleCreateTag} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/TagPanel.tsx
git commit -m "feat: add TagPanel component with filters and tag cloud"
```

---

### Task 16: FileList 组件

**Files:**
- Create: `src/renderer-react/src/components/FileList.tsx`

- [ ] **Step 1: 实现文档主看板**

```tsx
// src/renderer-react/src/components/FileList.tsx
import { Tag } from 'antd';
import {
  FilePdfOutlined, FileExcelOutlined, FileWordOutlined,
  FileImageOutlined, FileTextOutlined, FileOutlined,
} from '@ant-design/icons';
import type { FileInfo } from '@/types';

interface FileListProps {
  files: FileInfo[];
  selectedFileId: string | null;
  onFileClick: (id: string) => void;
  onFileDoubleClick: (id: string) => void;
  selectedTagIds: string[];
  onRemoveTagFilter: (tagId: string) => void;
}

function getIcon(ext: string) {
  const style = { fontSize: 24 };
  switch (ext) {
    case '.pdf': return <FilePdfOutlined style={{ ...style, color: '#ef4444' }} />;
    case '.doc': case '.docx': case '.docm': case '.rtf': case '.odt':
      return <FileWordOutlined style={{ ...style, color: '#3b82f6' }} />;
    case '.xls': case '.xlsx': case '.xlsm': case '.csv': case '.ods':
      return <FileExcelOutlined style={{ ...style, color: '#10b981' }} />;
    case '.jpg': case '.jpeg': case '.png': case '.gif': case '.bmp': case '.svg': case '.webp':
      return <FileImageOutlined style={{ ...style, color: '#f59e0b' }} />;
    case '.txt': return <FileTextOutlined style={{ ...style, color: '#6b7280' }} />;
    default: return <FileOutlined style={{ ...style, color: '#6b7280' }} />;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12,
  cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
};
const ROW_EVEN: React.CSSProperties = { ...ROW_STYLE, background: '#fafafa' };
const ROW_SELECTED: React.CSSProperties = { ...ROW_STYLE, background: '#ede9fe' };

export default function FileList({
  files, selectedFileId, onFileClick, onFileDoubleClick,
  selectedTagIds, onRemoveTagFilter,
}: FileListProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 筛选标签栏 */}
      {selectedTagIds.length > 0 && (
        <div style={{
          padding: '6px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ color: '#999' }}>当前筛选：</span>
          {selectedTagIds.map(tid => (
            <Tag key={tid} closable onClose={() => onRemoveTagFilter(tid)}>{tid}</Tag>
          ))}
          <span style={{ marginLeft: 'auto', color: '#999' }}>{files.length} 个结果</span>
        </div>
      )}

      {/* 列表 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            暂无文件，拖拽文件到此处或点击"导入文件"
          </div>
        ) : (
          files.map((f, i) => {
            const isSelected = f.id === selectedFileId;
            const isEven = i % 2 === 1;
            let rowStyle = ROW_STYLE;
            if (isSelected) rowStyle = ROW_SELECTED;
            else if (isEven) rowStyle = ROW_EVEN;

            return (
              <div
                key={f.id}
                style={rowStyle}
                onClick={() => onFileClick(f.id)}
                onDoubleClick={() => onFileDoubleClick(f.id)}
              >
                <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                  {getIcon(f.ext)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {formatSize(f.size)} · {formatDate(f.imported_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 220, justifyContent: 'flex-end' }}>
                  {(f.tags || []).map(t => (
                    <Tag key={t.id} color={t.color} style={{ margin: 0, fontSize: 11 }}>
                      {t.name}
                    </Tag>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/FileList.tsx
git commit -m "feat: add FileList component with file list rendering"
```

---

### Task 17: FileDetail 组件

**Files:**
- Create: `src/renderer-react/src/components/FileDetail.tsx`

- [ ] **Step 1: 实现右侧详情 Drawer**

```tsx
// src/renderer-react/src/components/FileDetail.tsx
import { useState, useEffect, useCallback } from 'react';
import { Drawer, Tag, Button, Input, Space, message, Select, Divider } from 'antd';
import { EditOutlined, FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import type { FileDetail as FileDetailType, TagInfo } from '@/types';
import { fileApi, tagApi } from '@/api/ipc';

interface FileDetailProps {
  fileId: string | null;
  open: boolean;
  allTags: TagInfo[];
  onClose: () => void;
  onUpdated: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function FileDetail({ fileId, open, allTags, onClose, onUpdated }: FileDetailProps) {
  const [detail, setDetail] = useState<FileDetailType | null>(null);
  const [note, setNote] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!fileId) return;
    try {
      const d = await fileApi.detail(fileId);
      setDetail(d);
      setNote(d.note || '');
    } catch {
      message.error('加载文件详情失败');
    }
  }, [fileId]);

  useEffect(() => { if (open) loadDetail(); }, [open, loadDetail]);

  const handleNoteSave = async () => {
    if (!detail) return;
    await fileApi.update(detail.id, { note });
    message.success('备注已保存');
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!detail) return;
    const newIds = detail.tags.filter(t => t.id !== tagId).map(t => t.id);
    await tagApi.setOnFile(detail.id, newIds);
    loadDetail();
    onUpdated();
  };

  const handleAddTag = async (tagId: string) => {
    if (!detail) return;
    const newIds = [...detail.tags.map(t => t.id), tagId];
    await tagApi.setOnFile(detail.id, newIds);
    loadDetail();
    onUpdated();
    setAddingTag(false);
  };

  const handleCreateAndAddTag = async (name: string) => {
    if (!detail || !name.trim()) return;
    try {
      const tag = await tagApi.create(name.trim());
      const newIds = [...detail.tags.map(t => t.id), tag.id];
      await tagApi.setOnFile(detail.id, newIds);
      loadDetail();
      onUpdated();
      setAddingTag(false);
      message.success(`标签"${name}"已创建并添加`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      message.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    await fileApi.delete([detail.id]);
    message.success('文件已删除');
    onClose();
    onUpdated();
  };

  if (!detail) return null;

  const availableTags = allTags.filter(t => !detail.tags.some(dt => dt.id === t.id));

  return (
    <Drawer
      title={detail.name}
      open={open}
      onClose={onClose}
      width={300}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
        {detail.ext} · {formatSize(detail.size)} · 打开 {detail.openCount} 次
      </div>

      {/* 标签 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>标签</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {detail.tags.map(t => (
            <Tag key={t.id} color={t.color} closable onClose={() => handleRemoveTag(t.id)}>
              {t.name}
            </Tag>
          ))}
        </div>
        {!addingTag ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => setAddingTag(true)}>
            添加标签
          </Button>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              size="small"
              style={{ width: '100%' }}
              placeholder="选择已有标签..."
              options={availableTags.map(t => ({ label: t.name, value: t.id }))}
              onChange={(val) => handleAddTag(val)}
            />
            <Input.Search
              size="small"
              placeholder="或输入新标签名创建..."
              enterButton="创建"
              onSearch={handleCreateAndAddTag}
            />
            <Button size="small" onClick={() => setAddingTag(false)}>取消</Button>
          </Space>
        )}
      </div>

      {/* 备注 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>备注</div>
        <Input.TextArea
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={handleNoteSave}
          placeholder="添加备注..."
          rows={3}
        />
      </div>

      <Divider />

      {/* 文件信息 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>文件信息</div>
        <div style={{ fontSize: 11, color: '#999', lineHeight: 1.8 }}>
          导入：{formatDate(detail.imported_at)}<br />
          路径：{detail.storage_path}<br />
          大小：{formatSize(detail.size)}
        </div>
      </div>

      {/* 操作按钮 */}
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button
          block
          icon={<FolderOpenOutlined />}
          onClick={() => fileApi.open(detail.id).then(() => onUpdated())}
        >
          打开文件
        </Button>
        <Button
          block
          onClick={() => fileApi.showInDir(detail.id)}
        >
          在文件夹中显示
        </Button>
        <Button
          block
          danger
          icon={<DeleteOutlined />}
          onClick={handleDelete}
        >
          删除文件
        </Button>
      </Space>
    </Drawer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/FileDetail.tsx
git commit -m "feat: add FileDetail Drawer component"
```

---

### Task 18: ImportZone 拖拽导入组件

**Files:**
- Create: `src/renderer-react/src/components/ImportZone.tsx`

- [ ] **Step 1: 实现拖拽导入区域**

```tsx
// src/renderer-react/src/components/ImportZone.tsx
import { useState, useCallback, type DragEvent, type ReactNode } from 'react';

interface ImportZoneProps {
  onImport: (paths: string[]) => void;
  children: ReactNode;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(99, 102, 241, 0.12)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  fontSize: 28, color: '#6366f1', zIndex: 9999,
  pointerEvents: 'none', userSelect: 'none',
};

export default function ImportZone({ onImport, children }: ImportZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === e.currentTarget) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map(f => (f as unknown as { path?: string }).path).filter(Boolean) as string[];
    if (paths.length > 0) {
      onImport(paths);
    }
  }, [onImport]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ height: '100vh' }}
    >
      {children}
      {dragging && (
        <div style={overlayStyle}>
          📥 松开以导入文件
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/ImportZone.tsx
git commit -m "feat: add ImportZone drag-and-drop import component"
```

---

### Task 19: 整合验证与样式微调

- [ ] **Step 1: 启动 React 开发模式**

```bash
cd E:\code\smartDoc && npm run dev
```

预期：
1. Vite 在 localhost:5173 启动
2. Electron 窗口打开，加载 React 页面
3. 显示 smartDoc 完整 UI

- [ ] **Step 2: 验证全部功能**

逐一验证：
1. **导入文件** — 点击"导入文件"按钮 / 拖拽文件到窗口
2. **文件列表** — 文件正确显示，图标、大小、日期、标签 Chip
3. **搜索** — 输入关键词，300ms 后自动搜索
4. **左侧面板** — 快捷筛选（最近/未标签/常用）/ 类型分类 / 标签云多选
5. **标签操作** — 创建标签、添加标签到文件、移除标签
6. **文件详情** — 单击文件弹出 Drawer
7. **打开文件** — 双击文件 / Drawer 中"打开文件"
8. **备注编辑** — 失焦自动保存
9. **删除文件** — Drawer 中"删除文件"
10. **拖拽导入** — 拖拽显示遮罩，松手导入

- [ ] **Step 3: 修复样式不一致问题**

检查并修复：
- 确保文件列表行高一致
- 确保标签 Chip 颜色与标签设置一致
- 确保 Drawer 宽度与设计一致（240px 内容）
- 确保交替行背景色生效
- 确保当前筛选标签栏可正常移除

- [ ] **Step 4: 验证错误处理**

1. 尝试打开已被外部删除的文件 → 应提示"文件丢失"
2. 创建重名标签 → 应提示"标签名已存在"
3. 导入超大文件 → 应正常处理

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: complete Part 2 — React + Ant Design full UI, verified"
```

---

## 验收总结

### 第一部分验收

| 验收项 | 验证方法 |
|--------|---------|
| 数据库初始化 | 启动应用，检查 `%APPDATA%/smartdoc/smartdoc.db` 存在且包含 4 张表 |
| 文件导入 | 拖拽/按钮导入文件，数据库中 files 表有记录，仓库 `files/{uuid}.ext` 存在 |
| 标签 CRUD | 创建/编辑/删除标签，`tags` 表正确 |
| 标签关联 | 文件关联/取消标签，`file_tags` 表正确 |
| 多选筛选 | Ctrl+点击多个标签，列表显示同时拥有这些标签的文件 |
| 快捷筛选 | 最近/未标签/常用 筛选结果正确 |
| 类型分类 | 计数正确，点击筛选正确 |
| 搜索 | 文件名/标签名/备注搜索正确 |
| 打开文件 | 双击调用系统程序，`file_opens` 表新增记录 |
| 文件丢失 | 外部删除仓库文件后，列表中打开提示"文件丢失" |
| 备注保存 | 修改备注后 `files` 表更新 |

### 第二部分验收

| 验收项 | 验证方法 |
|--------|---------|
| UI 布局一致性 | 对照设计文档第 4 节，布局吻合 |
| Ant Design 组件 | 全部 UI 使用 antd 组件，无原生 HTML 表单 |
| 图标使用 | 文件类型图标和操作图标使用 @ant-design/icons |
| 交互细节 | 单击→Drawer，双击→打开文件，拖拽→遮罩→导入 |
| 第一部分全功能 | 在 React UI 中复验第一部分的全部后台功能 |
