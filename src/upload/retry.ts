const SCHEDULE_MS = [0, 2_000, 5_000, 15_000, 30_000];
const MAX_DELAY_MS = 5 * 60 * 1000;

/**
 * Delay before the given 1-based attempt. The first attempt is immediate.
 * Later attempts back off and add a little jitter so many devices do not
 * retry on the same second.
 */
export function delayBeforeAttempt(
  attemptNumber: number,
  random: () => number = Math.random,
): number {
  if (!Number.isFinite(attemptNumber) || attemptNumber <= 1) {
    return 0;
  }

  let base: number;
  if (attemptNumber <= SCHEDULE_MS.length) {
    base = SCHEDULE_MS[attemptNumber - 1];
  } else {
    const extraSteps = attemptNumber - SCHEDULE_MS.length;
    base = Math.min(SCHEDULE_MS[SCHEDULE_MS.length - 1] * 2 ** extraSteps, MAX_DELAY_MS);
  }

  if (base <= 0) {
    return 0;
  }

  const jitterCeiling = Math.min(1_000, Math.floor(base * 0.2));
  const jitter = Math.floor(Math.min(0.999, Math.max(0, random())) * jitterCeiling);
  return Math.min(base + jitter, MAX_DELAY_MS);
}

export function parseRetryAfterMs(header: string | null, now: number): number | null {
  if (!header) {
    return null;
  }
  const trimmed = header.trim();
  if (!trimmed) {
    return null;
  }
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_DELAY_MS);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(0, dateMs - now), MAX_DELAY_MS);
  }
  return null;
}
