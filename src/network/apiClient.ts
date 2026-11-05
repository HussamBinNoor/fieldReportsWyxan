import { REQUEST_TIMEOUT_MS } from '../config/constants';
import { normalizeBaseUrl } from '../domain/format';
import type { ServerImage, ServerReport } from '../domain/types';
import { failureFromHttp, UploadFailure } from '../upload/errors';
import { parseRetryAfterMs } from '../upload/retry';
import type { ReportUploader } from '../upload/types';
import { toFileUri } from '../files/reportFiles';

export type ServerSummary = {
  completedReports: number;
  images: number;
  largestImageBytes: number;
  allImagesWithinLimit: boolean;
};

export type SimulationUpdate = {
  latencyMs: number;
  dropNext: number;
  failNext: number;
  failStatus: number;
  hang: boolean;
  refuseUploads: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseImage(value: unknown): ServerImage {
  if (!isRecord(value)) {
    throw new UploadFailure('INVALID_RESPONSE', 'The server returned an unreadable photo.', false);
  }
  const id = asString(value.id);
  const checksum = asString(value.checksum);
  const mimeType = asString(value.mimeType);
  const sizeBytes = asNumber(value.sizeBytes);
  if (!id || !checksum || !mimeType || sizeBytes == null) {
    throw new UploadFailure('INVALID_RESPONSE', 'The server returned an unreadable photo.', false);
  }
  return { id, checksum, mimeType, sizeBytes };
}

export function parseServerReport(value: unknown): ServerReport {
  if (!isRecord(value)) {
    throw new UploadFailure('INVALID_RESPONSE', 'The server returned an unreadable report.', false);
  }
  const id = asString(value.id);
  const description = asString(value.description);
  const status = asString(value.status);
  const idempotencyKey = asString(value.idempotencyKey);
  const createdAt = asString(value.createdAt);
  const completedAt = value.completedAt == null ? null : asString(value.completedAt);
  if (!id || description == null || (status !== 'complete' && status !== 'incomplete') || !idempotencyKey || !createdAt) {
    throw new UploadFailure('INVALID_RESPONSE', 'The server returned an unreadable report.', false);
  }
  if (!Array.isArray(value.images)) {
    throw new UploadFailure('INVALID_RESPONSE', 'The server returned an unreadable report.', false);
  }
  return {
    id,
    description,
    status,
    idempotencyKey,
    createdAt,
    completedAt,
    images: value.images.map(parseImage),
  };
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UploadFailure('TIMEOUT', 'The upload timed out before the server finished responding.', true);
    }
    throw new UploadFailure('NETWORK', 'The network connection dropped before the upload finished.', true);
  } finally {
    clearTimeout(timer);
  }
}

async function sendJson(url: string, method: string, body?: unknown): Promise<unknown> {
  const response = await request(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await readBody(response);
  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    throw failureFromHttp({
      status: response.status,
      code: asString(record.error) ?? undefined,
      message: asString(record.message) ?? undefined,
      retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after'), Date.now()),
    });
  }
  return payload;
}

export function serverImageUrl(baseUrl: string, reportId: string, imageId: string): string {
  return `${normalizeBaseUrl(baseUrl)}/api/reports/${reportId}/images/${imageId}/file`;
}

export function createApiClient(readBaseUrl: () => Promise<string>): ReportUploader & {
  fetchReports: () => Promise<ServerReport[]>;
  fetchSummary: () => Promise<ServerSummary>;
  checkHealth: () => Promise<boolean>;
  updateSimulation: (update: SimulationUpdate) => Promise<void>;
} {
  return {
    async getReport(reportId) {
      const baseUrl = await readBaseUrl();
      const response = await request(`${baseUrl}/api/reports/${reportId}`, {
        headers: { Accept: 'application/json' },
      });
      if (response.status === 404) {
        return null;
      }
      const payload = await readBody(response);
      if (!response.ok) {
        const record = isRecord(payload) ? payload : {};
        throw failureFromHttp({
          status: response.status,
          code: asString(record.error) ?? undefined,
          message: asString(record.message) ?? undefined,
          retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after'), Date.now()),
        });
      }
      return parseServerReport(payload);
    },
    async uploadImage(input) {
      const baseUrl = await readBaseUrl();
      const body = new FormData();
      body.append('checksum', input.checksum);
      body.append('byteSize', String(input.byteSize));
      const file = {
        uri: toFileUri(input.fileUri),
        name: `${input.imageId}.jpg`,
        type: input.mimeType || 'image/jpeg',
      };
      body.append('file', file as unknown as Blob);
      const response = await request(`${baseUrl}/api/reports/${input.reportId}/images/${input.imageId}`, {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      const payload = await readBody(response);
      if (!response.ok) {
        const record = isRecord(payload) ? payload : {};
        throw failureFromHttp({
          status: response.status,
          code: asString(record.error) ?? undefined,
          message: asString(record.message) ?? undefined,
          retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after'), Date.now()),
        });
      }
      if (!isRecord(payload) || asString(payload.imageId) == null) {
        throw new UploadFailure('INVALID_RESPONSE', 'The server did not confirm the photo.', true);
      }
      return {
        imageId: asString(payload.imageId) as string,
        duplicate: payload.duplicate === true,
      };
    },
    async finalizeReport(input) {
      const baseUrl = await readBaseUrl();
      const payload = await sendJson(`${baseUrl}/api/reports/${input.reportId}/finalize`, 'POST', {
        description: input.description,
        imageIds: input.imageIds,
        idempotencyKey: input.idempotencyKey,
      });
      return parseServerReport(payload);
    },
    async fetchReports() {
      const baseUrl = await readBaseUrl();
      const payload = await sendJson(`${baseUrl}/api/reports`, 'GET');
      if (!isRecord(payload) || !Array.isArray(payload.reports)) {
        throw new UploadFailure('INVALID_RESPONSE', 'The server returned an unreadable report list.', true);
      }
      return payload.reports.map(parseServerReport);
    },
    async fetchSummary() {
      const baseUrl = await readBaseUrl();
      const payload = await sendJson(`${baseUrl}/api/reports/summary`, 'GET');
      if (!isRecord(payload)) {
        throw new UploadFailure('INVALID_RESPONSE', 'The server summary could not be read.', true);
      }
      return {
        completedReports: asNumber(payload.completedReports) ?? 0,
        images: asNumber(payload.images) ?? 0,
        largestImageBytes: asNumber(payload.largestImageBytes) ?? 0,
        allImagesWithinLimit: payload.allImagesWithinLimit === true,
      };
    },
    async checkHealth() {
      try {
        const baseUrl = await readBaseUrl();
        const payload = await sendJson(`${baseUrl}/api/health`, 'GET');
        return isRecord(payload) && payload.ok === true;
      } catch {
        return false;
      }
    },
    async updateSimulation(update) {
      const baseUrl = await readBaseUrl();
      await sendJson(`${baseUrl}/api/dev/simulation`, 'POST', update);
    },
  };
}
