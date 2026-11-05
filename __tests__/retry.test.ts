import { delayBeforeAttempt, parseRetryAfterMs } from '../src/upload/retry';

describe('retry delay', () => {
  const random = () => 0;

  test('follows the backoff schedule and then caps', () => {
    expect(delayBeforeAttempt(1, random)).toBe(0);
    expect(delayBeforeAttempt(2, random)).toBe(2_000);
    expect(delayBeforeAttempt(3, random)).toBe(5_000);
    expect(delayBeforeAttempt(4, random)).toBe(15_000);
    expect(delayBeforeAttempt(5, random)).toBe(30_000);
    expect(delayBeforeAttempt(6, random)).toBe(60_000);
    expect(delayBeforeAttempt(20, random)).toBe(5 * 60 * 1000);
  });

  test('adds jitter without passing the cap', () => {
    expect(delayBeforeAttempt(2, () => 0.5)).toBe(2_200);
    expect(delayBeforeAttempt(20, () => 0.99)).toBe(5 * 60 * 1000);
  });

  test('reads Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfterMs('5', 1_000)).toBe(5_000);
    expect(parseRetryAfterMs(new Date(11_000).toUTCString(), 1_000)).toBe(10_000);
    expect(parseRetryAfterMs('soon', 1_000)).toBeNull();
  });
});
