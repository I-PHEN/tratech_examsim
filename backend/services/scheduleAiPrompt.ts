export interface TopicContext {
  topic_id: string;
  name: string;
  mastery: number | null;     // 0-100, null when not enough data
  answered_count: number;
}

export interface CourseContext {
  program_course_id: string;
  course_name: string | null;
  topics: TopicContext[];
}

export function buildSystemPrompt(): string {
  return [
    'You are a scheduling assistant for a practice-exam app. You do ONE thing:',
    'turn the student\'s request into one or more practice-schedule proposals.',
    'You cannot answer questions, tutor, or do anything other than propose schedules.',
    '',
    'Reply ONLY with JSON of the shape:',
    '{ "message": string, "proposals": Proposal[] }',
    '',
    'Each Proposal:',
    '{',
    '  "program_course_id": string,   // MUST be one of the provided ids',
    '  "topic_id": string | null,     // MUST be a topic id of that course, or null for mixed',
    '  "difficulty": "easy"|"medium"|"hard"|null,',
    '  "question_count": integer 1-50,',
    '  "label": string | null,',
    '  "timezone": string,            // echo the provided timezone',
    '  "recurrence": "once" | "weekly",',
    '  "run_at": "YYYY-MM-DDTHH:mm" | null,   // required when recurrence=once, else null',
    '  "days_of_week": number[] | null,       // required when weekly; 0=Sun..6=Sat',
    '  "time_of_day": "HH:mm" | null,         // required when weekly',
    '  "ends_on": "YYYY-MM-DD" | null,        // optional, weekly only',
    '  "why": string                  // one short line: why this topic/timing',
    '}',
    '',
    'Rules:',
    '- Use ONLY the program_course_id and topic_id values from the provided context.',
    '- Prioritise weak topics (low mastery) when the student asks for help planning,',
    '  and cite the reason in "why" (e.g. "Entropy — your weakest at 45%").',
    '- Resolve relative dates/times against the provided today + timezone.',
    '- Propose at most 7 schedules.',
    '- If the request is off-topic, unclear, or no matching course/topic exists,',
    '  return an empty proposals array and a short helpful message.',
  ].join('\n');
}

export function buildUserPrompt(
  courses: CourseContext[],
  text: string,
  timezone: string,
  today: string,
): string {
  const context = courses.map((c) => ({
    program_course_id: c.program_course_id,
    course_name: c.course_name,
    topics: c.topics.map((t) => ({
      topic_id: t.topic_id,
      name: t.name,
      mastery: t.mastery,
      answered: t.answered_count,
    })),
  }));

  return [
    `today: ${today}`,
    `timezone: ${timezone}`,
    '',
    'available courses and topics (with the student\'s topic mastery 0-100):',
    JSON.stringify(context, null, 2),
    '',
    `student request: ${text}`,
  ].join('\n');
}
