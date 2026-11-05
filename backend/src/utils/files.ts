import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error('INVALID_ID');
  }
  return value.toLowerCase();
}

export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => {
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function safeJoin(root: string, ...parts: string[]): string {
  const base = path.resolve(root);
  const full = path.resolve(base, ...parts);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error('INVALID_ID');
  }
  return full;
}

export async function removeQuietly(filePath: string): Promise<void> {
  await fs.promises.unlink(filePath).catch(() => undefined);
}
