import { DateTime } from 'luxon';

export interface RecurrenceSpec {
  recurrence: 'once' | 'weekly';
  timezone: string;
  run_at?: string | null;       // once: naive local "YYYY-MM-DDTHH:mm" in `timezone`
  days_of_week?: number[] | null; // weekly: 0=Sun..6=Sat
  time_of_day?: string | null;  // weekly: "HH:mm" wall time in `timezone`
  ends_on?: string | null;      // weekly: "YYYY-MM-DD" inclusive last date
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Luxon weekday is 1=Mon..7=Sun.
 * Spec uses 0=Sun..6=Sat.
 * Convert luxon → spec.
 */
function luxonWeekdayToSpec(luxonWd: number): number {
  // luxon 7 (Sun) → 0, luxon 1 (Mon) → 1, …, luxon 6 (Sat) → 6
  return luxonWd === 7 ? 0 : luxonWd;
}

/**
 * Returns the earliest DateTime strictly after `after` that matches the
 * weekly spec, or null if no such occurrence exists within 7 days OR if the
 * occurrence would fall after ends_on.
 */
function nextWeeklyAfter(spec: RecurrenceSpec, after: DateTime): DateTime | null {
  const daysOfWeek = spec.days_of_week ?? [];
  const [hStr, mStr] = (spec.time_of_day ?? '00:00').split(':');
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10);

  // Scan up to 7 days forward starting from the day that contains `after`
  for (let i = 0; i <= 7; i++) {
    const candidate = after
      .plus({ days: i })
      .set({ hour, minute, second: 0, millisecond: 0 });

    const specWeekday = luxonWeekdayToSpec(candidate.weekday);
    if (!daysOfWeek.includes(specWeekday)) continue;
    if (candidate <= after) continue; // must be strictly after

    // Check ends_on (inclusive last date in the schedule's timezone)
    if (spec.ends_on) {
      const endDay = DateTime.fromISO(spec.ends_on, { zone: spec.timezone }).endOf('day');
      if (candidate > endDay) return null;
    }

    return candidate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Initial next_run_at at create/update time.
 *
 * - once:   the run_at wall-time resolved to an absolute UTC instant.
 *           Returned even if already in the past.
 * - weekly: the earliest occurrence STRICTLY AFTER `now`; null if past ends_on.
 */
export function computeNextRunAt(spec: RecurrenceSpec, now: Date): string | null {
  if (spec.recurrence === 'once') {
    if (!spec.run_at) return null;
    const dt = DateTime.fromISO(spec.run_at, { zone: spec.timezone });
    if (!dt.isValid) return null;
    return dt.toUTC().toISO();
  }

  // weekly
  const afterLuxon = DateTime.fromJSDate(now, { zone: spec.timezone });
  const next = nextWeeklyAfter(spec, afterLuxon);
  return next ? next.toUTC().toISO() : null;
}

/**
 * Next occurrence used to ADVANCE a schedule right after it fires.
 *
 * - once:   null (one-shot, done).
 * - weekly: earliest occurrence STRICTLY AFTER `after`; null if past ends_on.
 */
export function advanceNextRunAt(spec: RecurrenceSpec, after: Date): string | null {
  if (spec.recurrence === 'once') return null;

  const afterLuxon = DateTime.fromJSDate(after, { zone: spec.timezone });
  const next = nextWeeklyAfter(spec, afterLuxon);
  return next ? next.toUTC().toISO() : null;
}
