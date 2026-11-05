import { useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorNote, PrimaryButton, Screen, SecondaryButton } from '../components/ui';
import { formatBytes } from '../domain/format';
import { validateDescription, validateImageCount } from '../domain/validation';
import { choosePhotos, takePhoto, type SelectedAsset } from '../images/picker';
import { MAX_IMAGES_PER_REPORT } from '../config/constants';
import type { RootStackParamList } from '../navigation/types';
import { saveReport } from '../reports/saveReport';
import { colors, space } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateReport'>;

export function CreateReportScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState('');
  const [assets, setAssets] = useState<SelectedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addAssets(next: SelectedAsset[]) {
    setAssets(current => {
      const room = MAX_IMAGES_PER_REPORT - current.length;
      return [...current, ...next.slice(0, room)];
    });
  }

  async function onCamera() {
    setError(null);
    Keyboard.dismiss();
    const result = await takePhoto();
    Keyboard.dismiss();
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.asset) {
      addAssets([result.asset]);
    }
  }

  async function onGallery() {
    setError(null);
    Keyboard.dismiss();
    const result = await choosePhotos(MAX_IMAGES_PER_REPORT - assets.length);
    Keyboard.dismiss();
    if (result.error) {
      setError(result.error);
      return;
    }
    addAssets(result.assets);
  }

  async function onSubmit() {
    const descriptionError = validateDescription(description);
    const countError = validateImageCount(assets.length);
    if (descriptionError || countError) {
      setError(descriptionError ?? countError);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveReport({ description, assets });
      setNotice('Saved on this device. It has not been confirmed by the server yet.');
      setDescription('');
      setAssets([]);
      setTimeout(() => navigation.goBack(), 700);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The report could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="What did you inspect?"
            placeholderTextColor={colors.muted}
            style={styles.input}
            textAlignVertical="top"
          />

          <View style={styles.headerRow}>
            <Text style={styles.label}>Photos</Text>
            <Text style={styles.count}>
              {assets.length}/{MAX_IMAGES_PER_REPORT}
            </Text>
          </View>
          <Text style={styles.help}>Add between 1 and 5 photos. Each one is compressed below 5 MB before it is saved.</Text>

          <View style={styles.actions}>
            <View style={styles.action}>
              <SecondaryButton label="Camera" onPress={onCamera} disabled={saving || assets.length >= 5} />
            </View>
            <View style={styles.action}>
              <SecondaryButton label="Gallery" onPress={onGallery} disabled={saving || assets.length >= 5} />
            </View>
          </View>

          <View style={styles.grid}>
            {assets.map((asset, index) => (
              <View key={`${asset.uri}-${index}`} style={styles.tile}>
                <Image source={{ uri: asset.uri }} style={styles.preview} />
                <Text style={styles.size}>{asset.fileSize == null ? 'Size pending' : formatBytes(asset.fileSize)}</Text>
                <Pressable
                  onPress={() => setAssets(current => current.filter((_, itemIndex) => itemIndex !== index))}
                  style={styles.remove}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>

          {error ? <ErrorNote message={error} /> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <PrimaryButton
            label={saving ? 'Saving on device…' : 'Save report'}
            onPress={onSubmit}
            disabled={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: space.md,
    gap: 12,
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    color: colors.ink,
    fontSize: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  count: {
    color: colors.accent,
    fontWeight: '700',
  },
  help: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: 120,
    backgroundColor: colors.line,
  },
  size: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  remove: {
    padding: 10,
  },
  removeText: {
    color: colors.bad,
    fontWeight: '700',
  },
  notice: {
    color: colors.good,
    fontSize: 15,
    lineHeight: 21,
  },
});
