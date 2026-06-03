import { describe, it, expect } from 'vitest';
import { computeNextRunAt, advanceNextRunAt, type RecurrenceSpec } from './scheduleService';

// ---------------------------------------------------------------------------
// once
// ---------------------------------------------------------------------------
describe('computeNextRunAt — once', () => {
  it('returns the run_at wall-time as a correct UTC instant (UTC+0)', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'once',
      timezone: 'UTC',
      run_at: '2026-06-10T14:30',
    };
    const result = computeNextRunAt(spec, new Date('2026-06-01T00:00:00Z'));
    expect(result).toBe('2026-06-10T14:30:00.000Z');
  });

  it('converts wall-time correctly for a positive-offset tz (Asia/Tokyo UTC+9)', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'once',
      timezone: 'Asia/Tokyo',
      run_at: '2026-06-10T09:00',
    };
    // 09:00 Tokyo = 00:00 UTC
    const result = computeNextRunAt(spec, new Date('2026-06-01T00:00:00Z'));
    expect(result).toBe('2026-06-10T00:00:00.000Z');
  });

  it('returns a past run_at even when now is after it', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'once',
      timezone: 'UTC',
      run_at: '2026-05-01T08:00',
    };
    // now is well after run_at
    const result = computeNextRunAt(spec, new Date('2026-06-10T12:00:00Z'));
    expect(result).toBe('2026-05-01T08:00:00.000Z');
  });
});

