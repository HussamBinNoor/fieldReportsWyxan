export type ReportStatus =
  | 'saved'
  | 'waiting_connection'
  | 'uploading'
  | 'interrupted'
  | 'failed'
  | 'uploaded';

export type ImageStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export type JobStatus = 'pending' | 'uploading' | 'interrupted' | 'blocked' | 'done';

export type ReportRecord = {
  id: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  status: ReportStatus;
  uploadProgress: number;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
  uploadedAt: number | null;
  idempotencyKey: string;
};

export type ImageRecord = {
  id: string;
  reportId: string;
  localUri: string;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
  checksum: string;
  uploadStatus: ImageStatus;
  serverImageId: string | null;
  retryCount: number;
  lastError: string | null;
  width: number;
  height: number;
  createdAt: number;
};

export type UploadJobRecord = {
  id: string;
  reportId: string;
  status: JobStatus;
  attemptCount: number;
  nextAttemptAt: number;
  lockedAt: number | null;
  lockOwner: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ReportImageDraft = {
  id: string;
  localUri: string;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
  checksum: string;
  width: number;
  height: number;
};

export type NewReportDraft = {
  id: string;
  description: string;
  idempotencyKey: string;
  createdAt: number;
  images: ReportImageDraft[];
};

export type ServerImage = {
  id: string;
  checksum: string;
  mimeType: string;
  sizeBytes: number;
};

export type ServerReport = {
  id: string;
  description: string;
  status: 'incomplete' | 'complete';
  idempotencyKey: string;
  createdAt: string;
  completedAt: string | null;
  images: ServerImage[];
};
