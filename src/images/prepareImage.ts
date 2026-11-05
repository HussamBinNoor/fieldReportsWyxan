import ImageResizer from '@bam.tech/react-native-image-resizer';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { checksumFile, stripFileScheme, toFileUri } from '../files/reportFiles';
import { compressionStep, fitWithin, isWithinUploadLimit } from './compressionPlan';

export class ImagePreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagePreparationError';
  }
}

export type PreparedImage = {
  uri: string;
  path: string;
  size: number;
  width: number;
  height: number;
  checksum: string;
};

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'The photo could not be prepared.';
}

function friendlyPreparationError(error: unknown): ImagePreparationError {
  const message = messageFromUnknown(error);
  if (/space|storage|enospc|no space/i.test(message)) {
    return new ImagePreparationError('There is not enough free space to save this photo.');
  }
  if (/unsupported|format|decode|invalid bitmap|could not be read/i.test(message)) {
    return new ImagePreparationError('This photo could not be read. Try another one.');
  }
  return new ImagePreparationError('This photo could not be prepared. Try another one.');
}

async function removeQuietly(path: string | undefined): Promise<void> {
  if (!path) {
    return;
  }
  const target = stripFileScheme(path);
  if (await ReactNativeBlobUtil.fs.exists(target)) {
    await ReactNativeBlobUtil.fs.unlink(target);
  }
}

/**
 * Resize from the original each attempt. A failed attempt is deleted, so we
 * never compress the previous JPEG again.
 */
export async function prepareImage(input: {
  sourceUri: string;
  width: number;
  height: number;
  directory: string;
  imageId: string;
  mimeType?: string | null;
}): Promise<PreparedImage> {
  if (input.mimeType && !input.mimeType.startsWith('image/')) {
    throw new ImagePreparationError('That file is not a photo.');
  }

  const finalPath = `${input.directory}/${input.imageId}.jpg`;
  let lastSize = 0;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const step = compressionStep(attempt);
    if (!step) {
      break;
    }
    let resizedPath: string | undefined;
    try {
      const fitted = fitWithin(input.width, input.height, step.maxEdge);
      const resized = await ImageResizer.createResizedImage(
        input.sourceUri,
        fitted.width,
        fitted.height,
        'JPEG',
        step.quality,
        0,
        input.directory,
        false,
        { mode: 'contain', onlyScaleDown: true },
      );
      resizedPath = resized.path;
      const stat = await ReactNativeBlobUtil.fs.stat(resized.path);
      lastSize = Number(stat.size);
      if (!isWithinUploadLimit(lastSize)) {
        await removeQuietly(resized.path);
        resizedPath = undefined;
        continue;
      }

      if (stripFileScheme(resized.path) !== finalPath) {
        await removeQuietly(finalPath);
        await ReactNativeBlobUtil.fs.mv(resized.path, finalPath);
      }
      const checksum = await checksumFile(finalPath);
      const finalStat = await ReactNativeBlobUtil.fs.stat(finalPath);
      const size = Number(finalStat.size);
      if (!isWithinUploadLimit(size)) {
        await removeQuietly(finalPath);
        lastSize = size;
        continue;
      }
      return {
        uri: toFileUri(finalPath),
        path: finalPath,
        size,
        width: resized.width,
        height: resized.height,
        checksum,
      };
    } catch (error) {
      await removeQuietly(resizedPath);
      if (error instanceof ImagePreparationError) {
        throw error;
      }
      throw friendlyPreparationError(error);
    }
  }

  await removeQuietly(finalPath);
  throw new ImagePreparationError(
    `This photo is still ${Math.ceil(lastSize / (1024 * 1024))} MB after compression. It must be 5 MB or smaller, so it was not added.`,
  );
}
