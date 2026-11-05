/** Hard upload limit shared by the app and the backend. */
export const MAX_IMAGE_BYTES = 5_000_000;

export const MAX_IMAGES_PER_REPORT = 5;
export const MIN_IMAGES_PER_REPORT = 1;
export const MAX_DESCRIPTION_LENGTH = 4_000;

/** Android emulator alias for the host machine's localhost. */
export const EMULATOR_BACKEND_URL = 'http://10.0.2.2:4000';

export const REQUEST_TIMEOUT_MS = 45_000;

/** A lock older than this, held by another JS runtime, is treated as abandoned. */
export const STALE_LOCK_MS = 20_000;
