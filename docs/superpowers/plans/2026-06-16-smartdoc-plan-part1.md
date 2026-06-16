# smartDoc 实施计划 — 第一部分：后台功能 + 简略前端

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现全部后台功能（SQLite、文件仓库、IPC），前端用原生 HTML/CSS/JS 做极简交互界面验证后台功能。

**Architecture:** Electron 主进程负责 SQLite 操作和文件管理，通过 IPC 与渲染进程通信。渲染进程使用原生 HTML/CSS/JS，无框架依赖。

**Tech Stack:** Electron, better-sqlite3, Node.js (crypto/uuid/fs/path)

**依赖关系:** 本部分独立，不依赖第二部分。完成后进入第二部分（React 前端替换）。

---

## 文件结构

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
└── repo/                        # 文件仓库目录（运行时创建，.gitignore）
    └── files/                   # 扁平存储 {uuid}.{ext}
```

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
  try {
    const stats = fs.statfsSync ? fs.statfsSync(dirPath) : null;
    if (stats) return stats.bsize * stats.bavail;
  } catch (_) {}
  return Infinity;
}

/**
 * 复制文件到仓库
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

- [ ] **Step 2: 验证 file-repo 模块**

在项目根目录临时创建测试脚本（不提交）：

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
} = require('./file-repo');

let repoPath = null;

function setRepoPath(p) { repoPath = p; }

function registerAllHandlers() {
  if (!repoPath) throw new Error('repoPath not set. Call setRepoPath() first.');

  // ========== 文件操作 ==========

  // file:import
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

  // file:delete
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

  // file:update
  ipcMain.handle('file:update', async (_event, id, fields) => {
    const db = getDb();
    const now = new Date().toISOString();

    if (fields.note !== undefined) {
      db.prepare('UPDATE files SET note = ?, updated_at = ? WHERE id = ?')
        .run(fields.note, now, id);
    }

    return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  });

  // file:list（支持 ext/exts/tagIds/untagged/ids 筛选）
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

  // file:open
  ipcMain.handle('file:open', async (_event, id) => {
    const db = getDb();
    const file = db.prepare('SELECT storage_path FROM files WHERE id = ?').get(id);
    if (!file) throw new Error('文件不存在');
    const fullPath = path.join(repoPath, file.storage_path);

    const fs = require('fs');
    if (!fs.existsSync(fullPath)) {
      throw new Error('FILE_MISSING');
    }

    const openId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO file_opens (id, file_id, opened_at) VALUES (?, ?, ?)')
      .run(openId, id, now);

    return shell.openPath(fullPath);
  });

  // file:showInDir
  ipcMain.handle('file:showInDir', async (_event, id) => {
    const db = getDb();
    const file = db.prepare('SELECT storage_path FROM files WHERE id = ?').get(id);
    if (!file) throw new Error('文件不存在');
    shell.showItemInFolder(path.join(repoPath, file.storage_path));
  });

  // file:detail
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

  // tag:list
  ipcMain.handle('tag:list', async () => {
    const db = getDb();
    return db.prepare(`
      SELECT t.*, COUNT(ft.file_id) as file_count
      FROM tags t
      LEFT JOIN file_tags ft ON t.id = ft.tag_id
      GROUP BY t.id
      ORDER BY t.name
    `).all();
  });

  // tag:create
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

  // tag:delete
  ipcMain.handle('tag:delete', async (_event, id) => {
    const db = getDb();
    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  });

  // tag:update
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

  // tag:setOnFile
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

  // search:files
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

  // search:suggest
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

  // panel:recent
  ipcMain.handle('panel:recent', async (_event, limit = 50) => {
    const db = getDb();
    const files = db.prepare(
      'SELECT * FROM files ORDER BY imported_at DESC LIMIT ?'
    ).all(limit);
    return { files: files.map(attachTags), total: files.length };
  });

  // panel:untagged
  ipcMain.handle('panel:untagged', async () => {
    const db = getDb();
    const files = db.prepare(`
      SELECT f.* FROM files f
      WHERE f.id NOT IN (SELECT file_id FROM file_tags)
      ORDER BY f.imported_at DESC
    `).all();
    return { files: files.map(attachTags), total: files.length };
  });

  // panel:frequent
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

  // panel:typeCounts
  ipcMain.handle('panel:typeCounts', async () => {
    const db = getDb();
    const raw = db.prepare(
      'SELECT ext, COUNT(*) as count FROM files GROUP BY ext ORDER BY count DESC'
    ).all();

    const categories = { pdf: 0, word: 0, excel: 0, image: 0, other: 0 };
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

  // panel:tagsWithCount
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

  // dialog:openFiles
  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '所有文件', extensions: ['*'] }],
    });
    return result.filePaths;
  });
}

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

  // 注册 IPC 处理器
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
        <section class="panel-section">
          <h3>⚡ 快捷筛选</h3>
          <ul id="quick-filters">
            <li data-filter="recent">🕐 最近添加</li>
            <li data-filter="untagged">🏷️ 未打标签</li>
            <li data-filter="frequent">⭐ 常用文档</li>
          </ul>
        </section>

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

      <!-- 右侧详情 -->
      <aside id="detail-panel" style="display:none;">
        <div id="detail-content">
          <h3 id="detail-name"></h3>
          <p id="detail-meta"></p>
          <div class="detail-section">
            <label>标签</label>
            <div id="detail-tags"></div>
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

    <div id="drop-overlay" style="display:none;">📥 松开以导入文件</div>
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

#header {
  display: flex; align-items: center; padding: 8px 16px;
  background: #fff; border-bottom: 1px solid #e0e0e0; gap: 12px;
}
#header h1 { font-size: 18px; color: #6366f1; }
#search-bar { flex: 1; }
#search-bar input { width: 100%; padding: 6px 12px; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 13px; }
button { padding: 5px 12px; border: 1px solid #d0d0d0; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px; }
button:hover { background: #f0f0f0; }

#main-layout { display: flex; flex: 1; overflow: hidden; }

#left-panel {
  width: 220px; background: #fff; border-right: 1px solid #e0e0e0;
  overflow-y: auto; padding: 8px 0; flex-shrink: 0;
}
.panel-section { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
.panel-section h3 { font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 4px; }
.panel-section ul { list-style: none; }
.panel-section li {
  padding: 4px 8px; cursor: pointer; border-radius: 4px; display: flex;
  justify-content: space-between; font-size: 12px;
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
.file-icon { font-size: 24px; width: 32px; text-align: center; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-meta { font-size: 11px; color: #999; margin-top: 1px; }
.file-tags { display: flex; gap: 3px; flex-wrap: wrap; max-width: 180px; justify-content: flex-end; }

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

#drop-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(99, 102, 241, 0.15); display: flex;
  align-items: center; justify-content: center;
  font-size: 32px; color: #6366f1; z-index: 999; pointer-events: none;
}
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
  selectedTagIds: [],
  currentFilter: null,
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

  $('#detail-tags').innerHTML = detail.tags.map(t =>
    `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border-color:${t.color}" onclick="removeTagFromFile('${detail.id}','${t.id}')">${t.name} ✕</span>`
  ).join('');

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
    const idx = state.selectedTagIds.indexOf(tagId);
    if (idx >= 0) state.selectedTagIds.splice(idx, 1);
    else state.selectedTagIds.push(tagId);
  } else {
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

  $$('#quick-filters li').forEach(l => l.classList.remove('active'));
  li.classList.add('active');
  $$('#type-filters li').forEach(l => l.classList.remove('active'));
});

$('#type-filters').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;

  state.currentFilter = 'type:' + li.dataset.type;

  const typeMap = {
    pdf: ['.pdf'],
    word: ['.doc', '.docx', '.docm', '.dotx', '.odt', '.rtf'],
    excel: ['.xls', '.xlsx', '.xlsm', '.csv', '.xltx', '.ods'],
    image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'],
  };

  const exts = typeMap[li.dataset.type];
  if (exts) {
    state.currentFiles = await window.api.file.list({ exts });
  } else {
    state.currentFiles = await window.api.file.list({});
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

## 第一部分验收检查清单

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
