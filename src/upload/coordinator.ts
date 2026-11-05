import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { EMULATOR_BACKEND_URL } from '../config/constants';
import { getUploadStore } from '../db/sqliteStore';
import { normalizeBaseUrl } from '../domain/format';
import { createId } from '../domain/ids';
import { readLocalFile } from '../files/reportFiles';
import { createApiClient } from '../network/apiClient';
import { processQueue } from './engine';
import { emitUploadEvent } from './events';
import { scheduleBackgroundUpload } from './scheduler';

const bootId = createId();
let running = false;
let rerun = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function readBackendUrl(): Promise<string> {
  const stored = await getUploadStore().getSetting('backend_url');
  return normalizeBaseUrl(stored || EMULATOR_BACKEND_URL);
}

export async function isDeviceOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable !== false;
}

export async function runUploadPass(): Promise<{ nextDelayMs: number }> {
  const store = getUploadStore();
  const outcomes = await processQueue({
    store,
    uploader: createApiClient(readBackendUrl),
    bootId,
    isOnline: isDeviceOnline,
    fileInfo: readLocalFile,
    onChange: () => {
      emitUploadEvent();
    },
  });

  if (outcomes.some(outcome => outcome.result === 'uploaded')) {
    await store.setSetting('last_sync_at', String(Date.now()));
    emitUploadEvent();
  }

  const now = Date.now();
  const eligible = await store.listEligibleJobs(now);
  if (eligible.length > 0) {
    return { nextDelayMs: 0 };
  }
  const future = await store.soonestFutureAttempt(now);
  if (future == null) {
    return { nextDelayMs: -1 };
  }
  return { nextDelayMs: Math.max(0, future - now) };
}

async function pump(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    let spins = 0;
    do {
      rerun = false;
      spins += 1;
      const { nextDelayMs } = await runUploadPass();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (nextDelayMs === 0 && spins < 3) {
        rerun = true;
      } else if (nextDelayMs > 0) {
        timer = setTimeout(() => {
          pump().catch(() => undefined);
        }, nextDelayMs);
        scheduleBackgroundUpload(nextDelayMs);
      }
    } while (rerun);
  } finally {
    running = false;
    if (rerun) {
      pump().catch(() => undefined);
    }
  }
}

export function kickUploadQueue(): void {
  pump().catch(() => undefined);
  scheduleBackgroundUpload(0);
}

export function startUploadCoordinator(): () => void {
  const unsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected === true && state.isInternetReachable !== false) {
      kickUploadQueue();
    }
  });
  const appState = AppState.addEventListener('change', next => {
    if (next === 'active') {
      kickUploadQueue();
    } else if (next === 'background') {
      scheduleBackgroundUpload(0);
    }
  });
  kickUploadQueue();
  return () => {
    unsubscribe();
    appState.remove();
    if (timer) {
      clearTimeout(timer);
    }
  };
}
