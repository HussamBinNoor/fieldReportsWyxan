import type { JobStatus, ReportStatus, UploadJobRecord } from './types';

const LABELS: Record<ReportStatus, string> = {
  saved: 'Saved on device',
  waiting_connection: 'Waiting for connection',
  uploading: 'Uploading',
  interrupted: 'Upload interrupted',
  failed: 'Upload failed',
  uploaded: 'Uploaded successfully',
};

export function deliveryLabel(status: ReportStatus): string {
  return LABELS[status];
}

export function isJobEligible(
  job: Pick<UploadJobRecord, 'status' | 'nextAttemptAt'>,
  now: number,
): boolean {
  const waiting: JobStatus[] = ['pending', 'interrupted'];
  return waiting.includes(job.status) && job.nextAttemptAt <= now;
}

export function statusAfterRetryableFailure(code: string): ReportStatus {
  if (code === 'NETWORK' || code === 'OFFLINE') {
    return 'waiting_connection';
  }
  return 'interrupted';
}
