import { describe, it, expect } from 'vitest';
import { validateProposal } from './scheduleAiValidate';

// Valid v4-shaped UUIDs (3rd group starts with 4, 4th with 8) so Zod's strict
// .uuid() accepts them. course A allows t1; course B allows no topics.
const COURSE_A = '11111111-1111-4111-8111-111111111111';
const COURSE_B = '22222222-2222-4222-8222-222222222222';
const TOPIC_1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_OTHER = 'bbbbbbbb-2222-4222-8222-222222222222';
const COURSE_FAKE = '99999999-9999-4999-8999-999999999999';

const allowed = new Map<string, Set<string>>([
  [COURSE_A, new Set([TOPIC_1])],
  [COURSE_B, new Set<string>()],
]);

const onceRaw = {
  program_course_id: COURSE_A,
  topic_id: TOPIC_1,
  difficulty: 'medium',
  question_count: 10,
  label: 'Entropy drill',
  timezone: 'Africa/Accra',
  recurrence: 'once',
  run_at: '2026-06-20T18:00',
  why: 'Entropy is your weakest at 45%',
};

describe('validateProposal', () => {
  it('accepts a valid once proposal and carries why', () => {
    const r = validateProposal(onceRaw, allowed);
    expect(r).not.toBeNull();
    expect(r!.value.program_course_id).toBe(COURSE_A);
    expect(r!.value.recurrence).toBe('once');
    expect(r!.why).toBe('Entropy is your weakest at 45%');
  });

  it('accepts a valid weekly proposal', () => {
    const r = validateProposal(
      {
        program_course_id: COURSE_A,
        topic_id: null,
        difficulty: null,
        question_count: 5,
        timezone: 'Africa/Accra',
        recurrence: 'weekly',
        days_of_week: [1, 3, 5],
        time_of_day: '18:00',
        why: 'Spaced practice',
      },
      allowed,
    );
    expect(r).not.toBeNull();
    expect(r!.value.recurrence).toBe('weekly');
  });

  it('rejects a hallucinated course id', () => {
    const r = validateProposal({ ...onceRaw, program_course_id: COURSE_FAKE }, allowed);
    expect(r).toBeNull();
  });

  it('rejects a topic that does not belong to the course', () => {
    const r = validateProposal({ ...onceRaw, topic_id: TOPIC_OTHER }, allowed);
    expect(r).toBeNull();
  });

  it('accepts a null topic (mixed practice)', () => {
    const r = validateProposal({ ...onceRaw, topic_id: null }, allowed);
    expect(r).not.toBeNull();
    expect(r!.value.topic_id ?? null).toBeNull();
  });

  it('rejects when ScheduleCreate validation fails (count out of range)', () => {
    const r = validateProposal({ ...onceRaw, question_count: 999 }, allowed);
    expect(r).toBeNull();
  });

  it('rejects when recurrence fields are incoherent (once without run_at)', () => {
    const { run_at, ...noRunAt } = onceRaw;
    const r = validateProposal({ ...noRunAt, recurrence: 'once' }, allowed);
    expect(r).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(validateProposal(null, allowed)).toBeNull();
    expect(validateProposal('x', allowed)).toBeNull();
  });

  it('defaults why to empty string when absent', () => {
    const { why, ...noWhy } = onceRaw;
    const r = validateProposal(noWhy, allowed);
    expect(r!.why).toBe('');
  });
});
