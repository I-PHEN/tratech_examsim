import { completion } from '../lib/llm';
import { gatherScheduleContext } from './scheduleAiContext';
import { buildSystemPrompt, buildUserPrompt, type CourseContext } from './scheduleAiPrompt';
import { parseModelOutput } from './scheduleAiParse';
import { validateProposal } from './scheduleAiValidate';
import type { AiDraftRequestInput } from '../schemas/scheduleAi';

const MAX_PROPOSALS = 7;

// The shape returned to the browser: schema-valid fields + resolved names + why.
export interface AiScheduleProposal {
  program_course_id: string;
  course_name: string | null;
  topic_id: string | null;
  topic_name: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  question_count: number;
  label: string | null;
  timezone: string;
  recurrence: 'once' | 'weekly';
  run_at: string | null;
  days_of_week: number[] | null;
  time_of_day: string | null;
  ends_on: string | null;
  why: string;
}

export interface AiDraftResult {
  proposals: AiScheduleProposal[];
  message: string;
}

function nameLookup(courses: CourseContext[]) {
  const courseName = new Map<string, string | null>();
  const topicName = new Map<string, string>();
  for (const c of courses) {
    courseName.set(c.program_course_id, c.course_name);
    for (const t of c.topics) topicName.set(t.topic_id, t.name);
  }
  return { courseName, topicName };
}

export async function draftSchedules(uid: string, input: AiDraftRequestInput): Promise<AiDraftResult> {
  const { courses, allowed } = await gatherScheduleContext(uid);
  if (courses.length === 0) {
    return {
      proposals: [],
      message:
        "I couldn't find any courses for your year and semester yet. Check your year/semester in Settings, or ask an admin to add courses.",
    };
  }

  const { content } = await completion({
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(courses, input.text, input.timezone, input.today) },
    ],
    responseFormat: 'json_object',
    temperature: 0.2,
    maxTokens: 2000,
  });

  const { message, proposals: rawProposals } = parseModelOutput(content);
  const { courseName, topicName } = nameLookup(courses);

  const proposals: AiScheduleProposal[] = [];
  for (const raw of rawProposals) {
    if (proposals.length >= MAX_PROPOSALS) break;
    const validated = validateProposal(raw, allowed);
    if (!validated) continue;
    const v = validated.value;
    const isOnce = v.recurrence === 'once';
    proposals.push({
      program_course_id: v.program_course_id,
      course_name: courseName.get(v.program_course_id) ?? null,
      topic_id: v.topic_id ?? null,
      topic_name: v.topic_id ? topicName.get(v.topic_id) ?? null : null,
      difficulty: v.difficulty ?? null,
      question_count: v.question_count,
      label: v.label ?? null,
      timezone: v.timezone,
      recurrence: v.recurrence,
      run_at: isOnce ? (v as { run_at: string }).run_at : null,
      days_of_week: isOnce ? null : (v as { days_of_week: number[] }).days_of_week,
      time_of_day: isOnce ? null : (v as { time_of_day: string }).time_of_day,
      ends_on: isOnce ? null : ((v as { ends_on?: string | null }).ends_on ?? null),
      why: validated.why,
    });
  }

  // If the model proposed nothing usable but said nothing, give a default nudge.
  const finalMessage =
    message || (proposals.length === 0
      ? "I couldn't turn that into a schedule. Tell me what to practice and when."
      : '');

  return { proposals, message: finalMessage };
}
