import { MAX_IMAGE_BYTES } from '../config/constants';

export type CompressionStep = {
  maxEdge: number;
  quality: number;
};

/**
 * Each step starts from the original file. We do not feed an already
 * compressed JPEG back into the encoder unless the previous attempt was
 * discarded for being over the limit.
 */
export const COMPRESSION_STEPS: CompressionStep[] = [
  { maxEdge: 2048, quality: 85 },
  { maxEdge: 1600, quality: 75 },
  { maxEdge: 1280, quality: 65 },
  { maxEdge: 1024, quality: 55 },
  { maxEdge: 800, quality: 45 },
  { maxEdge: 640, quality: 35 },
];

export function compressionStep(attemptIndex: number): CompressionStep | null {
  return COMPRESSION_STEPS[attemptIndex] ?? null;
}

export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The photo dimensions could not be read.');
  }
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
    throw new Error('The photo could not be resized.');
  }
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function isWithinUploadLimit(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_IMAGE_BYTES;
}
