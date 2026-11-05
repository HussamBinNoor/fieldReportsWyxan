import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, EmptyState, ErrorNote, PrimaryButton, Screen, StatusPill } from '../components/ui';
import { deliveryLabel } from '../domain/status';
import { formatWhen } from '../domain/format';
import { useReportList } from '../hooks/useReports';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { colors, space } from '../theme/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

function networkLabel(isConnected: boolean | null, isInternetReachable: boolean | null): string {
  if (isConnected === false) {
    return 'Offline';
  }
  if (isInternetReachable === false) {
    return 'No internet';
  }
  if (isConnected) {
    return 'Online';
  }
  return 'Checking';
}

export function DashboardScreen({ navigation }: Props) {
  const { reports, error } = useReportList();
  const netInfo = useNetInfo();
  const counts = useMemo(() => {
    return {
      total: reports.length,
      waiting: reports.filter(report => report.status === 'saved' || report.status === 'waiting_connection').length,
      uploading: reports.filter(report => report.status === 'uploading').length,
      uploaded: reports.filter(report => report.status === 'uploaded').length,
      attention: reports.filter(report => report.status === 'interrupted' || report.status === 'failed').length,
    };
  }, [reports]);
  const recent = reports.slice(0, 5);
  const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;

  let queue = 'No reports are waiting.';
  if (counts.uploading > 0) {
    queue = 'A report is uploading now.';
  } else if (!online && counts.waiting + counts.attention > 0) {
    queue = 'Saved reports will upload when a connection is available.';
  } else if (counts.attention > 0) {
    queue = 'An upload was interrupted. It will retry on its own.';
  } else if (counts.waiting > 0) {
    queue = 'Reports are queued on this device.';
  } else if (counts.uploaded > 0) {
    queue = 'Every saved report has been confirmed by the server.';
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Field inspection</Text>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Saved on this device first. Sent when the network allows.</Text>

        <View style={styles.networkRow}>
          <View style={[styles.dot, { backgroundColor: online ? colors.good : colors.warn }]} />
          <Text style={styles.networkText}>
            {networkLabel(netInfo.isConnected, netInfo.isInternetReachable)}
          </Text>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <View style={styles.stats}>
          <Stat label="On device" value={counts.total} />
          <Stat label="Waiting" value={counts.waiting} />
          <Stat label="Uploading" value={counts.uploading} />
          <Stat label="Confirmed" value={counts.uploaded} />
          <Stat label="Needs attention" value={counts.attention} />
        </View>

        <Card>
          <Text style={styles.cardTitle}>Upload queue</Text>
          <Text style={styles.cardBody}>{queue}</Text>
        </Card>

        <PrimaryButton label="Create report" onPress={() => navigation.navigate('CreateReport')} />

        <Text style={styles.section}>Recent</Text>
        {recent.length === 0 ? (
          <EmptyState
            title="No reports yet"
            body="Create a report with a description and at least one photo. It stays on this device until the server confirms it."
          />
        ) : (
          recent.map(report => (
            <Pressable key={report.id} onPress={() => navigation.navigate('ReportDetail', { reportId: report.id })}>
              <Card style={styles.recentCard}>
                <StatusPill label={deliveryLabel(report.status)} status={report.status} />
                <Text style={styles.reportTitle} numberOfLines={2}>
                  {report.description}
                </Text>
                <Text style={styles.meta}>
                  {formatWhen(report.createdAt)} · {report.images.length} photo
                  {report.images.length === 1 ? '' : 's'}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    gap: 14,
    paddingBottom: 32,
  },
  kicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '700',
    marginTop: -6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  networkText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  stat: {
    width: '31%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  statValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  section: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  recentCard: {
    gap: 8,
  },
  reportTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
});
