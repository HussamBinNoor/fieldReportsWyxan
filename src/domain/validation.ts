import {
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGES_PER_REPORT,
  MIN_IMAGES_PER_REPORT,
} from '../config/constants';
import { isWithinUploadLimit } from '../images/compressionPlan';

export function validateDescription(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Enter a description before saving the report.';
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
  return null;
}

export function validateImageCount(count: number): string | null {
  if (!Number.isInteger(count) || count < MIN_IMAGES_PER_REPORT) {
    return 'Add at least one photo.';
  }
  if (count > MAX_IMAGES_PER_REPORT) {
    return 'A report can include at most 5 photos.';
  }
  return null;
}

export function validateImageByteSize(bytes: number): string | null {
  if (!isWithinUploadLimit(bytes)) {
    return 'Each photo must be 5 MB or smaller.';
  }
  return null;
}
