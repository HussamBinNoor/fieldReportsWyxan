import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import { ErrorNote, PrimaryButton, Screen, SecondaryButton } from '../components/ui';
import { EMULATOR_BACKEND_URL } from '../config/constants';
import { getUploadStore } from '../db/sqliteStore';
import { formatWhen, normalizeBaseUrl } from '../domain/format';
import { createApiClient, type SimulationUpdate } from '../network/apiClient';
import { resetLocalData } from '../reports/resetLocalData';
import { kickUploadQueue, readBackendUrl } from '../upload/coordinator';
import { colors, space } from '../theme/theme';

const PRESETS: Array<{ label: string; update: SimulationUpdate }> = [
  { label: 'Clear simulation', update: { latencyMs: 0, dropNext: 0, failNext: 0, failStatus: 500, hang: false, refuseUploads: false } },
  { label: 'Slow network (8s)', update: { latencyMs: 8000, dropNext: 0, failNext: 0, failStatus: 500, hang: false, refuseUploads: false } },
  { label: 'Drop next 2 uploads', update: { latencyMs: 0, dropNext: 2, failNext: 0, failStatus: 500, hang: false, refuseUploads: false } },
  { label: 'Next request HTTP 500', update: { latencyMs: 0, dropNext: 0, failNext: 1, failStatus: 500, hang: false, refuseUploads: false } },
  { label: 'Next request HTTP 503', update: { latencyMs: 0, dropNext: 0, failNext: 1, failStatus: 503, hang: false, refuseUploads: false } },
  { label: 'Hang until timeout', update: { latencyMs: 0, dropNext: 0, failNext: 0, failStatus: 500, hang: true, refuseUploads: false } },
  { label: 'Refuse uploads', update: { latencyMs: 0, dropNext: 0, failNext: 0, failStatus: 503, hang: false, refuseUploads: true } },
];

export function SettingsScreen() {
  const netInfo = useNetInfo();
  const [url, setUrl] = useState(EMULATOR_BACKEND_URL);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const store = getUploadStore();
    setUrl(await readBackendUrl());
    setPending(await store.countOpenJobs());
    const sync = await store.getSetting('last_sync_at');
    setLastSync(sync ? Number(sync) : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function saveUrl(next: string) {
    const normalized = normalizeBaseUrl(next);
    if (!/^https?:\/\/.+/i.test(normalized)) {
      setError('Enter a full http or https address.');
      return;
    }
    await getUploadStore().setSetting('backend_url', normalized);
    setUrl(normalized);
    setError(null);
    setMessage('Backend address saved on this device.');
    kickUploadQueue();
  }

  async function applySimulation(update: SimulationUpdate) {
    setError(null);
    try {
      const client = createApiClient(readBackendUrl);
      await client.updateSimulation(update);
      setMessage(update.hang ? 'The next upload will hang until the app times out, then retry.' : 'Failure simulation updated on the server.');
    } catch {
      setError('The server could not be reached, so the simulation was not changed.');
    }
  }

  function confirmReset() {
    Alert.alert(
      'Reset this device?',
      'This deletes local reports, queued uploads, and photos saved by the app. Reports already stored on the server stay there. The backend address is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete local data',
          style: 'destructive',
          onPress: () => {
            resetLocalData()
              .then(async () => {
                setMessage('Local reports were deleted. Server reports were not changed.');
                await load();
              })
              .catch(() => setError('Local data could not be reset.'));
          },
        },
      ],
    );
  }

  const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Diagnostics</Text>
        <Text style={styles.subtitle}>Connection, queue, and development failure controls.</Text>

        <Text style={styles.label}>Backend address</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <SecondaryButton label="Use emulator" onPress={() => saveUrl(EMULATOR_BACKEND_URL)} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Save address" onPress={() => saveUrl(url)} />
          </View>
        </View>
        <Text style={styles.help}>
          Emulator: {EMULATOR_BACKEND_URL}. A physical phone needs this computer's LAN address, such as http://192.168.1.20:4000.
        </Text>

        <View style={styles.panel}>
          <Text style={styles.panelText}>Network: {online ? 'Online' : 'Offline or unreachable'}</Text>
          <Text style={styles.panelText}>Open uploads: {pending}</Text>
          <Text style={styles.panelText}>Last successful sync: {formatWhen(lastSync ?? 0)}</Text>
        </View>

        <Text style={styles.label}>Failure simulation</Text>
        <Text style={styles.help}>
          These controls affect upload and finalize requests only. Health checks and the server report list stay available. They do nothing when the API is started with NODE_ENV=production.
        </Text>
        {PRESETS.map(preset => (
          <SecondaryButton key={preset.label} label={preset.label} onPress={() => applySimulation(preset.update)} />
        ))}

        {message ? <Text style={styles.notice}>{message}</Text> : null}
        {error ? <ErrorNote message={error} /> : null}

        <PrimaryButton label="Reset local data" tone="danger" onPress={confirmReset} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    gap: 12,
    paddingBottom: 40,
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
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    color: colors.ink,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: { flex: 1 },
  help: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  panelText: {
    color: colors.ink,
    fontSize: 15,
  },
  notice: {
    color: colors.good,
    fontSize: 14,
    lineHeight: 20,
  },
});
