export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Unknown size';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatWhen(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'Not yet';
  }
  return new Date(timestamp).toLocaleString();
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
