import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';

export type SelectedAsset = {
  uri: string;
  fileName: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  type: string | null;
};

async function requestPermission(permission: string): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.request(permission as never);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function ensureCameraPermission(): Promise<string | null> {
  const granted = await requestPermission(PermissionsAndroid.PERMISSIONS.CAMERA);
  return granted ? null : 'Camera permission is needed to take a photo.';
}

async function ensureGalleryPermission(): Promise<string | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  if (Number(Platform.Version) >= 33) {
    const permission = PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES;
    const granted = await requestPermission(permission ?? 'android.permission.READ_MEDIA_IMAGES');
    return granted ? null : 'Photo permission is needed to choose an existing picture.';
  }
  const granted = await requestPermission(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
  return granted ? null : 'Storage permission is needed to choose an existing picture.';
}

function toSelected(asset: Asset): SelectedAsset | null {
  if (!asset.uri) {
    return null;
  }
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    fileSize: typeof asset.fileSize === 'number' ? asset.fileSize : null,
    width: typeof asset.width === 'number' ? asset.width : null,
    height: typeof asset.height === 'number' ? asset.height : null,
    type: asset.type ?? null,
  };
}

function pickerError(code: string | undefined, fallback: string): string {
  if (code === 'permission') {
    return 'Permission was denied.';
  }
  if (code === 'camera_unavailable') {
    return 'No camera is available on this device.';
  }
  return fallback;
}

export async function takePhoto(): Promise<{ asset: SelectedAsset | null; error: string | null }> {
  const permissionError = await ensureCameraPermission();
  if (permissionError) {
    return { asset: null, error: permissionError };
  }
  const response = await launchCamera({
    mediaType: 'photo',
    saveToPhotos: false,
    cameraType: 'back',
    includeExtra: true,
  });
  if (response.didCancel) {
    return { asset: null, error: null };
  }
  if (response.errorCode) {
    return { asset: null, error: pickerError(response.errorCode, response.errorMessage ?? 'The camera could not be opened.') };
  }
  const asset = response.assets?.[0] ? toSelected(response.assets[0]) : null;
  if (!asset) {
    return { asset: null, error: 'The camera did not return a photo.' };
  }
  return { asset, error: null };
}

export async function choosePhotos(
  limit: number,
): Promise<{ assets: SelectedAsset[]; error: string | null }> {
  if (limit <= 0) {
    return { assets: [], error: 'This report already has 5 photos.' };
  }
  const permissionError = await ensureGalleryPermission();
  if (permissionError) {
    return { assets: [], error: permissionError };
  }
  const response = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: limit,
    includeExtra: true,
  });
  if (response.didCancel) {
    return { assets: [], error: null };
  }
  if (response.errorCode) {
    return {
      assets: [],
      error: pickerError(response.errorCode, response.errorMessage ?? 'The photo library could not be opened.'),
    };
  }
  const assets = (response.assets ?? [])
    .map(toSelected)
    .filter((asset): asset is SelectedAsset => asset !== null)
    .slice(0, limit);
  return { assets, error: null };
}
