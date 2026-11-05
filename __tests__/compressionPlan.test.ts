import { MAX_IMAGE_BYTES } from '../src/config/constants';
import {
  COMPRESSION_STEPS,
  compressionStep,
  fitWithin,
  isWithinUploadLimit,
} from '../src/images/compressionPlan';

describe('compression plan', () => {
  test('fits a landscape photo inside the longest edge without stretching', () => {
    expect(fitWithin(4000, 2000, 2048)).toEqual({ width: 2048, height: 1024 });
  });

  test('fits a portrait photo and does not enlarge a small one', () => {
    expect(fitWithin(1200, 3000, 1600)).toEqual({ width: 640, height: 1600 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  test('reduces the longest edge and quality on later attempts', () => {
    expect(COMPRESSION_STEPS[0]).toEqual({ maxEdge: 2048, quality: 85 });
    expect(compressionStep(3)?.quality).toBeLessThan(compressionStep(0)?.quality ?? 100);
    expect(compressionStep(3)?.maxEdge).toBeLessThan(compressionStep(0)?.maxEdge ?? 9999);
    expect(compressionStep(COMPRESSION_STEPS.length)).toBeNull();
  });

  test('treats 5,000,000 bytes as the last acceptable size', () => {
    expect(isWithinUploadLimit(MAX_IMAGE_BYTES)).toBe(true);
    expect(isWithinUploadLimit(MAX_IMAGE_BYTES + 1)).toBe(false);
    expect(MAX_IMAGE_BYTES).toBe(5_000_000);
  });
});
