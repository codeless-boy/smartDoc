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
