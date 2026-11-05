import type {
  ImageRecord,
  ImageStatus,
  NewReportDraft,
  ReportRecord,
  ReportStatus,
  ServerReport,
  UploadJobRecord,
} from '../domain/types';

export type UploadImageResult = {
  imageId: string;
  duplicate: boolean;
};

export interface ReportUploader {
  getReport(reportId: string): Promise<ServerReport | null>;
  uploadImage(input: {
    reportId: string;
    imageId: string;
    fileUri: string;
    checksum: string;
    byteSize: number;
    mimeType: string;
  }): Promise<UploadImageResult>;
  finalizeReport(input: {
    reportId: string;
    description: string;
    imageIds: string[];
    idempotencyKey: string;
  }): Promise<ServerReport>;
}

export type LocalFileInfo = {
  exists: boolean;
  size: number;
};

export interface UploadStore {
  recoverForeignLocks(bootId: string, now: number): Promise<void>;
  listEligibleJobs(now: number): Promise<UploadJobRecord[]>;
  tryLockJob(jobId: string, bootId: string, now: number): Promise<boolean>;
  releaseAbandonedLock(jobId: string, bootId: string, now: number): Promise<void>;
  stillOwnsLock(jobId: string, bootId: string): Promise<boolean>;
  getReport(reportId: string): Promise<ReportRecord | null>;
  listImages(reportId: string): Promise<ImageRecord[]>;
  markImageUploading(imageId: string, now: number): Promise<void>;
  markImageUploaded(imageId: string, serverImageId: string, now: number): Promise<void>;
  markImageError(
    imageId: string,
    error: string,
    status: ImageStatus,
    now: number,
  ): Promise<void>;
  markReportProgress(
    reportId: string,
    progress: number,
    status: ReportStatus,
    now: number,
  ): Promise<void>;
  scheduleRetry(input: {
    jobId: string;
    reportId: string;
    attemptCount: number;
    nextAttemptAt: number;
    error: string;
    reportStatus: ReportStatus;
    now: number;
  }): Promise<void>;
  markUploaded(reportId: string, jobId: string, now: number): Promise<void>;
  markBlocked(reportId: string, jobId: string, error: string, now: number): Promise<void>;
  markWaitingForConnection(now: number): Promise<void>;
  soonestFutureAttempt(now: number): Promise<number | null>;
  createReport(draft: NewReportDraft): Promise<void>;
  retryReport(reportId: string, now: number): Promise<boolean>;
}

export type JobOutcome = {
  jobId: string;
  reportId: string;
  result: 'uploaded' | 'retry' | 'blocked' | 'skipped';
  message?: string;
  nextAttemptAt?: number;
};
