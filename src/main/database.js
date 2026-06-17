// src/main/database.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = null;

async function init(filePath) {
  if (db) return db;

  dbPath = filePath;
  const SQL = await initSqlJs();

  // 如果已有数据库文件，加载它；否则创建新数据库
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 添加 better-sqlite3 兼容层
  patchDatabase(SQL, db);

  // 启用 WAL 模式和外键约束
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // 创建表结构
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      ext          TEXT NOT NULL,
      size         INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      note         TEXT DEFAULT '',
      imported_at  TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT DEFAULT '#6366f1',
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS file_tags (
      file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
      tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (file_id, tag_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS file_opens (
      id        TEXT PRIMARY KEY,
      file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      opened_at TEXT NOT NULL
    )
  `);

  // sql.js 不支持 CREATE INDEX IF NOT EXISTS，用 try-catch
  try { db.run('CREATE INDEX idx_file_opens_file ON file_opens(file_id)'); } catch (_) {}
  try { db.run('CREATE INDEX idx_file_opens_time ON file_opens(opened_at)'); } catch (_) {}
  try { db.run('CREATE INDEX idx_files_name ON files(name)'); } catch (_) {}
  try { db.run('CREATE INDEX idx_files_ext ON files(ext)'); } catch (_) {}

  // 定期保存到磁盘（每30秒）
  setInterval(saveToDisk, 30000);

  return db;
}

/**
 * 给 sql.js Database 实例添加 better-sqlite3 兼容方法
 */
function patchDatabase(SQL, _db) {
  // db.prepare(sql) -> StmtWrapper { get, all, run, bind }
  const origPrepare = _db.prepare.bind(_db);
  const origRun = _db.run.bind(_db);

  _db.prepare = function (sql) {
    const stmt = origPrepare(sql);
    return new StmtWrapper(stmt, sql);
  };

  // db.transaction(fn) - 兼容层
  _db.transaction = function (fn) {
    return function (...args) {
      origRun('BEGIN');
      try {
        fn.apply(this, args);
        origRun('COMMIT');
      } catch (e) {
        origRun('ROLLBACK');
        throw e;
      }
    };
  };
}

/**
 * Statement 包装器，提供 better-sqlite3 兼容的 .get()/.all()/.run() 接口
 */
class StmtWrapper {
  constructor(stmt, sql) {
    this._stmt = stmt;
    this._sql = sql;
  }

  get(...params) {
    this._stmt.bind(params);
    if (this._stmt.step()) {
      const cols = this._stmt.getColumnNames();
      const vals = this._stmt.get();
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      this._stmt.free();
      return row;
    }
    this._stmt.free();
    return undefined;
  }

  all(...params) {
    if (params.length > 0) {
      this._stmt.bind(params.flat());
    }
    const cols = this._stmt.getColumnNames();
    const rows = [];
    while (this._stmt.step()) {
      const vals = this._stmt.get();
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      rows.push(row);
    }
    this._stmt.free();
    return rows;
  }

  run(...params) {
    // 为 sql.js 生成正确的 SQL 执行
    // this._stmt 已经被 prepare 了，但 sql.js 不能直接 execute prepared statement with params
    // 所以直接通过 db.run 执行
    if (params.length > 0) {
      // 用原始 SQL 重新执行
      this._stmt.free();
      // 返回一个带有 changes 属性的对象
      db.run(this._sql, params);
      return { changes: db.getRowsModified() };
    }
    // 无参数时，step 执行
    this._stmt.step();
    const changes = db.getRowsModified();
    this._stmt.free();
    return { changes };
  }
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call init() first.');
  return db;
}

function saveToDisk() {
  if (db && dbPath) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (err) {
      console.error('Failed to save database:', err.message);
    }
  }
}

function close() {
  if (db) {
    saveToDisk();
    db.close();
    db = null;
  }
}

module.exports = { init, getDb, close };
