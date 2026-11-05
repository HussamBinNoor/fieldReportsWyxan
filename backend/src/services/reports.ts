import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { MAX_IMAGE_BYTES } from '../config/env';
import type { ImageRow, ReportRow } from '../database/db';
import { hashFile, removeQuietly, safeJoin } from '../utils/files';
import { HttpError } from '../utils/httpError';

export type PublicImage = {
  id: string;
  checksum: string;
  mimeType: string;
  sizeBytes: number;
};

export type PublicReport = {
  id: string;
  description: string;
  status: 'incomplete' | 'complete';
  idempotencyKey: string;
  createdAt: string;
  completedAt: string | null;
  images: PublicImage[];
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export function detectImage(buffer: Buffer): { mimeType: string; extension: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= png.length && buffer.subarray(0, png.length).equals(png)) {
    return { mimeType: 'image/png', extension: '.png' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }
  return null;
}

function toPublicImage(row: ImageRow): PublicImage {
  return {
    id: row.image_id,
    checksum: row.checksum,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
  };
}

function loadImages(db: Database, reportId: string): ImageRow[] {
  return db
    .prepare(
      `SELECT report_id, image_id, checksum, mime_type, size_bytes, storage_name, created_at
       FROM images WHERE report_id = ? ORDER BY created_at ASC`,
    )
    .all(reportId) as ImageRow[];
}

export function toPublicReport(db: Database, row: ReportRow): PublicReport {
  return {
    id: row.client_report_id,
    description: row.description,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    images: loadImages(db, row.client_report_id).map(toPublicImage),
  };
}

function findReport(db: Database, reportId: string): ReportRow | undefined {
  return db.prepare('SELECT * FROM reports WHERE client_report_id = ?').get(reportId) as
    | ReportRow
    | undefined;
}

function ensureReportShell(db: Database, reportId: string, now: string): void {
  db.prepare(
    `INSERT INTO reports (client_report_id, idempotency_key, description, status, created_at, completed_at)
     VALUES (?, ?, '', 'incomplete', ?, NULL)
     ON CONFLICT(client_report_id) DO NOTHING`,
  ).run(reportId, reportId, now);
}

export async function storeImage(input: {
  db: Database;
  uploadDir: string;
  reportId: string;
  imageId: string;
  tempPath: string;
  claimedChecksum: string;
}): Promise<{ report: PublicReport; duplicate: boolean }> {
  const header = Buffer.alloc(16);
  const handle = await fs.promises.open(input.tempPath, 'r');
  try {
    await handle.read(header, 0, 16, 0);
  } finally {
    await handle.close();
  }
  const detected = detectImage(header);
  if (!detected) {
    await removeQuietly(input.tempPath);
    throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Only JPEG, PNG, and WebP photos can be uploaded.');
  }

  const stat = await fs.promises.stat(input.tempPath);
  if (stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) {
    await removeQuietly(input.tempPath);
    throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Images must be 5000000 bytes or smaller.');
  }

  const checksum = await hashFile(input.tempPath);
  if (!input.claimedChecksum || input.claimedChecksum.toLowerCase() !== checksum) {
    await removeQuietly(input.tempPath);
    throw new HttpError(400, 'CHECKSUM_MISMATCH', 'The photo checksum does not match the uploaded file.');
  }

  const now = new Date().toISOString();
  const storageName = `${input.imageId}${detected.extension}`;
  const destination = safeJoin(input.uploadDir, input.reportId, storageName);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  const existing = input.db
    .prepare('SELECT * FROM images WHERE report_id = ? AND image_id = ?')
    .get(input.reportId, input.imageId) as ImageRow | undefined;

  if (existing) {
    await removeQuietly(input.tempPath);
    if (existing.checksum !== checksum) {
      throw new HttpError(
        409,
        'CHECKSUM_MISMATCH',
        'This photo id was already stored with different contents.',
      );
    }
    const report = findReport(input.db, input.reportId);
    if (!report) {
      throw new HttpError(500, 'REPORT_MISSING', 'The stored photo has no report.');
    }
    return { report: toPublicReport(input.db, report), duplicate: true };
  }

  await fs.promises.rename(input.tempPath, destination);

  try {
    const write = input.db.transaction(() => {
      ensureReportShell(input.db, input.reportId, now);
      input.db
        .prepare(
          `INSERT INTO images (
             report_id, image_id, checksum, mime_type, size_bytes, storage_name, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.reportId,
          input.imageId,
          checksum,
          detected.mimeType,
          stat.size,
          storageName,
          now,
        );
    });
    write();
  } catch (error) {
    const raced = input.db
      .prepare('SELECT * FROM images WHERE report_id = ? AND image_id = ?')
      .get(input.reportId, input.imageId) as ImageRow | undefined;
    if (raced && raced.checksum === checksum) {
      const report = findReport(input.db, input.reportId);
      if (!report) {
        throw new HttpError(500, 'REPORT_MISSING', 'The stored photo has no report.');
      }
      return { report: toPublicReport(input.db, report), duplicate: true };
    }
    await removeQuietly(destination);
    throw error;
  }

  const report = findReport(input.db, input.reportId);
  if (!report) {
    throw new HttpError(500, 'REPORT_MISSING', 'The report could not be saved.');
  }
  return { report: toPublicReport(input.db, report), duplicate: false };
}

export function finalizeReport(input: {
  db: Database;
  reportId: string;
  description: string;
  imageIds: string[];
  idempotencyKey: string;
}): PublicReport {
  const description = input.description.trim();
  if (!description) {
    throw new HttpError(400, 'INVALID_DESCRIPTION', 'Enter a description before uploading the report.');
  }
  if (input.idempotencyKey !== input.reportId) {
    throw new HttpError(400, 'INVALID_ID', 'The idempotency key does not match the report id.');
  }
  if (input.imageIds.length < 1 || input.imageIds.length > 5) {
    throw new HttpError(400, 'INVALID_IMAGE_SET', 'A report must include between 1 and 5 photos.');
  }

  const existing = findReport(input.db, input.reportId);
  if (existing?.status === 'complete') {
    return toPublicReport(input.db, existing);
  }

  const stored = loadImages(input.db, input.reportId);
  const storedIds = new Set(stored.map(image => image.image_id));
  const missing = input.imageIds.filter(id => !storedIds.has(id));
  if (missing.length > 0 || stored.length < input.imageIds.length) {
    throw new HttpError(409, 'INCOMPLETE_IMAGES', 'The server has not received every photo yet.', {
      missingImageIds: missing,
    });
  }

  const now = new Date().toISOString();
  const commit = input.db.transaction(() => {
    if (!existing) {
      input.db
        .prepare(
          `INSERT INTO reports (client_report_id, idempotency_key, description, status, created_at, completed_at)
           VALUES (?, ?, ?, 'complete', ?, ?)`,
        )
        .run(input.reportId, input.idempotencyKey, description, now, now);
    } else {
      input.db
        .prepare(
          `UPDATE reports
           SET description = ?, status = 'complete', completed_at = ?, idempotency_key = ?
           WHERE client_report_id = ? AND status = 'incomplete'`,
        )
        .run(description, now, input.idempotencyKey, input.reportId);
    }
    return findReport(input.db, input.reportId);
  });
  const complete = commit();

  if (!complete || complete.status !== 'complete') {
    const current = findReport(input.db, input.reportId);
    if (current?.status === 'complete') {
      return toPublicReport(input.db, current);
    }
    throw new HttpError(500, 'FINALIZE_FAILED', 'The report could not be completed.');
  }
  return toPublicReport(input.db, complete);
}

export function listCompleted(db: Database): PublicReport[] {
  const rows = db
    .prepare(`SELECT * FROM reports WHERE status = 'complete' ORDER BY completed_at DESC`)
    .all() as ReportRow[];
  return rows.map(row => toPublicReport(db, row));
}

export function getReport(db: Database, reportId: string): PublicReport | null {
  const row = findReport(db, reportId);
  return row ? toPublicReport(db, row) : null;
}

export function imageFile(db: Database, uploadDir: string, reportId: string, imageId: string): {
  filePath: string;
  mimeType: string;
} {
  const row = db
    .prepare('SELECT * FROM images WHERE report_id = ? AND image_id = ?')
    .get(reportId, imageId) as ImageRow | undefined;
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'That photo is not on the server.');
  }
  const extension = MIME_TO_EXT[row.mime_type];
  if (!extension) {
    throw new HttpError(415, 'UNSUPPORTED_TYPE', 'The stored photo type is not supported.');
  }
  return {
    filePath: safeJoin(uploadDir, reportId, `${imageId}${extension}`),
    mimeType: row.mime_type,
  };
}

export function summary(db: Database): {
  completedReports: number;
  images: number;
  largestImageBytes: number;
  allImagesWithinLimit: boolean;
} {
  const reports = db
    .prepare(`SELECT COUNT(*) AS total FROM reports WHERE status = 'complete'`)
    .get() as { total: number };
  const images = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(size_bytes), 0) AS largest
       FROM images
       WHERE report_id IN (SELECT client_report_id FROM reports WHERE status = 'complete')`,
    )
    .get() as { total: number; largest: number };
  return {
    completedReports: reports.total,
    images: images.total,
    largestImageBytes: images.largest,
    allImagesWithinLimit: images.largest <= MAX_IMAGE_BYTES,
  };
}
