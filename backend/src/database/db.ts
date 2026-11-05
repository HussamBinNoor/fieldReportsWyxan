import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type ReportRow = {
  client_report_id: string;
  idempotency_key: string;
  description: string;
  status: 'incomplete' | 'complete';
  created_at: string;
  completed_at: string | null;
};

export type ImageRow = {
  report_id: string;
  image_id: string;
  checksum: string;
  mime_type: string;
  size_bytes: number;
  storage_name: string;
  created_at: string;
};

export function openDatabase(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      client_report_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('incomplete', 'complete')),
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS images (
      report_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      checksum TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5000000),
      storage_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (report_id, image_id),
      FOREIGN KEY (report_id) REFERENCES reports(client_report_id)
    );
  `);
  return db;
}
