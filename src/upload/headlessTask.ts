import { initDatabase } from '../db/database';
import { completeBackgroundUpload } from './scheduler';
import { runUploadPass } from './coordinator';

export async function runHeadlessUpload(): Promise<void> {
  let nextDelay = -1;
  try {
    await initDatabase();
    const result = await runUploadPass();
    nextDelay = result.nextDelayMs;
  } catch {
    nextDelay = 30_000;
  } finally {
    completeBackgroundUpload(nextDelay);
  }
}
