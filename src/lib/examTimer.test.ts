import { describe, it, expect } from 'vitest';
import { remainingMs } from './examTimer';

describe('remainingMs', () => {
  it('counts down from duration as time elapses', () => {
    const r = remainingMs({ startedAt: 1000, durationMs: 60000, totalPausedMs: 0, pausedAt: null }, 11000);
    expect(r).toBe(50000);
  });

  it('clamps to 0 when time is up', () => {
    const r = remainingMs({ startedAt: 1000, durationMs: 5000, totalPausedMs: 0, pausedAt: null }, 11000);
    expect(r).toBe(0);
  });

  it('clamps to durationMs when elapsed is negative (clock skew / future start)', () => {
    const r = remainingMs({ startedAt: 20000, durationMs: 60000, totalPausedMs: 0, pausedAt: null }, 11000);
    expect(r).toBe(60000);
  });

  it('freezes while paused (uses pausedAt, not now)', () => {
    const r = remainingMs({ startedAt: 1000, durationMs: 60000, totalPausedMs: 0, pausedAt: 6000 }, 50000);
    expect(r).toBe(55000);
  });

  it('excludes accumulated paused time from elapsed', () => {
    const r = remainingMs({ startedAt: 1000, durationMs: 60000, totalPausedMs: 3000, pausedAt: null }, 11000);
    expect(r).toBe(53000);
  });
});
