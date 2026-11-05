import { MAX_IMAGE_BYTES } from '../src/config/constants';
import { createReportIdentity } from '../src/domain/ids';
import type {
  ImageRecord,
  NewReportDraft,
  ReportRecord,
  ServerReport,
  UploadJobRecord,
} from '../src/domain/types';
import { processQueue } from '../src/upload/engine';
import { UploadFailure } from '../src/upload/errors';
import { MemoryUploadStore } from '../src/upload/memoryStore';
import type { ReportUploader } from '../src/upload/types';

const NOW = 1_700_000_000_000;

function image(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: 'image-1',
    reportId: 'report-1',
    localUri: 'file:///reports/report-1/image-1.jpg',
    originalSize: 8_000_000,
    compressedSize: 400_000,
    mimeType: 'image/jpeg',
    checksum: 'abc123',
    uploadStatus: 'pending',
    serverImageId: null,
    retryCount: 0,
    lastError: null,
    width: 1600,
    height: 1200,
    createdAt: NOW,
    ...overrides,
  };
}

function draft(images: ImageRecord[]): NewReportDraft {
  const identity = { id: images[0]?.reportId ?? 'report-1', idempotencyKey: images[0]?.reportId ?? 'report-1' };
  return {
    id: identity.id,
    description: 'Crack along the north wall',
    idempotencyKey: identity.idempotencyKey,
    createdAt: NOW,
    images: images.map(item => ({
      id: item.id,
      localUri: item.localUri,
      originalSize: item.originalSize,
      compressedSize: item.compressedSize,
      mimeType: item.mimeType,
      checksum: item.checksum,
      width: item.width,
      height: item.height,
    })),
  };
}

function serverReport(reportId = 'report-1', imageIds = ['image-1']): ServerReport {
  return {
    id: reportId,
    description: 'Crack along the north wall',
    status: 'complete',
    idempotencyKey: reportId,
    createdAt: new Date(NOW).toISOString(),
    completedAt: new Date(NOW).toISOString(),
    images: imageIds.map(id => ({
      id,
      checksum: 'abc123',
      mimeType: 'image/jpeg',
      sizeBytes: 400_000,
    })),
  };
}

function presentFile(uri: string): Promise<{ exists: boolean; size: number }> {
  return Promise.resolve({ exists: true, size: uri.includes('huge') ? MAX_IMAGE_BYTES + 1 : 400_000 });
}

async function seed(store: MemoryUploadStore, images: ImageRecord[]): Promise<void> {
  await store.createReport(draft(images));
}

