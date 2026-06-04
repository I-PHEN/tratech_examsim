import { DateTime } from 'luxon';
import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';
import { createNotification } from './notificationService';
import { sendReminderEmail } from '../lib/email';
import { getFirebaseAdmin } from '../lib/firebase-admin';
import type { ScheduleCreateInput, ScheduleUpdateInput } from '../schemas/schedule';

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

// ---------------------------------------------------------------------------
// DB row type
// ---------------------------------------------------------------------------

export interface ScheduleRow {
  id: string;
  user_uid: string;
  program_course_id: string;
  topic_id: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  question_count: number;
  label: string | null;
  timezone: string;
  recurrence: 'once' | 'weekly';
  run_at: string | null;
  days_of_week: number[] | null;
  time_of_day: string | null;
  ends_on: string | null;
  next_run_at: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a RecurrenceSpec from a stored row so we can recompute next_run_at.
 * For `once` schedules, the caller should use row.run_at directly rather than
 * round-tripping through computeNextRunAt (which expects a naive local string).
 */
export function rowToRecurrenceSpec(row: Pick<ScheduleRow, 'recurrence' | 'timezone' | 'run_at' | 'days_of_week' | 'time_of_day' | 'ends_on'>): RecurrenceSpec {
  return {
    recurrence: row.recurrence,
    timezone: row.timezone,
    run_at: row.run_at ?? undefined,
    days_of_week: row.days_of_week ?? undefined,
    time_of_day: row.time_of_day ?? undefined,
    ends_on: row.ends_on ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// DB CRUD
// ---------------------------------------------------------------------------

export interface ScheduleListItem extends ScheduleRow {
  course_name: string | null;
  topic_name: string | null;
}

export async function listSchedules(userUid: string): Promise<ScheduleListItem[]> {
  const { data, error } = await supabase
    .from('practice_schedules')
    .select('*, program_courses(courses(name)), topics(name)')
    .eq('user_uid', userUid)
    .order('next_run_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    // Extract course_name: program_courses → courses(name)
    const pc = Array.isArray(row.program_courses) ? row.program_courses[0] : row.program_courses;
    const courses = pc ? (pc as Record<string, unknown>).courses : null;
    const courseObj = Array.isArray(courses) ? (courses as Array<{ name: string }>)[0] : (courses as { name: string } | null);
    const course_name: string | null = courseObj?.name ?? null;

    // Extract topic_name: topics(name)
    const topicObj = Array.isArray(row.topics) ? row.topics[0] : row.topics;
    const topic_name: string | null = (topicObj as { name?: string } | null)?.name ?? null;

    // Strip the embedded relation objects, spread base row fields
    const { program_courses: _pc, topics: _t, ...base } = row;
    return { ...(base as unknown as ScheduleRow), course_name, topic_name };
  });
}

export async function createSchedule(userUid: string, input: ScheduleCreateInput): Promise<ScheduleRow> {
  // Enforce cap: at most 50 active or paused schedules.
  const { count, error: countError } = await supabase
    .from('practice_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('user_uid', userUid)
    .in('status', ['active', 'paused']);
  if (countError) throw countError;
  if ((count ?? 0) >= 50) {
    throw new ApiError(400, 'SCHEDULE_LIMIT', 'You can have at most 50 schedules.');
  }

  const spec: RecurrenceSpec = {
    recurrence: input.recurrence,
    timezone: input.timezone,
    ...(input.recurrence === 'once'
      ? { run_at: input.run_at }
      : {
          days_of_week: input.days_of_week,
          time_of_day: input.time_of_day,
          ends_on: input.ends_on ?? undefined,
        }),
  };

  const next_run_at = computeNextRunAt(spec, new Date());

  const row: Record<string, unknown> = {
    user_uid: userUid,
    program_course_id: input.program_course_id,
    topic_id: input.topic_id ?? null,
    difficulty: input.difficulty ?? null,
    question_count: input.question_count,
    label: input.label ?? null,
    timezone: input.timezone,
    recurrence: input.recurrence,
    next_run_at,
    status: 'active',
  };

  if (input.recurrence === 'once') {
    // Store the absolute UTC instant as run_at; leave weekly fields null.
    row.run_at = next_run_at;
    row.days_of_week = null;
    row.time_of_day = null;
    row.ends_on = null;
  } else {
    row.run_at = null;
    row.days_of_week = input.days_of_week;
    row.time_of_day = input.time_of_day;
    row.ends_on = input.ends_on ?? null;
  }

  const { data, error } = await supabase
    .from('practice_schedules')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as ScheduleRow;
}

export async function updateSchedule(userUid: string, id: string, patch: ScheduleUpdateInput): Promise<ScheduleRow> {
  // Load existing row (scoped by user).
  const { data: existing, error: fetchError } = await supabase
    .from('practice_schedules')
    .select('*')
    .eq('id', id)
    .eq('user_uid', userUid)
    .single();
  if (fetchError || !existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Schedule not found.');
  }
  const row = existing as ScheduleRow;

  // Build the update object by merging scalar fields.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('topic_id' in patch) updates.topic_id = patch.topic_id ?? null;
  if ('difficulty' in patch) updates.difficulty = patch.difficulty ?? null;
  if (patch.question_count !== undefined) updates.question_count = patch.question_count;
  if ('label' in patch) updates.label = patch.label ?? null;
  if (patch.timezone !== undefined) updates.timezone = patch.timezone;

  // If recurrence is being replaced, update recurrence-specific columns.
  // Narrow the patch union to the recurrence branch before accessing recurrence fields.
  if (patch.recurrence === 'once') {
    updates.recurrence = 'once';
    const oncePatch = patch as { recurrence: 'once'; run_at: string; timezone?: string };
    const absUtc = computeNextRunAt(
      { recurrence: 'once', timezone: oncePatch.timezone ?? row.timezone, run_at: oncePatch.run_at },
      new Date()
    );
    updates.run_at = absUtc;
    updates.days_of_week = null;
    updates.time_of_day = null;
    updates.ends_on = null;
  } else if (patch.recurrence === 'weekly') {
    updates.recurrence = 'weekly';
    const weeklyPatch = patch as { recurrence: 'weekly'; days_of_week: number[]; time_of_day: string; ends_on?: string | null };
    updates.run_at = null;
    updates.days_of_week = weeklyPatch.days_of_week;
    updates.time_of_day = weeklyPatch.time_of_day;
    updates.ends_on = weeklyPatch.ends_on ?? null;
  }

  // Recompute next_run_at when active and something recurrence-related changed.
  const effectiveStatus = row.status;
  const recurrenceChanged = patch.recurrence !== undefined || patch.timezone !== undefined;
  if (effectiveStatus === 'active' && recurrenceChanged) {
    // Merge to get the final spec state.
    const mergedRecurrence = (updates.recurrence ?? row.recurrence) as 'once' | 'weekly';
    const mergedTz = (updates.timezone ?? row.timezone) as string;

    if (mergedRecurrence === 'once') {
      // once: next_run_at tracks the absolute run_at instant. Only move it when
      // the recurrence was actually replaced (so run_at was recomputed above);
      // a timezone-only change to a stored once schedule leaves the fixed
      // instant untouched (don't emit the key, so the DB retains it).
      if (updates.run_at !== undefined) {
        updates.next_run_at = updates.run_at as string | null;
      }
    } else {
      const mergedSpec: RecurrenceSpec = {
        recurrence: 'weekly',
        timezone: mergedTz,
        days_of_week: (updates.days_of_week ?? row.days_of_week) as number[],
        time_of_day: (updates.time_of_day ?? row.time_of_day) as string,
        ends_on: ((updates.ends_on ?? row.ends_on) as string | null | undefined) ?? undefined,
      };
      updates.next_run_at = computeNextRunAt(mergedSpec, new Date());
    }
  } else if (effectiveStatus === 'paused') {
    // A paused schedule keeps next_run_at null regardless of which fields changed.
    updates.next_run_at = null;
  }

  const { data, error } = await supabase
    .from('practice_schedules')
    .update(updates)
    .eq('id', id)
    .eq('user_uid', userUid)
    .select()
    .single();
  if (error || !data) {
    throw new ApiError(404, 'NOT_FOUND', 'Schedule not found.');
  }
  return data as ScheduleRow;
}

export async function pauseSchedule(userUid: string, id: string): Promise<ScheduleRow> {
  const { data, error } = await supabase
    .from('practice_schedules')
    .update({ status: 'paused', next_run_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_uid', userUid)
    .select()
    .single();
  if (error || !data) {
    throw new ApiError(404, 'NOT_FOUND', 'Schedule not found.');
  }
  return data as ScheduleRow;
}

export async function resumeSchedule(userUid: string, id: string): Promise<ScheduleRow> {
  // Load existing row to build the spec.
  const { data: existing, error: fetchError } = await supabase
    .from('practice_schedules')
    .select('*')
    .eq('id', id)
    .eq('user_uid', userUid)
    .single();
  if (fetchError || !existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Schedule not found.');
  }
  const row = existing as ScheduleRow;

  // For once: reuse the stored absolute UTC instant directly.
  // For weekly: recompute from the stored spec.
  let next_run_at: string | null;
  if (row.recurrence === 'once') {
    next_run_at = row.run_at;
  } else {
    const spec = rowToRecurrenceSpec(row);
    next_run_at = computeNextRunAt(spec, new Date());
  }

  const { data, error } = await supabase
    .from('practice_schedules')
    .update({ status: 'active', next_run_at, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_uid', userUid)
    .select()
    .single();
  if (error || !data) {
    throw new ApiError(404, 'NOT_FOUND', 'Schedule not found.');
  }
  return data as ScheduleRow;
}

export async function deleteSchedule(userUid: string, id: string): Promise<void> {
  const { error, count } = await supabase
    .from('practice_schedules')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_uid', userUid);
  if (error) throw error;
  if ((count ?? 0) === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Schedule not found.');
  }
}

// ---------------------------------------------------------------------------
// Firing engine
// ---------------------------------------------------------------------------

/**
 * Atomically claims all due active schedules, fires an in-app notification for
 * each, attempts a best-effort email, then advances (or completes) the schedule.
 *
 * Idempotency: the claim UPDATE sets next_run_at = null in the same statement,
 * so a concurrent cron run's `.lte('next_run_at', now)` no longer matches these
 * rows (NULL fails the comparison) — each due instant is processed exactly once.
 */
export async function runDueReminders(): Promise<{
  fired: number;
  emailed: number;
  failed_emails: number;
}> {
  // Step 1 — atomic claim
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('practice_schedules')
    .update({ next_run_at: null, last_fired_at: nowIso })
    .eq('status', 'active')
    .lte('next_run_at', nowIso)
    .select('*');
  if (claimError) throw claimError;

  const rows = (claimed ?? []) as ScheduleRow[];
  if (rows.length === 0) return { fired: 0, emailed: 0, failed_emails: 0 };

  // Batch-fetch course + topic names for all claimed rows in one query.
  const ids = rows.map((r) => r.id);
  const { data: nameRows } = await supabase
    .from('practice_schedules')
    .select('id, program_courses(courses(name)), topics(name)')
    .in('id', ids);

  // Build a lookup: schedule id → { courseName, topicName }
  type NameLookup = { courseName: string | null; topicName: string | null };
  const nameMap = new Map<string, NameLookup>();
  for (const nr of (nameRows ?? []) as unknown as Array<Record<string, unknown>>) {
    const pc = Array.isArray(nr.program_courses) ? nr.program_courses[0] : nr.program_courses;
    const courses = pc ? (pc as Record<string, unknown>).courses : null;
    const courseObj = Array.isArray(courses)
      ? (courses as Array<{ name: string }>)[0]
      : (courses as { name: string } | null);
    const courseName: string | null = courseObj?.name ?? null;

    const topicObj = Array.isArray(nr.topics) ? nr.topics[0] : nr.topics;
    const topicName: string | null = (topicObj as { name?: string } | null)?.name ?? null;

    nameMap.set(nr.id as string, { courseName, topicName });
  }

  let fired = 0;
  let emailed = 0;
  let failedEmails = 0;

  // Step 2 — process each claimed row
  for (const row of rows) {
    // a. Compute next occurrence
    const next = advanceNextRunAt(rowToRecurrenceSpec(row), new Date());
    const newStatus: ScheduleRow['status'] = next ? 'active' : 'completed';

    // b. Resolve display names
    const { courseName, topicName } = nameMap.get(row.id) ?? { courseName: null, topicName: null };
    const courseLabel = topicName
      ? `${courseName ?? 'your course'} · ${topicName}`
      : (courseName ?? 'your course');

    const title = `Time to practice — ${courseLabel}`;
    const body = `${row.question_count} question${row.question_count === 1 ? '' : 's'}${row.difficulty ? ' · ' + row.difficulty : ''}`;
    const payload: Record<string, unknown> = {
      program_course_id: row.program_course_id,
      topic_id: row.topic_id,
      difficulty: row.difficulty,
      question_count: row.question_count,
      mode: 'practice',
    };

    // c. Write in-app notification FIRST (never lost even if email fails)
    const { id: notifId } = await createNotification({
      user_uid: row.user_uid,
      type: 'practice_reminder',
      title,
      body,
      schedule_id: row.id,
      payload,
    });

    // d. Send email best-effort (never fatal)
    let email: string | undefined;
    try {
      email = (await getFirebaseAdmin().auth().getUser(row.user_uid)).email ?? undefined;
    } catch {
      email = undefined;
    }

    if (email) {
      try {
        const startUrl = `${process.env.APP_URL ?? ''}/?start=${row.id}`;
        const { sent } = await sendReminderEmail({ to: email, courseLabel, startUrl });
        if (sent) {
          await supabase
            .from('notifications')
            .update({ email_sent_at: new Date().toISOString() })
            .eq('id', notifId);
          emailed++;
        }
      } catch (e) {
        console.error('[reminder] email failed for schedule', row.id, e);
        failedEmails++;
      }
    }

    // e. Advance the schedule
    await supabase
      .from('practice_schedules')
      .update({ next_run_at: next, status: newStatus })
      .eq('id', row.id);

    fired++;
  }

  return { fired, emailed, failed_emails: failedEmails };
}
