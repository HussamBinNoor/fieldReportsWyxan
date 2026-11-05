import { NativeModules, Platform } from 'react-native';

type NativeScheduler = {
  enqueue: (delayMs: number) => void;
  complete: (nextDelayMs: number) => void;
};

const native = NativeModules.UploadScheduler as NativeScheduler | undefined;

export function scheduleBackgroundUpload(delayMs: number): void {
  if (Platform.OS !== 'android' || !native) {
    return;
  }
  native.enqueue(Math.max(0, Math.round(delayMs)));
}

export function completeBackgroundUpload(nextDelayMs: number): void {
  if (Platform.OS !== 'android' || !native) {
    return;
  }
  native.complete(Math.round(nextDelayMs));
}