describe('upload engine', () => {
  test('uploads every photo once and then finalizes the same report id', async () => {
    const store = new MemoryUploadStore();
    const images = [
      image(),
      image({ id: 'image-2', createdAt: NOW + 1, checksum: 'def456' }),
    ];
    await seed(store, images);
    const uploaded: string[] = [];
    const finalized: string[] = [];
    const uploader: ReportUploader = {
      getReport: async () => null,
      uploadImage: async input => {
        uploaded.push(input.imageId);
        return { imageId: input.imageId, duplicate: false };
      },
      finalizeReport: async input => {
        finalized.push(input.idempotencyKey);
        expect(input.reportId).toBe(input.idempotencyKey);
        expect(input.imageIds).toEqual(['image-1', 'image-2']);
        return serverReport('report-1', input.imageIds);
      },
    };

    const outcomes = await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
      random: () => 0,
    });

    expect(outcomes.map(item => item.result)).toEqual(['uploaded']);
    expect(uploaded).toEqual(['image-1', 'image-2']);
    expect(finalized).toEqual(['report-1']);
    expect((await store.getReport('report-1'))?.status).toBe('uploaded');
    expect((await store.listImages('report-1')).every(item => item.uploadStatus === 'uploaded')).toBe(true);
  });

  test('keeps the report when the network is unavailable', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image()]);
    let calls = 0;
    const outcomes = await processQueue({
      store,
      uploader: {
        getReport: async () => null,
        uploadImage: async () => {
          calls += 1;
          return { imageId: 'image-1', duplicate: false };
        },
        finalizeReport: async () => serverReport(),
      },
      bootId: 'boot-a',
      isOnline: async () => false,
      fileInfo: presentFile,
      now: () => NOW,
    });

    expect(outcomes).toEqual([]);
    expect(calls).toBe(0);
    expect((await store.getReport('report-1'))?.status).toBe('waiting_connection');
    expect((await store.listEligibleJobs(NOW))).toHaveLength(1);
  });

  test('retries a photo after the connection drops and does not upload it twice after success', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image(), image({ id: 'image-2', createdAt: NOW + 1 })]);
    let attempts = 0;
    const uploader: ReportUploader = {
      getReport: async () => null,
      uploadImage: async input => {
        attempts += 1;
        if (input.imageId === 'image-1' && attempts === 1) {
          throw new UploadFailure('NETWORK', 'socket hang up', true);
        }
        return { imageId: input.imageId, duplicate: false };
      },
      finalizeReport: async input => serverReport('report-1', input.imageIds),
    };

    const first = await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
      random: () => 0,
    });
    expect(first[0].result).toBe('retry');
    expect((await store.listImages('report-1')).find(item => item.id === 'image-1')?.uploadStatus).toBe('pending');

    const second = await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW + 3_000,
      random: () => 0,
    });
    expect(second[0].result).toBe('uploaded');
    const callsForFirst = attempts;
    expect(callsForFirst).toBe(3);

    await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW + 4_000,
    });
    expect(attempts).toBe(callsForFirst);
  });

  test('treats a lost finalize response as retryable and keeps the same ids', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image()]);
    const seen: string[] = [];
    let finalizeCalls = 0;
    const uploader: ReportUploader = {
      getReport: async () => null,
      uploadImage: async input => {
        seen.push(input.imageId);
        return { imageId: input.imageId, duplicate: seen.filter(id => id === input.imageId).length > 1 };
      },
      finalizeReport: async input => {
        finalizeCalls += 1;
        expect(input.idempotencyKey).toBe('report-1');
        if (finalizeCalls === 1) {
          throw new UploadFailure('NETWORK', 'response lost', true);
        }
        return serverReport();
      },
    };

    await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
      random: () => 0,
    });
    expect((await store.listImages('report-1'))[0].uploadStatus).toBe('uploaded');

    const second = await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW + 3_000,
      random: () => 0,
    });

    expect(second[0].result).toBe('uploaded');
    expect(seen).toEqual(['image-1']);
    expect(finalizeCalls).toBe(2);
    expect((await store.getReport('report-1'))?.idempotencyKey).toBe('report-1');
  });

  test('confirms a report the server already stored when the success response was lost', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image()]);
    let uploads = 0;
    const uploader: ReportUploader = {
      getReport: async () => null,
      uploadImage: async () => {
        uploads += 1;
        return { imageId: 'image-1', duplicate: false };
      },
      finalizeReport: async () => {
        throw new UploadFailure('NETWORK', 'response lost', true);
      },
    };
    await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
      random: () => 0,
    });

    const recovery: ReportUploader = {
      getReport: async () => serverReport(),
      uploadImage: async () => {
        uploads += 1;
        return { imageId: 'image-1', duplicate: true };
      },
      finalizeReport: async () => {
        throw new Error('finalize should not run when the server already has the report');
      },
    };
    const outcomes = await processQueue({
      store,
      uploader: recovery,
      bootId: 'boot-b',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW + 3_000,
    });
    expect(outcomes[0].result).toBe('uploaded');
    expect(uploads).toBe(1);
  });

  test('retries only the photos that are not confirmed', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [
      image(),
      image({ id: 'image-2', createdAt: NOW + 1 }),
      image({ id: 'image-3', createdAt: NOW + 2 }),
    ]);
    const seen: string[] = [];
    const uploader: ReportUploader = {
      getReport: async () => null,
      uploadImage: async input => {
        seen.push(input.imageId);
        if (input.imageId === 'image-2' && seen.filter(id => id === 'image-2').length === 1) {
          throw new UploadFailure('HTTP_503', 'unavailable', true);
        }
        return { imageId: input.imageId, duplicate: false };
      },
      finalizeReport: async input => serverReport('report-1', input.imageIds),
    };

    await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
      random: () => 0,
    });
    expect((await store.listImages('report-1')).map(item => item.uploadStatus)).toEqual([
      'uploaded',
      'pending',
      'pending',
    ]);

    await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW + 3_000,
      random: () => 0,
    });
    expect(seen).toEqual(['image-1', 'image-2', 'image-2', 'image-3']);
    expect((await store.getReport('report-1'))?.status).toBe('uploaded');
  });

  test('stops on a permanent validation failure and keeps the local report', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image()]);
    let calls = 0;
    const uploader: ReportUploader = {
      getReport: async () => null,
      uploadImage: async () => {
        calls += 1;
        throw new UploadFailure('INVALID_DESCRIPTION', 'Description is empty.', false);
      },
      finalizeReport: async () => serverReport(),
    };
    const first = await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
    });
    expect(first[0].result).toBe('blocked');
    expect((await store.getReport('report-1'))?.status).toBe('failed');

    await processQueue({
      store,
      uploader,
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW + 60_000,
    });
    expect(calls).toBe(1);
  });

  test('recovers a job left in uploading after the process died', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image()]);
    const job = store.jobs.get('report-1') as UploadJobRecord;
    job.status = 'uploading';
    job.lockOwner = 'dead-runtime';
    job.lockedAt = NOW - 60_000;
    const report = store.reports.get('report-1') as ReportRecord;
    report.status = 'uploading';
    let uploads = 0;

    const outcomes = await processQueue({
      store,
      uploader: {
        getReport: async () => null,
        uploadImage: async () => {
          uploads += 1;
          return { imageId: 'image-1', duplicate: false };
        },
        finalizeReport: async () => serverReport(),
      },
      bootId: 'fresh-runtime',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
    });

    expect(uploads).toBe(1);
    expect(outcomes[0].result).toBe('uploaded');
  });

  test('lets only one of two workers upload the same job', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image()]);
    let release = () => {};
    const gate = new Promise<void>(resolve => {
      release = () => resolve();
    });
    let started = 0;
    const uploader: ReportUploader = {
      getReport: async () => null,
      uploadImage: async () => {
        started += 1;
        await gate;
        return { imageId: 'image-1', duplicate: false };
      },
      finalizeReport: async () => serverReport(),
    };
    const deps = {
      store,
      uploader,
      bootId: 'shared-runtime',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
    };
    const first = processQueue(deps);
    const second = processQueue(deps);
    await new Promise<void>(resolve => {
      setTimeout(() => resolve(), 20);
    });
    expect(started).toBe(1);
    release();
    const outcomes = await Promise.all([first, second]);
    const flat = outcomes.flat();
    expect(flat.filter(item => item.result === 'uploaded')).toHaveLength(1);
    expect(flat.filter(item => item.result === 'skipped')).toHaveLength(1);
  });

  test('blocks a report when the local photo file is gone', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image()]);
    const outcomes = await processQueue({
      store,
      uploader: {
        getReport: async () => null,
        uploadImage: async () => {
          throw new Error('should not upload');
        },
        finalizeReport: async () => serverReport(),
      },
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: async () => ({ exists: false, size: 0 }),
      now: () => NOW,
    });
    expect(outcomes[0].result).toBe('blocked');
    expect((await store.getReport('report-1'))?.lastError).toMatch(/missing/i);
  });

  test('blocks a photo that is still over 5 MB', async () => {
    const store = new MemoryUploadStore();
    await seed(store, [image({ localUri: 'file:///reports/huge.jpg' })]);
    const outcomes = await processQueue({
      store,
      uploader: {
        getReport: async () => null,
        uploadImage: async () => ({ imageId: 'image-1', duplicate: false }),
        finalizeReport: async () => serverReport(),
      },
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
    });
    expect(outcomes[0].result).toBe('blocked');
    expect((await store.getReport('report-1'))?.status).toBe('failed');
  });

  test('respects Retry-After and a stable idempotency key', async () => {
    const identity = createReportIdentity(() => 'fixed-report-id');
    expect(identity.id).toBe(identity.idempotencyKey);
    const store = new MemoryUploadStore();
    await store.createReport({
      ...draft([image({ reportId: identity.id, id: 'image-9' })]),
      id: identity.id,
      idempotencyKey: identity.idempotencyKey,
    });
    const outcome = await processQueue({
      store,
      uploader: {
        getReport: async () => null,
        uploadImage: async () => {
          throw new UploadFailure('HTTP_429', 'slow down', true, 5_000);
        },
        finalizeReport: async () => serverReport(identity.id, ['image-9']),
      },
      bootId: 'boot-a',
      isOnline: async () => true,
      fileInfo: presentFile,
      now: () => NOW,
      random: () => 0,
    });
    expect(outcome[0].nextAttemptAt).toBe(NOW + 5_000);
    expect((await store.getReport(identity.id))?.idempotencyKey).toBe('fixed-report-id');
    expect((await store.listEligibleJobs(NOW + 4_999))).toHaveLength(0);
    expect((await store.listEligibleJobs(NOW + 5_000))).toHaveLength(1);
  });
});
