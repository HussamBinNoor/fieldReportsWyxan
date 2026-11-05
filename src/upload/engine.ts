import { MAX_IMAGE_BYTES } from '../config/constants';
import { statusAfterRetryableFailure } from '../domain/status';
import type { ImageRecord, UploadJobRecord } from '../domain/types';
import { UploadFailure, toUploadFailure } from './errors';
import { delayBeforeAttempt } from './retry';
import type { JobOutcome, ReportUploader, UploadStore } from './types';

export type EngineDeps = {
  store: UploadStore;
  uploader: ReportUploader;
  bootId: string;
  isOnline: () => Promise<boolean>;
  fileInfo: (uri: string) => Promise<{ exists: boolean; size: number }>;
  now?: () => number;
  random?: () => number;
  onChange?: () => void;
};

/**
 * Processes the durable queue one report at a time, and one photo at a time.
 * A single upload is the right concurrency for a 2G link: parallel transfers
 * tend to time out together. The engine does not import React.
 */
export async function processQueue(deps: EngineDeps): Promise<JobOutcome[]> {
  const now = deps.now ?? Date.now;
  await deps.store.recoverForeignLocks(deps.bootId, now());

  if (!(await deps.isOnline())) {
    await deps.store.markWaitingForConnection(now());
    deps.onChange?.();
    return [];
  }

  const jobs = await deps.store.listEligibleJobs(now());
  const outcomes: JobOutcome[] = [];

  for (const job of jobs) {
    const locked = await deps.store.tryLockJob(job.id, deps.bootId, now());
    if (!locked) {
      outcomes.push({ jobId: job.id, reportId: job.reportId, result: 'skipped' });
      continue;
    }

    try {
      outcomes.push(await processJob(job, deps, now));
    } catch (error) {
      outcomes.push(await applyFailure(job, toUploadFailure(error), deps, now));
    } finally {
      await deps.store.releaseAbandonedLock(job.id, deps.bootId, now());
    }
  }

  return outcomes;
}

async function processJob(
  job: UploadJobRecord,
  deps: EngineDeps,
  now: () => number,
): Promise<JobOutcome> {
  const report = await deps.store.getReport(job.reportId);
  if (!report) {
    const message = 'The saved report could not be found on this device.';
    await deps.store.markBlocked(job.reportId, job.id, message, now());
    deps.onChange?.();
    return { jobId: job.id, reportId: job.reportId, result: 'blocked', message };
  }

  if (report.status === 'uploaded') {
    await deps.store.markUploaded(report.id, job.id, now());
    deps.onChange?.();
    return { jobId: job.id, reportId: report.id, result: 'uploaded' };
  }

  const images = await deps.store.listImages(report.id);
  const needsRecovery =
    job.attemptCount > 0 ||
    job.status === 'interrupted' ||
    images.some(image => image.uploadStatus === 'uploaded');

  if (needsRecovery) {
    const remote = await deps.uploader.getReport(report.id);
    if (remote?.status === 'complete') {
      await deps.store.markUploaded(report.id, job.id, now());
      deps.onChange?.();
      return { jobId: job.id, reportId: report.id, result: 'uploaded' };
    }
  }

  for (const image of images) {
    if (!(await deps.store.stillOwnsLock(job.id, deps.bootId))) {
      return { jobId: job.id, reportId: report.id, result: 'skipped' };
    }
    if (image.uploadStatus === 'uploaded') {
      continue;
    }

    const info = await deps.fileInfo(image.localUri);
    if (!info.exists) {
      return block(
        job,
        deps,
        now,
        'A photo for this report is missing from the device, so it cannot be uploaded.',
      );
    }
    if (info.size > MAX_IMAGE_BYTES) {
      return block(
        job,
        deps,
        now,
        'A saved photo is larger than 5 MB. It was not uploaded.',
      );
    }

    try {
      await deps.store.markImageUploading(image.id, now());
      const uploaded = await deps.uploader.uploadImage({
        reportId: report.id,
        imageId: image.id,
        fileUri: image.localUri,
        checksum: image.checksum,
        byteSize: info.size,
        mimeType: image.mimeType,
      });
      await deps.store.markImageUploaded(image.id, uploaded.imageId, now());
      image.uploadStatus = 'uploaded';
      image.serverImageId = uploaded.imageId;
      const completed = images.filter(item => item.uploadStatus === 'uploaded').length;
      const progress = Math.round((completed / images.length) * 100);
      await deps.store.markReportProgress(report.id, progress, 'uploading', now());
      deps.onChange?.();
    } catch (error) {
      const failure = toUploadFailure(error);
      await deps.store.markImageError(
        image.id,
        failure.message,
        failure.retryable ? 'pending' : 'failed',
        now(),
      );
      return applyFailure(job, failure, deps, now);
    }
  }

  try {
    const remote = await deps.uploader.finalizeReport({
      reportId: report.id,
      description: report.description,
      imageIds: images.map(image => image.id),
      idempotencyKey: report.idempotencyKey,
    });
    if (remote.status !== 'complete') {
      throw new UploadFailure(
        'INCOMPLETE_IMAGES',
        'The server has not received every photo yet.',
        true,
      );
    }
    await deps.store.markUploaded(report.id, job.id, now());
    deps.onChange?.();
    return { jobId: job.id, reportId: report.id, result: 'uploaded' };
  } catch (error) {
    const failure = toUploadFailure(error);
    return applyFailure(job, failure, deps, now);
  }
}

async function block(
  job: UploadJobRecord,
  deps: EngineDeps,
  now: () => number,
  message: string,
): Promise<JobOutcome> {
  await deps.store.markBlocked(job.reportId, job.id, message, now());
  deps.onChange?.();
  return { jobId: job.id, reportId: job.reportId, result: 'blocked', message };
}

async function applyFailure(
  job: UploadJobRecord,
  failure: UploadFailure,
  deps: EngineDeps,
  now: () => number,
): Promise<JobOutcome> {
  if (!failure.retryable) {
    return block(job, deps, now, failure.message);
  }

  const attemptCount = job.attemptCount + 1;
  const delay =
    failure.retryAfterMs ?? delayBeforeAttempt(attemptCount + 1, deps.random ?? Math.random);
  const nextAttemptAt = now() + delay;
  await deps.store.scheduleRetry({
    jobId: job.id,
    reportId: job.reportId,
    attemptCount,
    nextAttemptAt,
    error: failure.message,
    reportStatus: statusAfterRetryableFailure(failure.code),
    now: now(),
  });
  deps.onChange?.();
  return {
    jobId: job.id,
    reportId: job.reportId,
    result: 'retry',
    message: failure.message,
    nextAttemptAt,
  };
}

export function uploadedImageCount(images: ImageRecord[]): number {
  return images.filter(image => image.uploadStatus === 'uploaded').length;
}
