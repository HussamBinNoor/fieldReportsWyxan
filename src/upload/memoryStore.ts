import { isJobEligible } from '../domain/status';
import type {
  ImageRecord,
  ImageStatus,
  NewReportDraft,
  ReportRecord,
  ReportStatus,
  UploadJobRecord,
} from '../domain/types';
import type { UploadStore } from './types';

function cloneReport(report: ReportRecord): ReportRecord {
  return { ...report };
}

function cloneImage(image: ImageRecord): ImageRecord {
  return { ...image };
}

function cloneJob(job: UploadJobRecord): UploadJobRecord {
  return { ...job };
}

export class MemoryUploadStore implements UploadStore {
  reports = new Map<string, ReportRecord>();
  images = new Map<string, ImageRecord>();
  jobs = new Map<string, UploadJobRecord>();

  async recoverForeignLocks(bootId: string, now: number): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.status === 'uploading' && job.lockOwner !== bootId) {
        job.status = 'interrupted';
        job.lockOwner = null;
        job.lockedAt = null;
        job.updatedAt = now;
        const report = this.reports.get(job.reportId);
        if (report && report.status === 'uploading') {
          report.status = 'interrupted';
          report.updatedAt = now;
        }
      }
    }
  }

  async listEligibleJobs(now: number): Promise<UploadJobRecord[]> {
    return [...this.jobs.values()]
      .filter(job => isJobEligible(job, now))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(cloneJob);
  }

  async tryLockJob(jobId: string, bootId: string, now: number): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || !isJobEligible(job, now)) {
      return false;
    }
    job.status = 'uploading';
    job.lockOwner = bootId;
    job.lockedAt = now;
    job.updatedAt = now;
    const report = this.reports.get(job.reportId);
    if (report && report.status !== 'uploaded' && report.status !== 'failed') {
      report.status = 'uploading';
      report.updatedAt = now;
    }
    return true;
  }

  async releaseAbandonedLock(jobId: string, bootId: string, now: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.lockOwner !== bootId || job.status !== 'uploading') {
      return;
    }
    job.status = 'interrupted';
    job.lockOwner = null;
    job.lockedAt = null;
    job.updatedAt = now;
    const report = this.reports.get(job.reportId);
    if (report && report.status === 'uploading') {
      report.status = 'interrupted';
      report.updatedAt = now;
    }
  }

  async stillOwnsLock(jobId: string, bootId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    return Boolean(job && job.status === 'uploading' && job.lockOwner === bootId);
  }

  async getReport(reportId: string): Promise<ReportRecord | null> {
    const report = this.reports.get(reportId);
    return report ? cloneReport(report) : null;
  }

  async listImages(reportId: string): Promise<ImageRecord[]> {
    return [...this.images.values()]
      .filter(image => image.reportId === reportId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(cloneImage);
  }

  async markImageUploading(imageId: string, now: number): Promise<void> {
    void now;
    const image = this.images.get(imageId);
    if (!image) {
      return;
    }
    image.uploadStatus = 'uploading';
  }

  async markImageUploaded(imageId: string, serverImageId: string, now: number): Promise<void> {
    void now;
    const image = this.images.get(imageId);
    if (!image) {
      return;
    }
    image.uploadStatus = 'uploaded';
    image.serverImageId = serverImageId;
    image.lastError = null;
  }

  async markImageError(
    imageId: string,
    error: string,
    status: ImageStatus,
    now: number,
  ): Promise<void> {
    void now;
    const image = this.images.get(imageId);
    if (!image) {
      return;
    }
    image.uploadStatus = status;
    image.lastError = error;
    image.retryCount += 1;
  }

  async markReportProgress(
    reportId: string,
    progress: number,
    status: ReportStatus,
    now: number,
  ): Promise<void> {
    const report = this.reports.get(reportId);
    if (!report || report.status === 'uploaded') {
      return;
    }
    report.uploadProgress = progress;
    report.status = status;
    report.updatedAt = now;
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
    const job = this.jobs.get(input.jobId);
    if (job && job.status !== 'done' && job.status !== 'blocked') {
      job.status = 'interrupted';
      job.attemptCount = input.attemptCount;
      job.nextAttemptAt = input.nextAttemptAt;
      job.lastError = input.error;
      job.lockOwner = null;
      job.lockedAt = null;
      job.updatedAt = input.now;
    }
    const report = this.reports.get(input.reportId);
    if (report && report.status !== 'uploaded') {
      report.status = input.reportStatus;
      report.retryCount = input.attemptCount;
      report.nextRetryAt = input.nextAttemptAt;
      report.lastError = input.error;
      report.updatedAt = input.now;
    }
  }

  async markUploaded(reportId: string, jobId: string, now: number): Promise<void> {
    const report = this.reports.get(reportId);
    if (report) {
      report.status = 'uploaded';
      report.uploadProgress = 100;
      report.uploadedAt = now;
      report.lastError = null;
      report.updatedAt = now;
    }
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'done';
      job.lockOwner = null;
      job.lockedAt = null;
      job.lastError = null;
      job.updatedAt = now;
    }
    for (const image of this.images.values()) {
      if (image.reportId === reportId) {
        image.uploadStatus = 'uploaded';
        image.serverImageId = image.serverImageId ?? image.id;
        image.lastError = null;
      }
    }
  }

  async markBlocked(reportId: string, jobId: string, error: string, now: number): Promise<void> {
    const report = this.reports.get(reportId);
    if (report && report.status !== 'uploaded') {
      report.status = 'failed';
      report.lastError = error;
      report.updatedAt = now;
    }
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'blocked';
      job.lastError = error;
      job.lockOwner = null;
      job.lockedAt = null;
      job.updatedAt = now;
    }
  }

  async markWaitingForConnection(now: number): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.status !== 'pending' && job.status !== 'interrupted') {
        continue;
      }
      const report = this.reports.get(job.reportId);
      if (!report || report.status === 'uploaded' || report.status === 'failed') {
        continue;
      }
      if (report.status === 'uploading') {
        continue;
      }
      report.status = 'waiting_connection';
      report.updatedAt = now;
    }
  }

  async soonestFutureAttempt(now: number): Promise<number | null> {
    let soonest: number | null = null;
    for (const job of this.jobs.values()) {
      if (job.status === 'done' || job.status === 'blocked' || job.status === 'uploading') {
        continue;
      }
      if (job.nextAttemptAt <= now) {
        continue;
      }
      if (soonest === null || job.nextAttemptAt < soonest) {
        soonest = job.nextAttemptAt;
      }
    }
    return soonest;
  }

  async createReport(draft: NewReportDraft): Promise<void> {
    if (this.reports.has(draft.id) || [...this.jobs.values()].some(job => job.reportId === draft.id)) {
      throw new Error('That report is already saved on this device.');
    }
    const report: ReportRecord = {
      id: draft.id,
      description: draft.description.trim(),
      createdAt: draft.createdAt,
      updatedAt: draft.createdAt,
      status: 'saved',
      uploadProgress: 0,
      retryCount: 0,
      nextRetryAt: 0,
      lastError: null,
      uploadedAt: null,
      idempotencyKey: draft.idempotencyKey,
    };
    const images: ImageRecord[] = draft.images.map((image, index) => ({
      id: image.id,
      reportId: draft.id,
      localUri: image.localUri,
      originalSize: image.originalSize,
      compressedSize: image.compressedSize,
      mimeType: image.mimeType,
      checksum: image.checksum,
      uploadStatus: 'pending',
      serverImageId: null,
      retryCount: 0,
      lastError: null,
      width: image.width,
      height: image.height,
      createdAt: draft.createdAt + index,
    }));
    const job: UploadJobRecord = {
      id: draft.id,
      reportId: draft.id,
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: 0,
      lockedAt: null,
      lockOwner: null,
      lastError: null,
      createdAt: draft.createdAt,
      updatedAt: draft.createdAt,
    };

    this.reports.set(report.id, report);
    images.forEach(image => this.images.set(image.id, image));
    this.jobs.set(job.id, job);
  }

  async retryReport(reportId: string, now: number): Promise<boolean> {
    const job = [...this.jobs.values()].find(item => item.reportId === reportId);
    const report = this.reports.get(reportId);
    if (!job || !report || report.status === 'uploaded' || job.status === 'uploading') {
      return false;
    }
    job.status = 'pending';
    job.nextAttemptAt = now;
    job.lockOwner = null;
    job.lockedAt = null;
    job.updatedAt = now;
    report.status = 'saved';
    report.nextRetryAt = now;
    report.updatedAt = now;
    for (const image of this.images.values()) {
      if (image.reportId === reportId && image.uploadStatus === 'failed') {
        image.uploadStatus = 'pending';
      }
    }
    return true;
  }
}
