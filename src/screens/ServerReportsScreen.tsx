import { useCallback, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EmptyState, ErrorNote, LoadingState, Screen, SecondaryButton } from '../components/ui';
import { formatBytes, formatWhen } from '../domain/format';
import type { ServerReport } from '../domain/types';
import { createApiClient, serverImageUrl, type ServerSummary } from '../network/apiClient';
import { getUploadStore } from '../db/sqliteStore';
import { readBackendUrl } from '../upload/coordinator';
import { colors, space } from '../theme/theme';

export function ServerReportsScreen() {
  const [reports, setReports] = useState<ServerReport[]>([]);
  const [summary, setSummary] = useState<ServerSummary | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const url = await readBackendUrl();
      const client = createApiClient(async () => url);
      const [nextReports, nextSummary] = await Promise.all([client.fetchReports(), client.fetchSummary()]);
      setBaseUrl(url);
      setReports(nextReports);
      setSummary(nextSummary);
      setError(null);
      await getUploadStore().setSetting('last_sync_at', String(Date.now()));
    } catch {
      setReports([]);
      setSummary(null);
      setError('The server could not be reached. This list is not using reports saved on the device.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('initial').catch(() => undefined);
    }, [load]),
  );

  if (loading && reports.length === 0 && !error) {
    return (
      <Screen>
        <LoadingState label="Fetching confirmed reports from the server" />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.content}
        data={reports}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Server reports</Text>
            <Text style={styles.subtitle}>Loaded with a network request. Reports that only exist on this phone are not shown here.</Text>
            {summary ? (
              <View style={styles.summary}>
                <Text style={styles.summaryText}>{summary.completedReports} completed</Text>
                <Text style={styles.summaryText}>{summary.images} photos</Text>
                <Text style={styles.summaryText}>Largest {formatBytes(summary.largestImageBytes)}</Text>
                <Text style={styles.summaryText}>
                  {summary.allImagesWithinLimit ? 'All photos are within 5 MB' : 'A photo exceeds 5 MB'}
                </Text>
              </View>
            ) : null}
            {error ? <ErrorNote message={error} /> : null}
            {error ? <SecondaryButton label="Try again" onPress={() => load('initial')} /> : null}
          </View>
        }
        ListEmptyComponent={
          error ? undefined : (
            <EmptyState
              title="No confirmed reports"
              body="When the server accepts a report, it appears here after you refresh."
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.description}>{item.description}</Text>
            <Text style={styles.meta}>Server id {item.id}</Text>
            <Text style={styles.meta}>
              Completed {item.completedAt ? formatWhen(Date.parse(item.completedAt)) : 'unknown'}
            </Text>
            <View style={styles.thumbs}>
              {item.images.map(image => (
                <View key={image.id} style={styles.thumbWrap}>
                  <Image source={{ uri: serverImageUrl(baseUrl, item.id, image.id) }} style={styles.thumb} />
                  <Text style={styles.size}>{formatBytes(image.sizeBytes)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    gap: 12,
    paddingBottom: 32,
  },
  header: {
    gap: 10,
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
  summary: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  summaryText: {
    color: colors.ink,
    fontSize: 14,
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
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumbWrap: {
    width: 88,
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: 8,
    backgroundColor: colors.line,
  },
  size: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
});
