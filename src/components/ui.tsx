import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ReportStatus } from '../domain/types';
import { colors, space } from '../theme/theme';

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'accent' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'danger' ? styles.dangerButton : styles.accentButton,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondary,
        pressed && !disabled ? styles.secondaryPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const STATUS_STYLES: Record<ReportStatus, { background: string; text: string }> = {
  saved: { background: colors.infoBg, text: colors.info },
  waiting_connection: { background: colors.warnBg, text: colors.warn },
  uploading: { background: colors.infoBg, text: colors.info },
  interrupted: { background: colors.warnBg, text: colors.warn },
  failed: { background: colors.badBg, text: colors.bad },
  uploaded: { background: colors.goodBg, text: colors.good },
};

export function StatusPill({ label, status }: { label: string; status: ReportStatus }) {
  const palette = STATUS_STYLES[status];
  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      <Text style={[styles.pillText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const width = Math.max(0, Math.min(100, progress));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${width}%` }]} />
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Card>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.emptyBody}>{label}</Text>
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  accentButton: {
    backgroundColor: colors.accent,
  },
  dangerButton: {
    backgroundColor: colors.bad,
  },
  buttonPressed: {
    backgroundColor: colors.accentPressed,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  secondaryPressed: {
    backgroundColor: colors.background,
  },
  secondaryText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  loading: {
    alignItems: 'center',
    gap: 10,
    padding: space.lg,
  },
  errorBox: {
    backgroundColor: colors.badBg,
    borderRadius: 12,
    padding: space.sm,
  },
  errorText: {
    color: colors.bad,
    fontSize: 14,
    lineHeight: 20,
  },
});
