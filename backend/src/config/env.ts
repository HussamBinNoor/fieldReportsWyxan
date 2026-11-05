import fs from 'node:fs';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 5_000_000;

export type AppConfig = {
  port: number;
  host: string;
  nodeEnv: string;
  dbPath: string;
  uploadDir: string;
  tempDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const root = env.DATA_ROOT || path.resolve(process.cwd(), 'data');
  return {
    port: Number(env.PORT || 4000),
    host: env.HOST || '0.0.0.0',
    nodeEnv,
    dbPath: env.DB_PATH || path.join(root, 'field-reports.db'),
    uploadDir: env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
    tempDir: env.TEMP_DIR || path.join(root, 'tmp'),
  };
}

export function ensureConfigDirectories(config: AppConfig): void {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.mkdirSync(config.tempDir, { recursive: true });
}