describe('advanceNextRunAt — once', () => {
  it('returns null (one-shot, done after firing)', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'once',
      timezone: 'UTC',
      run_at: '2026-06-10T14:30',
    };
    expect(advanceNextRunAt(spec, new Date('2026-06-10T14:30:00Z'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// weekly — basic
// ---------------------------------------------------------------------------
describe('computeNextRunAt — weekly basic', () => {
  it('picks the next matching weekday after now', () => {
    // now: Monday 2026-06-01T10:00Z (UTC), schedule: Wednesday (3) at 12:00 UTC
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3], // Wednesday
      time_of_day: '12:00',
    };
    const now = new Date('2026-06-01T10:00:00Z'); // Monday
    const result = computeNextRunAt(spec, now);
    // Next Wednesday is 2026-06-03
    expect(result).toBe('2026-06-03T12:00:00.000Z');
  });

  it('picks correctly when days_of_week has multiple entries', () => {
    // now: 2026-06-01 Monday 10:00 UTC. Mon/Wed/Fri = 1/3/5. Next is Monday 10:00?
    // 10:00 UTC and time is 12:00 so same day (Mon) is still valid (12:00 > 10:00)
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [1, 3, 5], // Mon, Wed, Fri
      time_of_day: '12:00',
    };
    const now = new Date('2026-06-01T10:00:00Z'); // Monday
    const result = computeNextRunAt(spec, now);
    // Monday 12:00 is strictly after 10:00 → today works
    expect(result).toBe('2026-06-01T12:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// weekly — same-day boundary
// ---------------------------------------------------------------------------
describe('computeNextRunAt — weekly same-day boundary', () => {
  it('returns today when now is before time_of_day on a matching day', () => {
    // 2026-06-03 is Wednesday (3). Now is 11:00, time_of_day is 12:00 → today
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3], // Wednesday
      time_of_day: '12:00',
    };
    const now = new Date('2026-06-03T11:00:00Z');
    const result = computeNextRunAt(spec, now);
    expect(result).toBe('2026-06-03T12:00:00.000Z');
  });

  it('skips to next matching day when now is AFTER time_of_day on a matching day', () => {
    // 2026-06-03 is Wednesday (3). Now is 13:00, time_of_day is 12:00 → next Wednesday
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3], // Wednesday
      time_of_day: '12:00',
    };
    const now = new Date('2026-06-03T13:00:00Z');
    const result = computeNextRunAt(spec, now);
    // Next Wednesday is 2026-06-10
    expect(result).toBe('2026-06-10T12:00:00.000Z');
  });

  it('skips when now is exactly at time_of_day (not strictly after)', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3],
      time_of_day: '12:00',
    };
    const now = new Date('2026-06-03T12:00:00.000Z'); // exact match
    const result = computeNextRunAt(spec, now);
    // Not strictly after → skip to next Wednesday
    expect(result).toBe('2026-06-10T12:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// weekly — multi-day
// ---------------------------------------------------------------------------
describe('computeNextRunAt — weekly multi-day', () => {
  it('picks the nearest upcoming day among Mon/Wed/Fri starting on a Tuesday', () => {
    // 2026-06-02 is a Tuesday. Mon=1, Wed=3, Fri=5.
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [1, 3, 5],
      time_of_day: '09:00',
    };
    const now = new Date('2026-06-02T10:00:00Z'); // Tuesday
    const result = computeNextRunAt(spec, now);
    // Next match is Wednesday 2026-06-03
    expect(result).toBe('2026-06-03T09:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// weekly — Sunday handling
// ---------------------------------------------------------------------------
describe('computeNextRunAt — weekly Sunday (0 / luxon 7)', () => {
  it('correctly picks Sunday as day 0', () => {
    // 2026-06-06 is a Saturday. Days = [0] (Sunday). Next Sunday = 2026-06-07.
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [0], // Sunday
      time_of_day: '10:00',
    };
    const now = new Date('2026-06-06T10:00:00Z'); // Saturday 10:00 UTC (same as time — still Sat)
    const result = computeNextRunAt(spec, now);
    expect(result).toBe('2026-06-07T10:00:00.000Z');
  });

  it('returns Sunday today when now is before time_of_day on a Sunday', () => {
    // 2026-06-07 is a Sunday
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [0],
      time_of_day: '15:00',
    };
    const now = new Date('2026-06-07T14:00:00Z');
    const result = computeNextRunAt(spec, now);
    expect(result).toBe('2026-06-07T15:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// DST correctness
// ---------------------------------------------------------------------------
describe('computeNextRunAt — DST correctness (America/New_York)', () => {
  // America/New_York: EST = UTC-5, EDT = UTC-4
  // 2026 DST spring forward: Sun 2026-03-08 at 02:00 EST → 03:00 EDT
  // Before: 2026-03-07 (Sat, EST -05:00); After: 2026-03-08 (Sun, EDT -04:00)

  it('uses EST offset (-05:00) before spring forward', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'America/New_York',
      days_of_week: [6], // Saturday (spec 6)
      time_of_day: '18:00',
    };
    // now is Friday 2026-03-06 in NY (any time before 18:00 Sat)
    const now = new Date('2026-03-06T20:00:00Z'); // Fri 15:00 EST
    const result = computeNextRunAt(spec, now);
    // Sat 2026-03-07 18:00 EST = 23:00 UTC
    expect(result).toBe('2026-03-07T23:00:00.000Z');
  });

  it('uses EDT offset (-04:00) after spring forward', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'America/New_York',
      days_of_week: [6], // Saturday (spec 6)
      time_of_day: '18:00',
    };
    // now is Monday 2026-03-09 (after spring forward)
    const now = new Date('2026-03-09T20:00:00Z'); // Mon 16:00 EDT
    const result = computeNextRunAt(spec, now);
    // Sat 2026-03-14 18:00 EDT = 22:00 UTC
    expect(result).toBe('2026-03-14T22:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// ends_on
// ---------------------------------------------------------------------------
describe('weekly ends_on', () => {
  it('returns null when the next occurrence would be after ends_on', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3], // Wednesday
      time_of_day: '12:00',
      ends_on: '2026-06-02', // before the next Wednesday (2026-06-03)
    };
    const now = new Date('2026-06-01T10:00:00Z'); // Monday
    const result = computeNextRunAt(spec, now);
    expect(result).toBeNull();
  });

  it('returns the occurrence when it falls on ends_on date', () => {
    // ends_on is Wednesday 2026-06-03; occurrence is also that day at 12:00 → within ends_on
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3],
      time_of_day: '12:00',
      ends_on: '2026-06-03',
    };
    const now = new Date('2026-06-01T10:00:00Z');
    const result = computeNextRunAt(spec, now);
    expect(result).toBe('2026-06-03T12:00:00.000Z');
  });

  it('returns null from advanceNextRunAt when next occurrence would exceed ends_on', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3],
      time_of_day: '12:00',
      ends_on: '2026-06-03', // last allowed date is this Wednesday
    };
    // fired on 2026-06-03 at 12:00 — advance should find next Wed 2026-06-10 which is after ends_on
    const after = new Date('2026-06-03T12:00:00Z');
    const result = advanceNextRunAt(spec, after);
    expect(result).toBeNull();
  });

  it('returns next occurrence from advanceNextRunAt when within ends_on', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'weekly',
      timezone: 'UTC',
      days_of_week: [3],
      time_of_day: '12:00',
      ends_on: '2026-06-10',
    };
    const after = new Date('2026-06-03T12:00:00Z');
    const result = advanceNextRunAt(spec, after);
    expect(result).toBe('2026-06-10T12:00:00.000Z');
  });
});
