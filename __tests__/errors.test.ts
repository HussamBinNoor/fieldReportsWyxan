import { classifyHttpStatus, failureFromHttp, toUploadFailure, UploadFailure } from '../src/upload/errors';

describe('error classification', () => {
  test('retries timeouts, rate limits, and server failures', () => {
    expect([408, 429, 500, 502, 503, 504].map(classifyHttpStatus)).toEqual([
      'retryable',
      'retryable',
      'retryable',
      'retryable',
      'retryable',
      'retryable',
    ]);
  });

  test('does not retry a rejected report', () => {
    expect(classifyHttpStatus(400)).toBe('permanent');
    expect(classifyHttpStatus(401)).toBe('permanent');
    expect(classifyHttpStatus(403)).toBe('permanent');
    expect(classifyHttpStatus(413)).toBe('permanent');
    const failure = failureFromHttp({
      status: 400,
      code: 'IMAGE_TOO_LARGE',
      message: 'Images must be 5000000 bytes or smaller.',
    });
    expect(failure.retryable).toBe(false);
  });

  test('retries an incomplete image set and network drops', () => {
    expect(failureFromHttp({ status: 409, code: 'INCOMPLETE_IMAGES' }).retryable).toBe(true);
    expect(toUploadFailure(new Error('socket')).code).toBe('NETWORK');
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(toUploadFailure(abort).retryable).toBe(true);
    expect(toUploadFailure(new UploadFailure('HTTP_503', 'down', true)).code).toBe('HTTP_503');
  });
});
