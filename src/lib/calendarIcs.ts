import { DateTime } from 'luxon';

export interface IcsSchedule {
  id: string;
  recurrence: 'once' | 'weekly';
  timezone: string;
  run_at: string | null;        // once: absolute UTC ISO
  next_run_at: string | null;   // weekly: next occurrence, absolute UTC ISO
  days_of_week: number[] | null; // weekly 0=Sun..6=Sat
  time_of_day: string | null;    // weekly "HH:mm"
  ends_on: string | null;        // weekly "YYYY-MM-DD"
  question_count: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  label: string | null;
  course_name: string | null;
  topic_name: string | null;
}

// ─── Text escaping (RFC 5545 §3.3.11) ────────────────────────────────────────

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

function toUtcCompact(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).toFormat("yyyyLLdd'T'HHmmss'Z'");
}

function toLocalCompact(iso: string, tz: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz).toFormat("yyyyLLdd'T'HHmmss");
}

// ─── Day-of-week map (RFC 5545 BYDAY) ─────────────────────────────────────────

const DOW_LABELS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

// ─── Title / description builders ────────────────────────────────────────────

function buildTitle(s: IcsSchedule): string {
  if (s.label) return `Practice — ${s.label}`;
  const base = s.course_name ?? 'session';
  return `Practice — ${base}${s.topic_name ? ` · ${s.topic_name}` : ''}`;
}

function buildDescription(s: IcsSchedule, appOrigin: string): string {
  const qWord = s.question_count === 1 ? 'question' : 'questions';
  const diffPart = s.difficulty ? ` · ${s.difficulty}` : '';
  return `${s.question_count} ${qWord}${diffPart}. Open: ${appOrigin}/?start=${s.id}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a complete VCALENDAR string for a scheduled-practice item.
 * Line endings are CRLF as required by RFC 5545.
 */
export function buildScheduleIcs(s: IcsSchedule, appOrigin: string): string {
  const CRLF = '\r\n';
  const now = DateTime.utc().toFormat("yyyyLLdd'T'HHmmss'Z'");
  const uid = `${s.id}@tratech-examsim`;
  const summary = escapeText(buildTitle(s));
  const description = escapeText(buildDescription(s, appOrigin));

  // DTSTART line
  let dtstart: string;
  if (s.recurrence === 'once') {
    const iso = s.run_at ?? '';
    dtstart = `DTSTART:${toUtcCompact(iso)}`;
  } else {
    const iso = s.next_run_at ?? '';
    dtstart = `DTSTART;TZID=${s.timezone}:${toLocalCompact(iso, s.timezone)}`;
  }

  // RRULE line (weekly only)
  let rrule = '';
  if (s.recurrence === 'weekly' && s.days_of_week && s.days_of_week.length > 0) {
    const days = [...s.days_of_week]
      .sort((a, b) => a - b)
      .map((d) => DOW_LABELS[d])
      .join(',');
    let rule = `RRULE:FREQ=WEEKLY;BYDAY=${days}`;
    if (s.ends_on) {
      // "YYYY-MM-DD" → "YYYYMMDD" + T235959Z
      const until = s.ends_on.replace(/-/g, '') + 'T235959Z';
      rule += `;UNTIL=${until}`;
    }
    rrule = rule + CRLF;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tratech ExamSim//Scheduled Practice//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    dtstart,
    'DURATION:PT30M',
    ...(rrule ? [rrule.trimEnd()] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time to practice',
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join(CRLF);

  // Ensure trailing CRLF
  return lines + CRLF;
}

/**
 * Build a Google Calendar "create event" template URL — opens a prefilled event
 * the user saves in one click (no file download). Times use the schedule's tz
 * via the `ctz` param so recurring events fire at the right local wall-clock time.
 */
export function buildGoogleCalendarUrl(s: IcsSchedule, appOrigin: string): string {
  const iso = s.recurrence === 'once' ? (s.run_at ?? '') : (s.next_run_at ?? '');
  const startDt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(s.timezone);
  const fmt = (dt: DateTime) => dt.toFormat("yyyyLLdd'T'HHmmss");
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: buildTitle(s),
    dates: `${fmt(startDt)}/${fmt(startDt.plus({ minutes: 30 }))}`,
    ctz: s.timezone,
    details: buildDescription(s, appOrigin),
  });
  if (s.recurrence === 'weekly' && s.days_of_week && s.days_of_week.length > 0) {
    const days = [...s.days_of_week].sort((a, b) => a - b).map((d) => DOW_LABELS[d]).join(',');
    let rule = `RRULE:FREQ=WEEKLY;BYDAY=${days}`;
    if (s.ends_on) rule += `;UNTIL=${s.ends_on.replace(/-/g, '')}T235959Z`;
    params.set('recur', rule);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Trigger a browser download of an .ics file.
 */
export function downloadIcs(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
