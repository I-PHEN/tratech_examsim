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

// Matches the FormState fields in ScheduledScreen.tsx (partial — only what a
// draft sets). Difficulty uses the screen's 'All' | 'Easy' | 'Medium' | 'Hard'.
export interface DraftFormPatch {
  programCourseId: string;
  topicId: string;
  difficulty: 'All' | 'Easy' | 'Medium' | 'Hard';
  questionCount: number;
  questionCountRaw: string;
  timezone: string;
  recurrence: 'once' | 'weekly';
  runDate: string;
  runTime: string;
  daysOfWeek: number[];
  timeOfDay: string;
  endsOn: string;
  label: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function cap(s: string): 'Easy' | 'Medium' | 'Hard' {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as 'Easy' | 'Medium' | 'Hard';
}

export function draftToForm(p: AiScheduleProposal): DraftFormPatch {
  let runDate = '';
  let runTime = '';
  if (p.recurrence === 'once' && p.run_at) {
    const [d, t] = p.run_at.split('T');
    runDate = d ?? '';
    runTime = t ?? '';
  }
  return {
    programCourseId: p.program_course_id,
    topicId: p.topic_id ?? '',
    difficulty: p.difficulty ? cap(p.difficulty) : 'All',
    questionCount: p.question_count,
    questionCountRaw: String(p.question_count),
    timezone: p.timezone,
    recurrence: p.recurrence,
    runDate,
    runTime,
    daysOfWeek: p.days_of_week ?? [],
    timeOfDay: p.time_of_day ?? '',
    endsOn: p.ends_on ?? '',
    label: p.label ?? '',
  };
}

/** One-line human summary of a draft for the card. */
export function describeDraft(p: AiScheduleProposal): string {
  const subject = [p.course_name, p.topic_name].filter(Boolean).join(' · ') || 'Practice';
  const diff = p.difficulty ? p.difficulty.charAt(0).toUpperCase() + p.difficulty.slice(1) : 'All';
  let when: string;
  if (p.recurrence === 'once') {
    when = p.run_at ? p.run_at.replace('T', ' ') : 'once';
  } else {
    const days = (p.days_of_week ?? []).slice().sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(', ');
    when = `${days}${p.time_of_day ? ` · ${p.time_of_day}` : ''}`;
  }
  return `${subject} · ${diff} · ${p.question_count} Q · ${when}`;
}
