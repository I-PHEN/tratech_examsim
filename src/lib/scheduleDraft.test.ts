import { describe, it, expect } from 'vitest';
import { draftToForm, describeDraft, type AiScheduleProposal } from './scheduleDraft';

const onceDraft: AiScheduleProposal = {
  program_course_id: 'pc-1',
  course_name: 'Thermodynamics',
  topic_id: 't-1',
  topic_name: 'Entropy',
  difficulty: 'medium',
  question_count: 12,
  label: 'Entropy drill',
  timezone: 'Africa/Accra',
  recurrence: 'once',
  run_at: '2026-06-20T18:00',
  days_of_week: null,
  time_of_day: null,
  ends_on: null,
  why: 'Entropy — your weakest at 45%',
};

const weeklyDraft: AiScheduleProposal = {
  ...onceDraft,
  recurrence: 'weekly',
  run_at: null,
  days_of_week: [1, 3],
  time_of_day: '18:00',
  ends_on: '2026-07-01',
  difficulty: null,
  topic_id: null,
  topic_name: null,
};

describe('draftToForm', () => {
  it('splits once run_at into date + time and maps fields', () => {
    const f = draftToForm(onceDraft);
    expect(f.programCourseId).toBe('pc-1');
    expect(f.topicId).toBe('t-1');
    expect(f.difficulty).toBe('Medium');
    expect(f.questionCount).toBe(12);
    expect(f.questionCountRaw).toBe('12');
    expect(f.recurrence).toBe('once');
    expect(f.runDate).toBe('2026-06-20');
    expect(f.runTime).toBe('18:00');
    expect(f.timezone).toBe('Africa/Accra');
  });

  it('maps weekly fields and "All" difficulty for null', () => {
    const f = draftToForm(weeklyDraft);
    expect(f.recurrence).toBe('weekly');
    expect(f.daysOfWeek).toEqual([1, 3]);
    expect(f.timeOfDay).toBe('18:00');
    expect(f.endsOn).toBe('2026-07-01');
    expect(f.difficulty).toBe('All');
    expect(f.topicId).toBe('');
  });
});

describe('describeDraft', () => {
  it('describes a once draft', () => {
    expect(describeDraft(onceDraft)).toContain('Thermodynamics');
    expect(describeDraft(onceDraft)).toContain('Entropy');
    expect(describeDraft(onceDraft)).toContain('12');
  });
  it('describes a weekly draft with days', () => {
    const d = describeDraft(weeklyDraft);
    expect(d).toContain('Mon');
    expect(d).toContain('Wed');
    expect(d).toContain('18:00');
  });
});
