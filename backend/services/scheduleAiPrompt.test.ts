import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, type CourseContext } from './scheduleAiPrompt';

const courses: CourseContext[] = [
  {
    program_course_id: '11111111-1111-1111-1111-111111111111',
    course_name: 'Thermodynamics',
    topics: [
      { topic_id: 'aaaaaaaa-1111-1111-1111-111111111111', name: 'Entropy', mastery: 45, answered_count: 12 },
      { topic_id: 'aaaaaaaa-2222-2222-2222-222222222222', name: 'Enthalpy', mastery: 80, answered_count: 6 },
    ],
  },
];

describe('buildSystemPrompt', () => {
  it('states the only-schedule guardrail and the JSON contract', () => {
    const sys = buildSystemPrompt();
    expect(sys).toMatch(/only/i);
    expect(sys).toMatch(/proposals/);
    expect(sys).toMatch(/program_course_id/);
    expect(sys).toMatch(/0=Sun/);
  });
});

describe('buildUserPrompt', () => {
  it('embeds today, timezone, the request text, and the course/topic ids', () => {
    const p = buildUserPrompt(courses, 'thermo entropy mon wed 6pm', 'Africa/Accra', '2026-06-06');
    expect(p).toContain('2026-06-06');
    expect(p).toContain('Africa/Accra');
    expect(p).toContain('thermo entropy mon wed 6pm');
    expect(p).toContain('11111111-1111-1111-1111-111111111111');
    expect(p).toContain('aaaaaaaa-1111-1111-1111-111111111111');
    expect(p).toContain('Entropy');
    expect(p).toContain('45'); // mastery surfaced for transparent planning
  });
});
