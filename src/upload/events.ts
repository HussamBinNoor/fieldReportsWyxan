type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeUploadEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitUploadEvent(): void {
  listeners.forEach(listener => listener());
}
