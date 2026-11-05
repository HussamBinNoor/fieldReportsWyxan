import ReactNativeBlobUtil from 'react-native-blob-util';

const ROOT_NAME = 'field-reports';

export function stripFileScheme(uri: string): string {
  if (uri.startsWith('file://')) {
    return decodeURI(uri.slice('file://'.length));
  }
  return uri;
}

export function toFileUri(path: string): string {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
}

export function reportRoot(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${ROOT_NAME}`;
}

export async function ensureReportRoot(): Promise<string> {
  const root = reportRoot();
  if (!(await ReactNativeBlobUtil.fs.exists(root))) {
    await ReactNativeBlobUtil.fs.mkdir(root);
  }
  return root;
}

export async function reportDirectory(reportId: string): Promise<string> {
  const root = await ensureReportRoot();
  const directory = `${root}/${reportId}`;
  if (!(await ReactNativeBlobUtil.fs.exists(directory))) {
    await ReactNativeBlobUtil.fs.mkdir(directory);
  }
  return directory;
}

export async function deleteReportDirectory(reportId: string): Promise<void> {
  const directory = `${reportRoot()}/${reportId}`;
  if (await ReactNativeBlobUtil.fs.exists(directory)) {
    await ReactNativeBlobUtil.fs.unlink(directory);
  }
}

export async function deleteReportRoot(): Promise<void> {
  const root = reportRoot();
  if (await ReactNativeBlobUtil.fs.exists(root)) {
    await ReactNativeBlobUtil.fs.unlink(root);
  }
}

export async function readLocalFile(uri: string): Promise<{ exists: boolean; size: number }> {
  const path = stripFileScheme(uri);
  const exists = await ReactNativeBlobUtil.fs.exists(path);
  if (!exists) {
    return { exists: false, size: 0 };
  }
  const stat = await ReactNativeBlobUtil.fs.stat(path);
  return { exists: stat.type === 'file', size: Number(stat.size) };
}

export async function checksumFile(uri: string): Promise<string> {
  return ReactNativeBlobUtil.fs.hash(stripFileScheme(uri), 'sha256');
}
