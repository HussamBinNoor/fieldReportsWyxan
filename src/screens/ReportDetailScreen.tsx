import { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorNote, Screen, SecondaryButton, StatusPill } from '../components/ui';
import { getUploadStore, type ReportWithImages } from '../db/sqliteStore';
import { deliveryLabel } from '../domain/status';
import { formatBytes, formatWhen } from '../domain/format';
import type { RootStackParamList } from '../navigation/types';
import { kickUploadQueue } from '../upload/coordinator';
import { colors, space } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportDetail'>;

const IMAGE_LABEL = {
  pending: 'Waiting to upload',
  uploading: 'Uploading',
  uploaded: 'Confirmed by server',
  failed: 'Could not upload',
} as const;

export function ReportDetailScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<ReportWithImages | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const reports = await getUploadStore().listReports();
    const match = reports.find(item => item.id === route.params.reportId) ?? null;
    setReport(match);
    if (!match) {
      setError('This report is no longer on the device.');
    }
  }, [route.params.reportId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function retry() {
    if (!report) {
      return;
    }
    await getUploadStore().retryReport(report.id, Date.now());
    kickUploadQueue();
    await load();
  }

  if (!report) {
    return (
      <Screen>
        <View style={styles.content}>{error ? <ErrorNote message={error} /> : null}</View>
      </Screen>
    );
  }

  const canRetry = report.status === 'failed' || report.status === 'interrupted' || report.status === 'waiting_connection';

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}>
        <StatusPill label={deliveryLabel(report.status)} status={report.status} />
        <Text style={styles.description}>{report.description}</Text>
        <Text style={styles.meta}>Created {formatWhen(report.createdAt)}</Text>
        <Text style={styles.meta}>Report id {report.id}</Text>
        {report.uploadedAt ? <Text style={styles.meta}>Server confirmed {formatWhen(report.uploadedAt)}</Text> : (
          <Text style={styles.meta}>Not confirmed by the server yet.</Text>
        )}
        {report.lastError ? <ErrorNote message={report.lastError} /> : null}
        {report.images.map(image => (
          <View key={image.id} style={styles.imageCard}>
            <Image source={{ uri: image.localUri }} style={styles.image} />
            <Text style={styles.imageTitle}>{IMAGE_LABEL[image.uploadStatus]}</Text>
            <Text style={styles.meta}>
              Saved size {formatBytes(image.compressedSize)} · original {formatBytes(image.originalSize)}
            </Text>
            {image.lastError ? <Text style={styles.error}>{image.lastError}</Text> : null}
          </View>
        ))}
        {canRetry ? <SecondaryButton label="Retry upload" onPress={retry} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    gap: 12,
  },
  description: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
  },
  imageCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    paddingBottom: 12,
    gap: 6,
  },
  image: {
    width: '100%',
    height: 220,
    backgroundColor: colors.line,
  },
  imageTitle: {
    color: colors.ink,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  error: {
    color: colors.bad,
    paddingHorizontal: 12,
  },
});
