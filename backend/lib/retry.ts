// Transient network failures (reset/closed keep-alive sockets, DNS blips) when
// talking to Google APIs (Firestore REST, Firebase Auth). These are safe to
// retry for idempotent reads.
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EPIPE',
  'UND_ERR_SOCKET',
]);

function isTransient(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNRESET|socket hang up|ETIMEDOUT|EAI_AGAIN/i.test(msg);
}

/**
 * Run an idempotent async op, retrying a few times on transient network errors
 * with short linear backoff. Non-transient errors throw immediately.
 */
export async function retryTransient<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}
