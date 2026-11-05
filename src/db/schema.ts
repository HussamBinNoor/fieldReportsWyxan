export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    upload_progress INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    uploaded_at INTEGER,
    idempotency_key TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS report_images (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    local_uri TEXT NOT NULL,
    original_size INTEGER NOT NULL,
    compressed_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    checksum TEXT NOT NULL,
    upload_status TEXT NOT NULL,
    server_image_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS upload_jobs (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    locked_at INTEGER,
    lock_owner TEXT,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_jobs_status_next ON upload_jobs(status, next_attempt_at)',
  'CREATE INDEX IF NOT EXISTS idx_images_report ON report_images(report_id, created_at)',
];
