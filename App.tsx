import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from './src/db/database';
import { RootNavigator } from './src/navigation/RootNavigator';
import { startUploadCoordinator } from './src/upload/coordinator';
import { colors } from './src/theme/theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    initDatabase()
      .then(() => {
        if (cancelled) {
          return;
        }
        stop = startUploadCoordinator();
        setReady(true);
      })
      .catch(initError => {
        if (!cancelled) {
          setError(initError instanceof Error ? initError.message : 'The local database could not be opened.');
        }
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.title}>Field Reports could not start</Text>
          <Text style={styles.body}>{error}</Text>
        </View>
      ) : ready ? (
        <RootNavigator />
      ) : (
        <View style={styles.center}>
          <Text style={styles.body}>Opening saved reports…</Text>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});
