import type { Scalar } from '@op-engineering/op-sqlite';
import type {
  ImageRecord,
  ImageStatus,
  JobStatus,
  NewReportDraft,
  ReportRecord,
  ReportStatus,
} from '../domain/types';
import { getDatabase } from './database';
import type { UploadStore } from '../upload/types';

const REPORT_STATUSES: ReportStatus[] = [
  'saved',
  'waiting_connection',
  'uploading',
  'interrupted',
  'failed',
  'uploaded',
];

const IMAGE_STATUSES: ImageStatus[] = ['pending', 'uploading', 'uploaded', 'failed'];
const JOB_STATUSES: JobStatus[] = ['pending', 'uploading', 'interrupted', 'blocked', 'done'];

function asString(value: Scalar | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  return String(value);
}

function asNumber(value: Scalar | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return Number(value);
  }
  return 0;
}

function asNullableString(value: Scalar | undefined): string | null {
  if (value == null) {
    return null;
  }
  return asString(value);
}

function asNullableNumber(value: Scalar | undefined): number | null {
  if (value == null) {
    return null;
  }
  return asNumber(value);
}

function expectOne<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Unexpected ${label}: ${value}`);
}

function mapReport(row: Record<string, Scalar>): ReportRecord {
  return {
    id: asString(row.id),
    description: asString(row.description),
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
    status: expectOne(asString(row.status), REPORT_STATUSES, 'report status'),
    uploadProgress: asNumber(row.upload_progress),
    retryCount: asNumber(row.retry_count),
    nextRetryAt: asNumber(row.next_retry_at),
    lastError: asNullableString(row.last_error),
    uploadedAt: asNullableNumber(row.uploaded_at),
    idempotencyKey: asString(row.idempotency_key),
  };
}

function mapImage(row: Record<string, Scalar>): ImageRecord {
  return {
    id: asString(row.id),
    reportId: asString(row.report_id),
    localUri: asString(row.local_uri),
    originalSize: asNumber(row.original_size),
    compressedSize: asNumber(row.compressed_size),
    mimeType: asString(row.mime_type),
    checksum: asString(row.checksum),
    uploadStatus: expectOne(asString(row.upload_status), IMAGE_STATUSES, 'image status'),
    serverImageId: asNullableString(row.server_image_id),
    retryCount: asNumber(row.retry_count),
    lastError: asNullableString(row.last_error),
    width: asNumber(row.width),
    height: asNumber(row.height),
    createdAt: asNumber(row.created_at),
  };
}

export type ReportWithImages = ReportRecord & { images: ImageRecord[] };

export class SqliteUploadStore implements UploadStore {
  async recoverForeignLocks(bootId: string, now: number): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `UPDATE reports
       SET status = 'interrupted', updated_at = ?
       WHERE status = 'uploading'
         AND id IN (
           SELECT report_id FROM upload_jobs
           WHERE status = 'uploading' AND IFNULL(lock_owner, '') != ?
         )`,
      [now, bootId],
    );
    await db.execute(
      `UPDATE upload_jobs
       SET status = 'interrupted', locked_at = NULL, lock_owner = NULL, updated_at = ?
       WHERE status = 'uploading' AND IFNULL(lock_owner, '') != ?`,
      [now, bootId],
    );
  }

  async listEligibleJobs(now: number) {
    const result = await getDatabase().execute(
      `SELECT * FROM upload_jobs
       WHERE status IN ('pending', 'interrupted') AND next_attempt_at <= ?
       ORDER BY created_at ASC`,
      [now],
    );
    return result.rows.map(row => ({
      id: asString(row.id),
      reportId: asString(row.report_id),
      status: expectOne(asString(row.status), JOB_STATUSES, 'job status'),
      attemptCount: asNumber(row.attempt_count),
      nextAttemptAt: asNumber(row.next_attempt_at),
      lockedAt: asNullableNumber(row.locked_at),
      lockOwner: asNullableString(row.lock_owner),
      lastError: asNullableString(row.last_error),
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at),
    }));
  }

  async tryLockJob(jobId: string, bootId: string, now: number): Promise<boolean> {
    const db = getDatabase();
    const updated = await db.execute(
      `UPDATE upload_jobs
       SET status = 'uploading', locked_at = ?, lock_owner = ?, updated_at = ?
       WHERE id = ?
         AND status IN ('pending', 'interrupted')
         AND next_attempt_at <= ?`,
      [now, bootId, now, jobId, now],
    );
    if (updated.rowsAffected !== 1) {
      return false;
    }
    const job = await this.getJob(jobId);
    if (!job) {
      return false;
    }
    await db.execute(
      `UPDATE reports
       SET status = 'uploading', updated_at = ?
       WHERE id = ? AND status != 'uploaded' AND status != 'failed'`,
      [now, job.reportId],
    );
    return true;
  }

  async releaseAbandonedLock(jobId: string, bootId: string, now: number): Promise<void> {
    const db = getDatabase();
    const updated = await db.execute(
      `UPDATE upload_jobs
       SET status = 'interrupted', locked_at = NULL, lock_owner = NULL, updated_at = ?
       WHERE id = ? AND lock_owner = ? AND status = 'uploading'`,
      [now, jobId, bootId],
    );
    if (updated.rowsAffected !== 1) {
      return;
    }
    const job = await this.getJob(jobId);
    if (!job) {
      return;
    }
    await db.execute(
      `UPDATE reports SET status = 'interrupted', updated_at = ?
       WHERE id = ? AND status = 'uploading'`,
      [now, job.reportId],
    );
  }

  async stillOwnsLock(jobId: string, bootId: string): Promise<boolean> {
    const result = await getDatabase().execute(
      `SELECT id FROM upload_jobs WHERE id = ? AND status = 'uploading' AND lock_owner = ?`,
      [jobId, bootId],
    );
    return result.rows.length === 1;
  }

  async getReport(reportId: string): Promise<ReportRecord | null> {
    const result = await getDatabase().execute('SELECT * FROM reports WHERE id = ?', [reportId]);
    const row = result.rows[0];
    return row ? mapReport(row) : null;
  }

  async listImages(reportId: string): Promise<ImageRecord[]> {
    const result = await getDatabase().execute(
      'SELECT * FROM report_images WHERE report_id = ? ORDER BY created_at ASC',
      [reportId],
    );
    return result.rows.map(mapImage);
  }

  async markImageUploading(imageId: string, _now: number): Promise<void> {
    await getDatabase().execute(
      `UPDATE report_images SET upload_status = 'uploading' WHERE id = ?`,
      [imageId],
    );
  }

  async markImageUploaded(imageId: string, serverImageId: string, _now: number): Promise<void> {
    await getDatabase().execute(
      `UPDATE report_images
       SET upload_status = 'uploaded', server_image_id = ?, last_error = NULL
       WHERE id = ?`,
      [serverImageId, imageId],
    );
  }

  async markImageError(imageId: string, error: string, status: ImageStatus, _now: number): Promise<void> {
    await getDatabase().execute(
      `UPDATE report_images
       SET upload_status = ?, last_error = ?, retry_count = retry_count + 1
       WHERE id = ?`,
      [status, error, imageId],
    );
  }

  async markReportProgress(
    reportId: string,
    progress: number,
    status: ReportStatus,
    now: number,
  ): Promise<void> {
    await getDatabase().execute(
      `UPDATE reports
       SET upload_progress = ?, status = ?, updated_at = ?
       WHERE id = ? AND status != 'uploaded'`,
      [progress, status, now, reportId],
    );
  }

  async scheduleRetry(input: {
    jobId: string;
    reportId: string;
    attemptCount: number;
    nextAttemptAt: number;
    error: string;
    reportStatus: ReportStatus;
    now: number;
  }): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `UPDATE upload_jobs
       SET status = 'interrupted',
           attempt_count = ?,
           next_attempt_at = ?,
           last_error = ?,
           lock_owner = NULL,
           locked_at = NULL,
           updated_at = ?
       WHERE id = ? AND status != 'done' AND status != 'blocked'`,
      [input.attemptCount, input.nextAttemptAt, input.error, input.now, input.jobId],
    );
    await db.execute(
      `UPDATE reports
       SET status = ?, retry_count = ?, next_retry_at = ?, last_error = ?, updated_at = ?
       WHERE id = ? AND status != 'uploaded'`,
      [
        input.reportStatus,
        input.attemptCount,
        input.nextAttemptAt,
        input.error,
        input.now,
        input.reportId,
      ],
    );
  }

  async markUploaded(reportId: string, jobId: string, now: number): Promise<void> {
    const db = getDatabase();
    await db.transaction(async tx => {
      await tx.execute(
        `UPDATE reports
         SET status = 'uploaded', upload_progress = 100, uploaded_at = ?, last_error = NULL, updated_at = ?
         WHERE id = ?`,
        [now, now, reportId],
      );
      await tx.execute(
        `UPDATE upload_jobs
         SET status = 'done', lock_owner = NULL, locked_at = NULL, last_error = NULL, updated_at = ?
         WHERE id = ?`,
        [now, jobId],
      );
      await tx.execute(
        `UPDATE report_images
         SET upload_status = 'uploaded',
             server_image_id = COALESCE(server_image_id, id),
             last_error = NULL
         WHERE report_id = ?`,
        [reportId],
      );
    });
  }

  async markBlocked(reportId: string, jobId: string, error: string, now: number): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `UPDATE reports SET status = 'failed', last_error = ?, updated_at = ?
       WHERE id = ? AND status != 'uploaded'`,
      [error, now, reportId],
    );
    await db.execute(
      `UPDATE upload_jobs
       SET status = 'blocked', last_error = ?, lock_owner = NULL, locked_at = NULL, updated_at = ?
       WHERE id = ?`,
      [error, now, jobId],
    );
  }

  async markWaitingForConnection(now: number): Promise<void> {
    await getDatabase().execute(
      `UPDATE reports
       SET status = 'waiting_connection', updated_at = ?
       WHERE status IN ('saved', 'interrupted')
         AND id IN (
           SELECT report_id FROM upload_jobs WHERE status IN ('pending', 'interrupted')
         )`,
      [now],
    );
  }

  async soonestFutureAttempt(now: number): Promise<number | null> {
    const result = await getDatabase().execute(
      `SELECT MIN(next_attempt_at) AS next_at
       FROM upload_jobs
       WHERE status IN ('pending', 'interrupted') AND next_attempt_at > ?`,
      [now],
    );
    const value = result.rows[0]?.next_at;
    if (value == null) {
      return null;
    }
    return asNumber(value);
  }

  async createReport(draft: NewReportDraft): Promise<void> {
    const db = getDatabase();
    const description = draft.description.trim();
    await db.transaction(async tx => {
      await tx.execute(
        `INSERT INTO reports (
           id, description, created_at, updated_at, status, upload_progress,
           retry_count, next_retry_at, last_error, uploaded_at, idempotency_key
         ) VALUES (?, ?, ?, ?, 'saved', 0, 0, 0, NULL, NULL, ?)`,
        [draft.id, description, draft.createdAt, draft.createdAt, draft.idempotencyKey],
      );
      for (let index = 0; index < draft.images.length; index += 1) {
        const image = draft.images[index];
        await tx.execute(
          `INSERT INTO report_images (
             id, report_id, local_uri, original_size, compressed_size, mime_type,
             checksum, upload_status, server_image_id, retry_count, last_error,
             width, height, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 0, NULL, ?, ?, ?)`,
          [
            image.id,
            draft.id,
            image.localUri,
            image.originalSize,
            image.compressedSize,
            image.mimeType,
            image.checksum,
            image.width,
            image.height,
            draft.createdAt + index,
          ],
        );
      }
      await tx.execute(
        `INSERT INTO upload_jobs (
           id, report_id, status, attempt_count, next_attempt_at, locked_at,
           lock_owner, last_error, created_at, updated_at
         ) VALUES (?, ?, 'pending', 0, 0, NULL, NULL, NULL, ?, ?)`,
        [draft.id, draft.id, draft.createdAt, draft.createdAt],
      );
    });
  }

  async retryReport(reportId: string, now: number): Promise<boolean> {
    const report = await this.getReport(reportId);
    if (!report || report.status === 'uploaded' || report.status === 'uploading') {
      return false;
    }
    const db = getDatabase();
    const updated = await db.execute(
      `UPDATE upload_jobs
       SET status = 'pending', next_attempt_at = ?, lock_owner = NULL, locked_at = NULL, updated_at = ?
       WHERE report_id = ? AND status != 'uploading' AND status != 'done'`,
      [now, now, reportId],
    );
    if (updated.rowsAffected !== 1) {
      return false;
    }
    await db.execute(
      `UPDATE reports
       SET status = 'saved', next_retry_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, now, reportId],
    );
    await db.execute(
      `UPDATE report_images SET upload_status = 'pending'
       WHERE report_id = ? AND upload_status = 'failed'`,
      [reportId],
    );
    return true;
  }

  async listReports(): Promise<ReportWithImages[]> {
    const reports = await getDatabase().execute(
      'SELECT * FROM reports ORDER BY created_at DESC',
    );
    const images = await getDatabase().execute(
      'SELECT * FROM report_images ORDER BY created_at ASC',
    );
    const grouped = new Map<string, ImageRecord[]>();
    images.rows.forEach(row => {
      const image = mapImage(row);
      const current = grouped.get(image.reportId) ?? [];
      current.push(image);
      grouped.set(image.reportId, current);
    });
    return reports.rows.map(row => {
      const report = mapReport(row);
      return { ...report, images: grouped.get(report.id) ?? [] };
    });
  }

  async getSetting(key: string): Promise<string | null> {
    const result = await getDatabase().execute('SELECT value FROM settings WHERE key = ?', [key]);
    const value = result.rows[0]?.value;
    return value == null ? null : asString(value);
  }

  async setSetting(key: string, value: string): Promise<void> {
    await getDatabase().execute(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  async countOpenJobs(): Promise<number> {
    const result = await getDatabase().execute(
      `SELECT COUNT(*) AS total FROM upload_jobs WHERE status != 'done'`,
    );
    return asNumber(result.rows[0]?.total);
  }

  async resetAll(): Promise<void> {
    const db = getDatabase();
    const backendUrl = await this.getSetting('backend_url');
    await db.transaction(async tx => {
      await tx.execute('DELETE FROM upload_jobs');
      await tx.execute('DELETE FROM report_images');
      await tx.execute('DELETE FROM reports');
      await tx.execute('DELETE FROM settings');
      if (backendUrl) {
        await tx.execute('INSERT INTO settings (key, value) VALUES (?, ?)', [
          'backend_url',
          backendUrl,
        ]);
      }
    });
  }

  private async getJob(jobId: string) {
    const result = await getDatabase().execute('SELECT * FROM upload_jobs WHERE id = ?', [jobId]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: asString(row.id),
      reportId: asString(row.report_id),
    };
  }
}

let store: SqliteUploadStore | null = null;

export function getUploadStore(): SqliteUploadStore {
  if (!store) {
    store = new SqliteUploadStore();
  }
  return store;
}
