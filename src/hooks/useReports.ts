import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getUploadStore, type ReportWithImages } from '../db/sqliteStore';
import { subscribeUploadEvents } from '../upload/events';

export function useReportList(): {
  reports: ReportWithImages[];
  error: string | null;
  reload: () => Promise<void>;
} {
  const [reports, setReports] = useState<ReportWithImages[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setReports(await getUploadStore().listReports());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Reports could not be loaded.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      reload();
      const unsubscribe = subscribeUploadEvents(() => {
        if (active) {
          reload().catch(() => undefined);
        }
      });
      return () => {
        active = false;
        unsubscribe();
      };
    }, [reload]),
  );

  return { reports, error, reload };
}
