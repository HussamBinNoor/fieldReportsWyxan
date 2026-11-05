/**
 * RFC 4122 UUID version 4. React Native gets crypto.getRandomValues from
 * react-native-get-random-values, which is imported at startup. Node's test
 * runner and Jest already provide crypto.randomUUID.
 */
type CryptoSource = {
  randomUUID?: () => string;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
};

export function createId(): string {
  const cryptoObject = (globalThis as { crypto?: CryptoSource }).crypto;
  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoObject?.getRandomValues === 'function') {
    cryptoObject.getRandomValues(bytes);
  } else {
    throw new Error('This device cannot generate a report id.');
  }

  // UUID version 4 and the RFC 4122 variant live in these bits.
  // eslint-disable-next-line no-bitwise
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // eslint-disable-next-line no-bitwise
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The report id and the idempotency key are the same value, chosen once.
 * Retries keep using that value; they never mint a new one.
 */
export function createReportIdentity(newId: () => string = createId): {
  id: string;
  idempotencyKey: string;
} {
  const id = newId();
  return { id, idempotencyKey: id };
}
