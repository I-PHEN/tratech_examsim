import { ScheduleCreate, type ScheduleCreateInput } from '../schemas/schedule';

export interface ValidatedProposal {
  value: ScheduleCreateInput;
  why: string;
}

/**
 * Validate ONE raw model proposal. Returns the typed, schema-valid value (plus
 * its `why`) only when it parses AND its course/topic ids are in the user's
 * allowed set; otherwise null. `allowed` maps course id → set of that course's
 * topic ids.
 */
export function validateProposal(
  raw: unknown,
  allowed: Map<string, Set<string>>,
): ValidatedProposal | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const why = typeof r.why === 'string' ? r.why : '';

  // Pass the candidate (minus `why`) straight to the real create schema.
  const { why: _why, ...candidate } = r;
  const parsed = ScheduleCreate.safeParse(candidate);
  if (!parsed.success) return null;

  const value = parsed.data;
  const topicSet = allowed.get(value.program_course_id);
  if (!topicSet) return null; // course not in the user's set
  if (value.topic_id != null && !topicSet.has(value.topic_id)) return null;

  return { value, why };
}
