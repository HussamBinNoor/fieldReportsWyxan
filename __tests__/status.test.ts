import { createReportIdentity } from '../src/domain/ids';
import { deliveryLabel, isJobEligible, statusAfterRetryableFailure } from '../src/domain/status';

describe('delivery status', () => {
  test('uses the labels an inspector can act on', () => {
    expect(deliveryLabel('saved')).toBe('Saved on device');
    expect(deliveryLabel('waiting_connection')).toBe('Waiting for connection');
    expect(deliveryLabel('uploading')).toBe('Uploading');
    expect(deliveryLabel('interrupted')).toBe('Upload interrupted');
    expect(deliveryLabel('failed')).toBe('Upload failed');
    expect(deliveryLabel('uploaded')).toBe('Uploaded successfully');
  });

  test('queues a job only when it is due', () => {
    expect(isJobEligible({ status: 'pending', nextAttemptAt: 10 }, 10)).toBe(true);
    expect(isJobEligible({ status: 'interrupted', nextAttemptAt: 11 }, 10)).toBe(false);
    expect(isJobEligible({ status: 'uploading', nextAttemptAt: 0 }, 10)).toBe(false);
    expect(isJobEligible({ status: 'done', nextAttemptAt: 0 }, 10)).toBe(false);
    expect(isJobEligible({ status: 'blocked', nextAttemptAt: 0 }, 10)).toBe(false);
  });

  test('distinguishes a dead network from a failed server response', () => {
    expect(statusAfterRetryableFailure('NETWORK')).toBe('waiting_connection');
    expect(statusAfterRetryableFailure('TIMEOUT')).toBe('interrupted');
    expect(statusAfterRetryableFailure('HTTP_503')).toBe('interrupted');
  });

  test('keeps one idempotency key for the life of a report', () => {
    const first = createReportIdentity(() => 'same-id');
    const second = createReportIdentity(() => 'same-id');
    expect(first).toEqual({ id: 'same-id', idempotencyKey: 'same-id' });
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });
});
