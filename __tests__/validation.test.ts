import { MAX_DESCRIPTION_LENGTH, MAX_IMAGE_BYTES } from '../src/config/constants';
import { validateDescription, validateImageByteSize, validateImageCount } from '../src/domain/validation';

describe('report validation', () => {
  test('requires a non-empty description', () => {
    expect(validateDescription('   ')).toMatch(/description/i);
    expect(validateDescription('North wall crack')).toBeNull();
  });

  test('rejects descriptions over the limit', () => {
    expect(validateDescription('a'.repeat(MAX_DESCRIPTION_LENGTH + 1))).toMatch(/under/i);
  });

  test('requires between 1 and 5 photos', () => {
    expect(validateImageCount(0)).toMatch(/at least one/i);
    expect(validateImageCount(1)).toBeNull();
    expect(validateImageCount(5)).toBeNull();
    expect(validateImageCount(6)).toMatch(/at most 5/i);
  });

  test('rejects a photo over 5 MB and accepts the exact limit', () => {
    expect(validateImageByteSize(MAX_IMAGE_BYTES)).toBeNull();
    expect(validateImageByteSize(MAX_IMAGE_BYTES + 1)).toMatch(/5 MB/);
    expect(validateImageByteSize(0)).toMatch(/5 MB/);
  });
});
