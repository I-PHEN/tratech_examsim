import { z } from 'zod';
import { uuid, Difficulty } from './common';

const naiveDatetime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Must be "YYYY-MM-DDTHH:mm"');

const timeOfDay = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Must be "HH:mm"');

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be "YYYY-MM-DD"');

const dayOfWeek = z.number().int().min(0).max(6);

const OnceRecurrence = z.object({
  recurrence: z.literal('once'),
  run_at: naiveDatetime,
});

const WeeklyRecurrence = z.object({
  recurrence: z.literal('weekly'),
  days_of_week: z
    .array(dayOfWeek)
    .min(1, 'At least one day required')
    .transform((days) => [...new Set(days)]),
  time_of_day: timeOfDay,
  ends_on: dateOnly.nullable().optional(),
});

const RecurrenceUnion = z.discriminatedUnion('recurrence', [OnceRecurrence, WeeklyRecurrence]);

// ---------------------------------------------------------------------------
// ScheduleCreate
// ---------------------------------------------------------------------------
export const ScheduleCreate = z
  .object({
    program_course_id: uuid,
    topic_id: uuid.nullable().optional(),
    difficulty: Difficulty.nullable().optional(),
    question_count: z.number().int().min(1).max(50).default(10),
    label: z.string().trim().max(120).nullable().optional(),
    timezone: z.string().min(1, 'timezone is required'),
  })
  .and(RecurrenceUnion);

export type ScheduleCreateInput = z.infer<typeof ScheduleCreate>;

// ---------------------------------------------------------------------------
// ScheduleUpdate (PATCH — all scalar fields optional; recurrence is all-or-nothing)
// ---------------------------------------------------------------------------
const ScalarUpdate = z.object({
  topic_id: uuid.nullable().optional(),
  difficulty: Difficulty.nullable().optional(),
  question_count: z.number().int().min(1).max(50).optional(),
  label: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().min(1).optional(),
});

// When recurrence is absent the patch carries only scalar fields.
const UpdateNoRecurrence = ScalarUpdate.extend({ recurrence: z.undefined().optional() });

// When recurrence is present the full recurrence object must be coherent.
const UpdateWithOnce = ScalarUpdate.and(OnceRecurrence);
const UpdateWithWeekly = ScalarUpdate.and(WeeklyRecurrence);

export const ScheduleUpdate = z.union([
  UpdateWithOnce,
  UpdateWithWeekly,
  UpdateNoRecurrence,
]);

export type ScheduleUpdateInput = z.infer<typeof ScheduleUpdate>;
