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
