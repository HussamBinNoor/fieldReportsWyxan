import { Image } from 'react-native';
import { getUploadStore } from '../db/sqliteStore';
import { createId, createReportIdentity } from '../domain/ids';
import { validateDescription, validateImageByteSize, validateImageCount } from '../domain/validation';
import { deleteReportDirectory, reportDirectory } from '../files/reportFiles';
import { ImagePreparationError, prepareImage } from '../images/prepareImage';
import type { SelectedAsset } from '../images/picker';
import { kickUploadQueue } from '../upload/coordinator';
import { emitUploadEvent } from '../upload/events';

function readDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new ImagePreparationError('The photo dimensions could not be read.')),
    );
  });
}

export async function saveReport(input: {
  description: string;
  assets: SelectedAsset[];
}): Promise<{ id: string }> {
  const descriptionError = validateDescription(input.description);
  if (descriptionError) {
    throw new ImagePreparationError(descriptionError);
  }
  const countError = validateImageCount(input.assets.length);
  if (countError) {
    throw new ImagePreparationError(countError);
  }

  const identity = createReportIdentity();
  const directory = await reportDirectory(identity.id);
  const createdAt = Date.now();
  const images = [];

  try {
    for (const asset of input.assets) {
      const dimensions =
        asset.width && asset.height
          ? { width: asset.width, height: asset.height }
          : await readDimensions(asset.uri);
      const imageId = createId();
      const prepared = await prepareImage({
        sourceUri: asset.uri,
        width: dimensions.width,
        height: dimensions.height,
        directory,
        imageId,
        mimeType: asset.type,
      });
      const sizeError = validateImageByteSize(prepared.size);
      if (sizeError) {
        throw new ImagePreparationError(sizeError);
      }
      images.push({
        id: imageId,
        localUri: prepared.uri,
        originalSize: asset.fileSize ?? prepared.size,
        compressedSize: prepared.size,
        mimeType: 'image/jpeg',
        checksum: prepared.checksum,
        width: prepared.width,
        height: prepared.height,
      });
    }

    await getUploadStore().createReport({
      id: identity.id,
      description: input.description,
      idempotencyKey: identity.idempotencyKey,
      createdAt,
      images,
    });
  } catch (error) {
    await deleteReportDirectory(identity.id);
    throw error;
  }

  emitUploadEvent();
  kickUploadQueue();
  return { id: identity.id };
}
