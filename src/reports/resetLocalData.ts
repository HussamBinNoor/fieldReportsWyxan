import { getUploadStore } from '../db/sqliteStore';
import { deleteReportRoot, ensureReportRoot } from '../files/reportFiles';
import { emitUploadEvent } from '../upload/events';

/**
 * Clears this device only. Reports already confirmed by the server stay there.
 * The saved backend address is kept so the phone can still reach the API.
 */
export async function resetLocalData(): Promise<void> {
  await getUploadStore().resetAll();
  await deleteReportRoot();
  await ensureReportRoot();
  emitUploadEvent();
}
