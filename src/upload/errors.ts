const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class UploadFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    code: string,
    message: string,
    retryable: boolean,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'UploadFailure';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export function classifyHttpStatus(status: number): 'retryable' | 'permanent' {
  if (RETRYABLE_STATUS.has(status) || status >= 500) {
    return 'retryable';
  }
  return 'permanent';
}

export function toUploadFailure(error: unknown): UploadFailure {
  if (error instanceof UploadFailure) {
    return error;
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new UploadFailure(
      'TIMEOUT',
      'The upload timed out before the server finished responding.',
      true,
    );
  }
  return new UploadFailure(
    'NETWORK',
    'The network connection dropped before the upload finished.',
    true,
  );
}

export function failureFromHttp(input: {
  status: number;
  code?: string;
  message?: string;
  retryAfterMs?: number | null;
}): UploadFailure {
  const code = input.code || `HTTP_${input.status}`;
  const retryable = code === 'INCOMPLETE_IMAGES' || classifyHttpStatus(input.status) === 'retryable';
  const message =
    input.message ||
    (retryable
      ? 'The server could not accept the report just now. It will be retried.'
      : 'The server rejected the report. It is still saved on this device.');
  return new UploadFailure(code, message, retryable, input.retryAfterMs ?? null);
}
