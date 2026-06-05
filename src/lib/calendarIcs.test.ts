import { describe, it, expect } from 'vitest';
import { buildScheduleIcs } from './calendarIcs';
import type { IcsSchedule } from './calendarIcs';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_ONCE: IcsSchedule = {
  id: 'abc-123',
  recurrence: 'once',
  timezone: 'Africa/Lagos',
  run_at: '2026-07-01T09:00:00Z',
  next_run_at: null,
  days_of_week: null,
  time_of_day: null,
  ends_on: null,
  question_count: 10,
  difficulty: 'medium',
  label: null,
  course_name: 'Pharmacology',
  topic_name: 'Drug Interactions',
};

const BASE_WEEKLY: IcsSchedule = {
  id: 'def-456',
  recurrence: 'weekly',
  timezone: 'America/New_York',
  run_at: null,
  next_run_at: '2026-07-06T14:00:00Z',
  days_of_week: [1, 3, 5],   // Mon, Wed, Fri
  time_of_day: '14:00',
  ends_on: null,
  question_count: 1,
  difficulty: null,
  label: 'Morning Drill',
  course_name: 'Anatomy',
  topic_name: null,
};

const ORIGIN = 'https://examsim.example.com';

// ─── Helper ───────────────────────────────────────────────────────────────────

function lines(ics: string): string[] {
  return ics.split('\r\n');
}

function findLine(ics: string, prefix: string): string | undefined {
  return lines(ics).find((l) => l.startsWith(prefix));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildScheduleIcs — once', () => {
  const ics = buildScheduleIcs(BASE_ONCE, ORIGIN);

  it('starts with BEGIN:VCALENDAR', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
  });

  it('uses CRLF line endings throughout', () => {
    // Every pair of consecutive chars that delimit lines must be \r\n
    // Quick check: no bare \n without preceding \r
    const bareNewlines = ics.split('').filter((c, i) => c === '\n' && ics[i - 1] !== '\r');
    expect(bareNewlines).toHaveLength(0);
    expect(ics).toContain('\r\n');
  });

  it('DTSTART is UTC compact with trailing Z (no TZID)', () => {
    const line = findLine(ics, 'DTSTART');
    expect(line).toBeDefined();
    expect(line).toBe('DTSTART:20260701T090000Z');
    expect(line).not.toContain('TZID');
  });

  it('has no RRULE', () => {
    expect(lines(ics).some((l) => l.startsWith('RRULE'))).toBe(false);
  });

  it('has DURATION:PT30M', () => {
    expect(findLine(ics, 'DURATION')).toBe('DURATION:PT30M');
  });

  it('has UID with @tratech-examsim', () => {
    expect(findLine(ics, 'UID')).toBe(`UID:${BASE_ONCE.id}@tratech-examsim`);
  });

  it('has DTSTAMP in UTC compact format', () => {
    const line = findLine(ics, 'DTSTAMP');
    expect(line).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/);
  });

  it('DESCRIPTION contains the deep link with correct id', () => {
    const line = findLine(ics, 'DESCRIPTION');
    expect(line).toContain(`${ORIGIN}/?start=${BASE_ONCE.id}`);
  });

  it('pluralises "questions" when count > 1', () => {
    const line = findLine(ics, 'DESCRIPTION');
    expect(line).toContain('10 questions');
  });

  it('uses "question" (singular) when count is 1', () => {
    const s: IcsSchedule = { ...BASE_ONCE, question_count: 1 };
    const ics2 = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics2, 'DESCRIPTION');
    expect(line).toContain('1 question');
    expect(line).not.toContain('1 questions');
  });
});

describe('buildScheduleIcs — weekly', () => {
  const ics = buildScheduleIcs(BASE_WEEKLY, ORIGIN);

  it('DTSTART uses TZID with local time (no Z)', () => {
    const line = findLine(ics, 'DTSTART');
    expect(line).toBeDefined();
    expect(line).toContain(`TZID=${BASE_WEEKLY.timezone}`);
    // Local time for 2026-07-06T14:00:00Z in America/New_York (UTC-4 in summer) = 10:00
    expect(line).toContain('20260706T100000');
    expect(line).not.toMatch(/Z$/);
  });

  it('has RRULE with correct BYDAY in ascending order', () => {
    const line = findLine(ics, 'RRULE');
    expect(line).toBeDefined();
    expect(line).toContain('FREQ=WEEKLY');
    expect(line).toContain('BYDAY=MO,WE,FR');
  });

  it('has no UNTIL when ends_on is null', () => {
    const line = findLine(ics, 'RRULE');
    expect(line).not.toContain('UNTIL');
  });

  it('appends UNTIL when ends_on is set', () => {
    const s: IcsSchedule = { ...BASE_WEEKLY, ends_on: '2026-09-30' };
    const ics2 = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics2, 'RRULE');
    expect(line).toContain('UNTIL=20260930T235959Z');
  });

  it('orders BYDAY ascending even if days_of_week is out of order', () => {
    const s: IcsSchedule = { ...BASE_WEEKLY, days_of_week: [6, 0, 3] };
    const ics2 = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics2, 'RRULE');
    expect(line).toContain('BYDAY=SU,WE,SA');
  });

  it('uses label in SUMMARY when label is set', () => {
    const line = findLine(ics, 'SUMMARY');
    expect(line).toContain('Morning Drill');
  });

  it('DESCRIPTION uses singular "question" for count 1', () => {
    const line = findLine(ics, 'DESCRIPTION');
    expect(line).toContain('1 question');
    expect(line).not.toContain('1 questions');
  });
});

describe('buildScheduleIcs — escaping', () => {
  it('escapes commas and semicolons in label within SUMMARY', () => {
    const s: IcsSchedule = { ...BASE_ONCE, label: 'Math, Science; History' };
    const ics = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics, 'SUMMARY');
    expect(line).toContain('Math\\, Science\\; History');
  });

  it('escapes backslashes in label', () => {
    const s: IcsSchedule = { ...BASE_ONCE, label: 'Path\\Value' };
    const ics = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics, 'SUMMARY');
    expect(line).toContain('Path\\\\Value');
  });
});

describe('buildScheduleIcs — title fallback', () => {
  it('uses course_name + topic_name when no label', () => {
    const s: IcsSchedule = { ...BASE_ONCE, label: null };
    const ics = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics, 'SUMMARY');
    expect(line).toContain('Pharmacology · Drug Interactions');
  });

  it('uses course_name only when no label and no topic', () => {
    const s: IcsSchedule = { ...BASE_ONCE, label: null, topic_name: null };
    const ics = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics, 'SUMMARY');
    expect(line).toContain('Pharmacology');
    expect(line).not.toContain('·');
  });

  it('falls back to "session" when no label and no course_name', () => {
    const s: IcsSchedule = { ...BASE_ONCE, label: null, course_name: null, topic_name: null };
    const ics = buildScheduleIcs(s, ORIGIN);
    const line = findLine(ics, 'SUMMARY');
    expect(line).toContain('session');
  });
});
