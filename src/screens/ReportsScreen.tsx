import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, ErrorNote, ProgressBar, Screen, SecondaryButton, StatusPill } from '../components/ui';
import { deliveryLabel } from '../domain/status';
import { formatWhen } from '../domain/format';
import { useReportList } from '../hooks/useReports';
import type { ReportWithImages } from '../db/sqliteStore';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { getUploadStore } from '../db/sqliteStore';
import { kickUploadQueue } from '../upload/coordinator';
import { colors, space } from '../theme/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Reports'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ReportsScreen({ navigation }: Props) {
  const { reports, error, reload } = useReportList();

  async function retry(reportId: string) {
    const updated = await getUploadStore().retryReport(reportId, Date.now());
    if (updated) {
      kickUploadQueue();
      await reload();
    }
  }

  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.content}
        data={reports}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>My reports</Text>
            <Text style={styles.subtitle}>These are stored on this device. A confirmed report has been accepted by the server.</Text>
            {error ? <ErrorNote message={error} /> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="Nothing saved yet" body="Reports you create appear here even when the phone is offline." />
        }
        renderItem={({ item }) => <ReportCard report={item} onOpen={() => navigation.navigate('ReportDetail', { reportId: item.id })} onRetry={() => retry(item.id)} />}
      />
    </Screen>
  );
}

function ReportCard({
  report,
  onOpen,
  onRetry,
}: {
  report: ReportWithImages;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const uploaded = report.images.filter(image => image.uploadStatus === 'uploaded').length;
  const canRetry = report.status === 'failed' || report.status === 'interrupted' || report.status === 'waiting_connection';
  return (
    <Pressable onPress={onOpen} style={styles.card}>
      <StatusPill label={deliveryLabel(report.status)} status={report.status} />
      <Text style={styles.description}>{report.description}</Text>
      <ScrollThumbs images={report.images.map(image => image.localUri)} />
      <Text style={styles.meta}>{formatWhen(report.createdAt)}</Text>
      <Text style={styles.meta}>
        {uploaded} of {report.images.length} photos confirmed
      </Text>
      {report.status === 'uploading' ? <ProgressBar progress={report.uploadProgress} /> : null}
      {report.lastError ? <Text style={styles.error}>{report.lastError}</Text> : null}
      {canRetry ? <SecondaryButton label="Retry upload" onPress={onRetry} /> : null}
    </Pressable>
  );
}

function ScrollThumbs({ images }: { images: string[] }) {
  return (
    <View style={styles.thumbs}>
      {images.slice(0, 5).map(uri => (
        <Image key={uri} source={{ uri }} style={styles.thumb} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    gap: 12,
    paddingBottom: 32,
  },
  header: {
    gap: 8,
    marginBottom: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: 8,
  },
  description: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  error: {
    color: colors.bad,
    fontSize: 13,
    lineHeight: 18,
  },
  thumbs: {
    flexDirection: 'row',
    gap: 8,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.line,
  },
});
