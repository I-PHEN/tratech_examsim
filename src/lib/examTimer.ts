export interface TimerState {
  /** Client-clock virtual start: Date.now() − server elapsed_ms, captured at hydrate. */
  startedAt: number;
  durationMs: number;
  /** Paused time accumulated (client-measured) since hydrate. */
  totalPausedMs: number;
  /** Client ts when currently paused, else null (freezes the countdown). */
  pausedAt: number | null;
}

/**
 * Remaining milliseconds, clamped to [0, durationMs]. Pure — uses only the values
 * given. When paused, time is measured to `pausedAt` (frozen) rather than `now`.
 * Because every term is a client-clock timestamp, the result is immune to any
 * client/server clock skew (the server's contribution is already folded into
 * `startedAt` at hydrate as `Date.now() − elapsed_ms`).
 */
export function remainingMs(s: TimerState, now: number): number {
  const ref = s.pausedAt ?? now;
  const elapsed = ref - s.startedAt - s.totalPausedMs;
  return Math.min(s.durationMs, Math.max(0, s.durationMs - elapsed));
}
