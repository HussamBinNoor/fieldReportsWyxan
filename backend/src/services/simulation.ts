export type SimulationState = {
  latencyMs: number;
  dropNext: number;
  failNext: number;
  failStatus: number;
  hang: boolean;
  refuseUploads: boolean;
};

const initial = (): SimulationState => ({
  latencyMs: 0,
  dropNext: 0,
  failNext: 0,
  failStatus: 500,
  hang: false,
  refuseUploads: false,
});

let state = initial();

export function getSimulation(): SimulationState {
  return { ...state };
}

export function replaceSimulation(next: Partial<SimulationState>): SimulationState {
  state = {
    latencyMs: clamp(next.latencyMs, 0, 120_000, state.latencyMs),
    dropNext: clamp(next.dropNext, 0, 20, state.dropNext),
    failNext: clamp(next.failNext, 0, 20, state.failNext),
    failStatus: next.failStatus === 503 ? 503 : next.failStatus === 500 ? 500 : state.failStatus,
    hang: Boolean(next.hang),
    refuseUploads: Boolean(next.refuseUploads),
  };
  return getSimulation();
}

export function resetSimulation(): SimulationState {
  state = initial();
  return getSimulation();
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export async function consumeSimulation(
  req: { method: string; path: string; socket: { destroy: () => void } },
  res: { status: (code: number) => { json: (body: unknown) => void }; headersSent: boolean },
): Promise<'continue' | 'stopped'> {
  if (req.method !== 'POST' || !req.path.startsWith('/api/reports')) {
    return 'continue';
  }

  const snapshot = getSimulation();
  if (snapshot.latencyMs > 0) {
    await delay(snapshot.latencyMs);
  }
  if (snapshot.hang) {
    return 'stopped';
  }
  if (state.dropNext > 0 && req.path.includes('/images/')) {
    state.dropNext -= 1;
    req.socket.destroy();
    return 'stopped';
  }
  if (state.failNext > 0) {
    state.failNext -= 1;
    const status = state.failStatus === 503 ? 503 : 500;
    res.status(status).json({
      error: status === 503 ? 'HTTP_503' : 'HTTP_500',
      message:
        status === 503
          ? 'Simulated temporary outage. The report stays on the device and will be retried.'
          : 'Simulated server error. The report stays on the device and will be retried.',
    });
    return 'stopped';
  }
  if (snapshot.refuseUploads && req.path.includes('/images/')) {
    res.status(503).json({
      error: 'UPLOAD_REFUSED',
      message: 'Uploads are temporarily refused by the development simulation.',
    });
    return 'stopped';
  }
  return 'continue';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
