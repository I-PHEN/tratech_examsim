# AI Schedule Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline "✨ Ask AI to schedule" box to the Scheduled screen that turns plain English into validated, ready-to-save practice-schedule draft cards — never auto-creating anything.

**Architecture:** A new `POST /api/schedules/ai-draft` route gathers the user's engaged courses/topics + per-topic mastery, sends a strict structured-output prompt to Groq, then **re-validates every model proposal** against the existing `ScheduleCreate` Zod schema and the user's real course/topic ids before returning drafts. The frontend renders drafts as cards (Edit / Remove / Save / Save all); Save reuses the existing `POST /api/schedules`. Pure logic (model-output parsing, proposal validation, draft→form conversion, profile-period normalization) is unit-tested with vitest; the Groq call and DB/Firestore gathering are integration/manual.

**Tech Stack:** Express + tsx backend, Zod validation, Groq (`backend/lib/llm.ts` `completion` with `responseFormat: 'json_object'`), Supabase, React 19 + Vite, vitest, luxon.

---

## Design decisions that refine the spec

**Course scope comes from the profile's year + semester (the "global" period set in Settings).** The main app already lists a student's courses purely by `year_level` + `semester` (`App.tsx`: `GET /api/program-courses?year_level=…&semester=…`, no department filter), reading both from `userProfile`. The Scheduled screen now follows the same model: we **drop the department→year→sem pickers (`CourseSelect`) entirely** and show just **Course → Topic**, where the course list is the program-courses for the user's profile period. The backend AI-context gatherer reads the identical period from the Firestore profile, so the AI proposes from exactly the same course set the manual dropdown shows — no mismatch. Year/semester strings are normalised with the same `\D`-stripping helper the app already uses (`"Year 3"`/`"Sem 1"`/`"3"` → `3`/`1`). If no courses are linked to the user's period, the assistant returns no proposals and a polite "no courses for your year/semester yet" message.

Editing a draft puts the create form in a **draft-locked-course** mode: the course is shown read-only (the model already picked a valid one) and the user edits timing/topic/difficulty/count. To change the course, they Remove the draft and pick from the course dropdown.

---

## File structure

**Backend (new):**
- `backend/lib/period.ts` — pure year/semester normalisers (shared by the context gatherer).
- `backend/schemas/scheduleAi.ts` — Zod for the request body (`AiDraftRequest`).
- `backend/services/scheduleAiParse.ts` — pure: parse model JSON → `{ message, proposals[] }`.
- `backend/services/scheduleAiValidate.ts` — pure: validate one raw proposal against `ScheduleCreate` + allowed ids.
- `backend/services/scheduleAiPrompt.ts` — pure: build system + user prompts.
- `backend/services/scheduleAiContext.ts` — gather the profile-period courses/topics/mastery (DB + Firestore).
- `backend/services/scheduleAiService.ts` — orchestrator: context → prompt → Groq → parse → validate → attach names → cap.
- Tests: `period.test.ts`, `scheduleAiParse.test.ts`, `scheduleAiValidate.test.ts`, `scheduleAiPrompt.test.ts`.

**Backend (modified):**
- `backend/routes/schedules.ts` — add `POST /ai-draft`.

**Frontend (new):**
- `src/lib/period.ts` — pure year/semester normalisers (frontend copy; backend can't import from `src/`).
- `src/lib/scheduleDraft.ts` — pure: `AiScheduleProposal` type, `draftToForm`, `describeDraft`.
- `src/lib/scheduleDraft.test.ts` — vitest.
- `src/components/AiScheduleAssistant.tsx` — the input box + draft cards.

**Frontend (modified):**
- `src/components/ScheduledScreen.tsx` — **replace `CourseSelect` with a profile-period course `<select>`** (Course → Topic only), mount the assistant, prefill the form from a draft, render a read-only course label in edit/draft mode.

---

### Task 1: Request schema

**Files:**
- Create: `backend/schemas/scheduleAi.ts`

- [ ] **Step 1: Write the schema**

```ts
import { z } from 'zod';

// Browser-supplied context so relative phrases ("next Monday 6pm", "until June
// 20") resolve in the user's wall-clock. `today` is the user's local date.
export const AiDraftRequest = z.object({
  text: z.string().trim().min(1, 'Tell me what to practice and when.').max(1000),
  timezone: z.string().min(1, 'timezone is required'),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be "YYYY-MM-DD"'),
});

export type AiDraftRequestInput = z.infer<typeof AiDraftRequest>;
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS (no errors referencing `scheduleAi.ts`).

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/scheduleAi.ts
git commit -m "feat: Ai-draft request schema (AI schedule assistant)"
```

---

### Task 2: Pure model-output parser

The model is asked for `{"message": string, "proposals": [...]}` via `response_format: json_object`. Groq returns a JSON string, but we defend against fenced code blocks and missing keys.

**Files:**
- Create: `backend/services/scheduleAiParse.ts`
- Test: `backend/services/scheduleAiParse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseModelOutput } from './scheduleAiParse';

describe('parseModelOutput', () => {
  it('parses clean JSON with message + proposals', () => {
    const out = parseModelOutput('{"message":"Here you go","proposals":[{"a":1}]}');
    expect(out.message).toBe('Here you go');
    expect(out.proposals).toEqual([{ a: 1 }]);
  });

  it('strips a ```json fenced block', () => {
    const out = parseModelOutput('```json\n{"message":"hi","proposals":[]}\n```');
    expect(out.message).toBe('hi');
    expect(out.proposals).toEqual([]);
  });

  it('defaults proposals to [] when key is missing', () => {
    const out = parseModelOutput('{"message":"none"}');
    expect(out.proposals).toEqual([]);
    expect(out.message).toBe('none');
  });

  it('defaults message to empty string when missing', () => {
    const out = parseModelOutput('{"proposals":[]}');
    expect(out.message).toBe('');
  });

  it('drops non-array proposals to []', () => {
    const out = parseModelOutput('{"message":"x","proposals":"nope"}');
    expect(out.proposals).toEqual([]);
  });

  it('throws on unparseable content', () => {
    expect(() => parseModelOutput('not json at all')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/services/scheduleAiParse.test.ts`
Expected: FAIL with "parseModelOutput is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ParsedModelOutput {
  message: string;
  proposals: unknown[];
}

/**
 * Parse the model's JSON reply. Tolerates a ```json fenced block and missing
 * keys; throws only when the content is not parseable JSON at all.
 */
export function parseModelOutput(content: string): ParsedModelOutput {
  let text = content.trim();
  // Strip a ```json ... ``` (or plain ``` ... ```) fence if present.
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  const data = JSON.parse(text) as Record<string, unknown>;
  const message = typeof data.message === 'string' ? data.message : '';
  const proposals = Array.isArray(data.proposals) ? (data.proposals as unknown[]) : [];
  return { message, proposals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/services/scheduleAiParse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/scheduleAiParse.ts backend/services/scheduleAiParse.test.ts
git commit -m "feat: pure model-output parser for AI schedule assistant"
```

---

### Task 3: Pure proposal validator

Re-validate each model proposal against the real `ScheduleCreate` schema **and** confirm `program_course_id` / `topic_id` belong to the user's allowed set. This is the core guardrail — the server never trusts the model.

**Files:**
- Create: `backend/services/scheduleAiValidate.ts`
- Test: `backend/services/scheduleAiValidate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { validateProposal } from './scheduleAiValidate';

// course A allows topics t1,t2; course B allows no topics
const allowed = new Map<string, Set<string>>([
  ['11111111-1111-1111-1111-111111111111', new Set(['aaaaaaaa-1111-1111-1111-111111111111'])],
  ['22222222-2222-2222-2222-222222222222', new Set<string>()],
]);

const onceRaw = {
  program_course_id: '11111111-1111-1111-1111-111111111111',
  topic_id: 'aaaaaaaa-1111-1111-1111-111111111111',
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
    expect(r!.value.program_course_id).toBe(onceRaw.program_course_id);
    expect(r!.value.recurrence).toBe('once');
    expect(r!.why).toBe('Entropy is your weakest at 45%');
  });

  it('accepts a valid weekly proposal', () => {
    const r = validateProposal(
      {
        program_course_id: '11111111-1111-1111-1111-111111111111',
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
    const r = validateProposal(
      { ...onceRaw, program_course_id: '99999999-9999-9999-9999-999999999999' },
      allowed,
    );
    expect(r).toBeNull();
  });

  it('rejects a topic that does not belong to the course', () => {
    const r = validateProposal(
      { ...onceRaw, topic_id: 'bbbbbbbb-2222-2222-2222-222222222222' },
      allowed,
    );
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/services/scheduleAiValidate.test.ts`
Expected: FAIL with "validateProposal is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/services/scheduleAiValidate.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/scheduleAiValidate.ts backend/services/scheduleAiValidate.test.ts
git commit -m "feat: pure proposal validator (guardrail) for AI schedule assistant"
```

---

### Task 4: Pure prompt builders

**Files:**
- Create: `backend/services/scheduleAiPrompt.ts`
- Test: `backend/services/scheduleAiPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/services/scheduleAiPrompt.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/services/scheduleAiPrompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/scheduleAiPrompt.ts backend/services/scheduleAiPrompt.test.ts
git commit -m "feat: prompt builders for AI schedule assistant"
```

---

### Task 5: Period normaliser + context gatherer (DB)

The context set = program-courses for the user's **profile period** (`year_level` + `semester` from their Firestore profile), matching how the main app lists courses. For each: course name, topics, per-topic mastery. The period normaliser is pure (TDD); the gatherer is DB/Firestore-bound (verified in Task 8 manual E2E).

**Files:**
- Create: `backend/lib/period.ts`
- Test: `backend/lib/period.test.ts`
- Create: `backend/services/scheduleAiContext.ts`

- [ ] **Step 1: Write the failing period test**

```ts
import { describe, it, expect } from 'vitest';
import { toYearLevel, toSemester } from './period';

describe('period normalisers', () => {
  it('parses "Year 3" → 3', () => expect(toYearLevel('Year 3')).toBe(3));
  it('parses bare "3" → 3', () => expect(toYearLevel('3')).toBe(3));
  it('parses "Sem 2" → 2', () => expect(toSemester('Sem 2')).toBe(2));
  it('defaults missing/blank → 1', () => {
    expect(toYearLevel(undefined)).toBe(1);
    expect(toYearLevel('')).toBe(1);
    expect(toSemester(null)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/lib/period.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `backend/lib/period.ts`**

```ts
/** "Year 3" | "3" | "Y3" → 3 ; blank/invalid → 1. Mirrors App.tsx. */
export function toYearLevel(raw: string | undefined | null): number {
  if (!raw) return 1;
  return parseInt(String(raw).replace(/\D/g, ''), 10) || 1;
}

/** "Sem 1" | "1" → 1 ; blank/invalid → 1. */
export function toSemester(raw: string | undefined | null): number {
  if (!raw) return 1;
  return parseInt(String(raw).replace(/\D/g, ''), 10) || 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/lib/period.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `backend/services/scheduleAiContext.ts`**

```ts
import { supabase } from '../lib/supabase';
import { getDb } from '../lib/firebase-admin';
import { getCourseMastery } from './masteryService';
import { toYearLevel, toSemester } from '../lib/period';
import type { CourseContext } from './scheduleAiPrompt';

/**
 * Context = program-courses for the user's profile period (year_level +
 * semester, read from Firestore), matching how App.tsx lists courses (no
 * department filter). For each course: name, topics, and the user's per-topic
 * mastery. Returns the context list plus the `allowed` map (course id → set of
 * its topic ids) used by the validator.
 */
export async function gatherScheduleContext(
  uid: string,
): Promise<{ courses: CourseContext[]; allowed: Map<string, Set<string>> }> {
  // 1. Read the user's period from their Firestore profile.
  const snap = await getDb().collection('users').doc(uid).get();
  const profile = (snap.data() ?? {}) as { year?: string; semester?: string };
  const yl = toYearLevel(profile.year);
  const sm = toSemester(profile.semester);

  // 2. Program-courses for that period (no department filter — matches App.tsx).
  const { data: pcRows } = await supabase
    .from('program_courses')
    .select('id, courses(name)')
    .eq('year_level', yl)
    .eq('semester', sm);
  const pcs = (pcRows ?? []) as Array<Record<string, unknown>>;
  if (pcs.length === 0) return { courses: [], allowed: new Map() };

  const ids = pcs.map((r) => r.id as string);
  const nameById = new Map<string, string | null>();
  for (const row of pcs) {
    const courses = row.courses;
    const courseObj = Array.isArray(courses)
      ? (courses as Array<{ name: string }>)[0]
      : (courses as { name: string } | null);
    nameById.set(row.id as string, courseObj?.name ?? null);
  }

  // 3. Topics for all those courses in one query.
  const { data: topicRows } = await supabase
    .from('topics')
    .select('id, name, program_course_id')
    .in('program_course_id', ids)
    .order('name', { ascending: true });
  const topicsByCourse = new Map<string, Array<{ topic_id: string; name: string }>>();
  for (const t of (topicRows ?? []) as Array<{ id: string; name: string; program_course_id: string }>) {
    const arr = topicsByCourse.get(t.program_course_id) ?? [];
    arr.push({ topic_id: t.id, name: t.name });
    topicsByCourse.set(t.program_course_id, arr);
  }

  // 4. Mastery per course (one call each; small period set).
  const masteryByCourse = await Promise.all(
    ids.map(async (pcId) => {
      const m = await getCourseMastery(uid, pcId);
      const byTopic = new Map(m.map((x) => [x.topic_id, x]));
      return [pcId, byTopic] as const;
    }),
  );
  const masteryMap = new Map(masteryByCourse);

  // 5. Assemble.
  const allowed = new Map<string, Set<string>>();
  const courses: CourseContext[] = ids.map((pcId) => {
    const topics = topicsByCourse.get(pcId) ?? [];
    allowed.set(pcId, new Set(topics.map((t) => t.topic_id)));
    const mastery = masteryMap.get(pcId);
    return {
      program_course_id: pcId,
      course_name: nameById.get(pcId) ?? null,
      topics: topics.map((t) => {
        const m = mastery?.get(t.topic_id);
        return {
          topic_id: t.topic_id,
          name: t.name,
          mastery: m && m.state !== 'not_started' ? m.mastery : null,
          answered_count: m?.answered_count ?? 0,
        };
      }),
    };
  });

  return { courses, allowed };
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/lib/period.ts backend/lib/period.test.ts backend/services/scheduleAiContext.ts
git commit -m "feat: period normaliser + profile-period schedule-AI context gatherer"
```

---

### Task 6: Service orchestrator

**Files:**
- Create: `backend/services/scheduleAiService.ts`

- [ ] **Step 1: Write the implementation**

```ts
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
        "I couldn't find any courses you've practiced yet. Try a practice session first, or create a schedule manually below.",
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/services/scheduleAiService.ts
git commit -m "feat: AI schedule draft orchestrator (Groq -> validated drafts)"
```

---

### Task 7: Route

**Files:**
- Modify: `backend/routes/schedules.ts`

- [ ] **Step 1: Add the import and route**

Add to the imports at the top of `backend/routes/schedules.ts`:

```ts
import { AiDraftRequest } from '../schemas/scheduleAi';
import { draftSchedules } from '../services/scheduleAiService';
```

Then, immediately after the existing `router.post('/', ...)` block (and before `router.get('/:id', ...)` so the literal path is registered before the `:id` matcher), add:

```ts
router.post(
  '/ai-draft',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const body = parse(AiDraftRequest, req.body);
    res.json(await draftSchedules(uid, body));
  })
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Restart backend and smoke-test auth gating**

Restart per CLAUDE.md (kill port 3000 listener, `npm run dev` via Bash run_in_background), then:

Run: `curl -s -o NUL -w "%{http_code}" -X POST http://localhost:3000/api/schedules/ai-draft -H "Content-Type: application/json" -d "{}"`
Expected: `401` (route is mounted under `requireAuth`; unauthenticated returns 401, proving the path exists and is gated).

- [ ] **Step 4: Commit**

```bash
git add backend/routes/schedules.ts
git commit -m "feat: POST /api/schedules/ai-draft route"
```

---

### Task 8: Backend manual E2E

No code — verify the live endpoint end-to-end with a real Firebase token before touching the UI.

- [ ] **Step 1: Get a token + call the endpoint**

In the browser dev console while signed in to the running app:

```js
const t = await firebase.auth().currentUser.getIdToken();
const r = await fetch('/api/schedules/ai-draft', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  body: JSON.stringify({
    text: 'practice my weakest thermo topic every monday and wednesday at 6pm',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    today: new Date().toISOString().slice(0, 10),
  }),
});
console.log(await r.json());
```

Expected: `{ proposals: [...], message: "..." }`. Each proposal has a real `program_course_id` from your data, a `why`, coherent recurrence fields. Confirm an off-topic request (`"what is entropy?"`) returns `proposals: []` with a polite message.

- [ ] **Step 2: No commit** (verification only). If proposals are malformed, fix the prompt in `scheduleAiPrompt.ts` and re-run.

---

### Task 9: Frontend pure draft helpers

**Files:**
- Create: `src/lib/scheduleDraft.ts`
- Test: `src/lib/scheduleDraft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scheduleDraft.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scheduleDraft.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduleDraft.ts src/lib/scheduleDraft.test.ts
git commit -m "feat: pure draft->form + describe helpers (AI schedule assistant)"
```

---

### Task 10: AiScheduleAssistant component

**Files:**
- Create: `src/components/AiScheduleAssistant.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { Sparkles, Send, X, Loader2 } from 'lucide-react';
import { apiPost } from '../lib/apiClient';
import { Button } from './ui/Button';
import { describeDraft, type AiScheduleProposal } from '../lib/scheduleDraft';

interface AiDraftResponse {
  proposals: AiScheduleProposal[];
  message: string;
}

interface Props {
  /** Open the create form pre-filled from this draft (course locked). */
  onEditDraft: (draft: AiScheduleProposal) => void;
  /** Persist a draft via the existing create API; resolves on success. */
  onSaveDraft: (draft: AiScheduleProposal) => Promise<void>;
  /** Called after one or more drafts are saved, so the list can refresh. */
  onSaved: () => void;
}

export function AiScheduleAssistant({ onEditDraft, onSaveDraft, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<AiScheduleProposal[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  async function handleSend() {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setDrafts([]);
    try {
      const res = await apiPost<AiDraftResponse>('/api/schedules/ai-draft', {
        text: t,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        today: new Date().toISOString().slice(0, 10),
      });
      setDrafts(res.proposals);
      setMessage(res.message || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t draft that — try rephrasing.');
    } finally {
      setLoading(false);
    }
  }

  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveOne(idx: number) {
    setSavingIdx(idx);
    setError(null);
    try {
      await onSaveDraft(drafts[idx]);
      removeDraft(idx);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that schedule.');
    } finally {
      setSavingIdx(null);
    }
  }

  async function saveAll() {
    setSavingAll(true);
    setError(null);
    const remaining = [...drafts];
    const failed: AiScheduleProposal[] = [];
    for (const d of remaining) {
      try {
        await onSaveDraft(d);
      } catch {
        failed.push(d);
      }
    }
    setDrafts(failed);
    if (failed.length > 0) setError(`${failed.length} schedule(s) could not be saved.`);
    setSavingAll(false);
    onSaved();
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-bg-raised/40 transition-colors"
      >
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="font-semibold text-sm text-text-primary">Ask AI to schedule</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border-subtle pt-4">
          <div className="flex items-start gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
              }}
              rows={2}
              placeholder='e.g. "reactor design Mon/Wed/Fri 6pm" or "thermo exam June 20, I’m weak on entropy"'
              className="flex-1 bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none placeholder:text-text-tertiary resize-none"
            />
            <Button variant="primary" size="sm" onClick={handleSend} loading={loading} disabled={loading || !text.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-[11px] text-text-tertiary">
            I only help schedule practice — I can’t answer exam questions.
          </p>

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs bg-[color:var(--danger-bg)] border border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
              {error}
            </div>
          )}

          {message && drafts.length === 0 && !loading && (
            <div className="px-3 py-2 rounded-lg text-xs bg-bg-raised text-text-secondary">{message}</div>
          )}

          {drafts.length > 0 && (
            <div className="space-y-2">
              {drafts.map((d, idx) => (
                <div key={idx} className="rounded-xl border border-border-subtle bg-bg-raised px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary leading-snug">{describeDraft(d)}</p>
                    <button
                      type="button"
                      aria-label="Remove draft"
                      onClick={() => removeDraft(idx)}
                      className="p-0.5 rounded text-text-tertiary hover:text-text-primary"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {d.why && <p className="text-xs text-text-secondary mt-0.5">{d.why}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="primary" size="sm" onClick={() => saveOne(idx)} loading={savingIdx === idx} disabled={savingAll || savingIdx !== null}>
                      Save
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onEditDraft(d)} disabled={savingAll || savingIdx !== null}>
                      Edit
                    </Button>
                  </div>
                </div>
              ))}

              {drafts.length > 1 && (
                <Button variant="secondary" size="sm" onClick={saveAll} disabled={savingAll || savingIdx !== null}>
                  {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : `Save all (${drafts.length})`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS. (Confirm `Button` accepts `loading`/`size`/`variant` — it is already used that way in ScheduledScreen.tsx.)

- [ ] **Step 3: Commit**

```bash
git add src/components/AiScheduleAssistant.tsx
git commit -m "feat: AiScheduleAssistant component (input + draft cards)"
```

---

### Task 11: Profile-period course picker + wire in the assistant

Two changes to ScheduledScreen: (a) replace the `CourseSelect` (department→year→sem→course) with a simple **course `<select>`** populated from the user's profile period — Course → Topic only; and (b) mount the AI assistant. Editing a draft pre-fills the create form with the course shown read-only. Saving a draft posts to the existing create API.

**Files:**
- Create: `src/lib/period.ts`
- Modify: `src/components/ScheduledScreen.tsx`

- [ ] **Step 1: Create the frontend period helpers**

Create `src/lib/period.ts` (identical logic to `backend/lib/period.ts`; backend can't import from `src/`):

```ts
/** "Year 3" | "3" | "Y3" → 3 ; blank/invalid → 1. */
export function toYearLevel(raw: string | undefined | null): number {
  if (!raw) return 1;
  return parseInt(String(raw).replace(/\D/g, ''), 10) || 1;
}

/** "Sem 1" | "1" → 1 ; blank/invalid → 1. */
export function toSemester(raw: string | undefined | null): number {
  if (!raw) return 1;
  return parseInt(String(raw).replace(/\D/g, ''), 10) || 1;
}
```

- [ ] **Step 2: Update imports**

At the top of `src/components/ScheduledScreen.tsx`: **remove** the `CourseSelect` import (`import { CourseSelect } from './admin/CourseSelect';`) and **add**:

```ts
import { useAuth } from '../lib/AuthContext';
import { toYearLevel, toSemester } from '../lib/period';
import { AiScheduleAssistant } from './AiScheduleAssistant';
import { draftToForm, type AiScheduleProposal } from '../lib/scheduleDraft';
```

- [ ] **Step 3: Add a ProgramCourse type**

Next to the existing `interface ApiTopic` near the top of the file, add:

```ts
interface ApiProgramCourse {
  id: string;
  courses: { name: string } | null;
}
```

- [ ] **Step 4: Add course-list + draft-lock state**

Immediately after the `const [formOpen, setFormOpen] = useState(false);` line, add:

```ts
  // Courses for the user's profile period (year + semester from Settings).
  const { userProfile } = useAuth();
  const [courses, setCourses] = useState<ApiProgramCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // When a draft from the AI assistant is loaded into the create form, the course
  // is fixed (the model already chose a valid one) — show it read-only.
  const [draftCourseName, setDraftCourseName] = useState<string | null>(null);
```

- [ ] **Step 5: Fetch the period courses**

Add this effect right after the existing `useEffect(() => { loadSchedules(); ... }, []);` block:

```ts
  // Load the courses for the user's profile period (matches how App.tsx lists them).
  useEffect(() => {
    const yl = toYearLevel(userProfile?.year);
    const sm = toSemester(userProfile?.semester);
    let cancelled = false;
    setCoursesLoading(true);
    apiGet<ApiProgramCourse[]>(`/api/program-courses?year_level=${yl}&semester=${sm}`)
      .then((rows) => { if (!cancelled) setCourses(rows); })
      .catch(() => { if (!cancelled) setCourses([]); })
      .finally(() => { if (!cancelled) setCoursesLoading(false); });
    return () => { cancelled = true; };
  }, [userProfile?.year, userProfile?.semester]);
```

- [ ] **Step 6: Clear draft-lock in cancelEdit and enterEditMode**

In `cancelEdit`, after `setForm(EMPTY_FORM);`, add `setDraftCourseName(null);`.
In `enterEditMode`, after `setEditingId(row.id);`, add `setDraftCourseName(null);`.

- [ ] **Step 7: Add the draft handlers**

Add these functions just before `const editingRow = ...` near the bottom of the component body:

```ts
  // Pre-fill the create form from an AI draft (course locked, create mode).
  function prefillFromDraft(d: AiScheduleProposal) {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, ...draftToForm(d) });
    setDraftCourseName(d.course_name ?? 'Selected course');
    setFormError(null);
    setFormSuccess(false);
    setFormOpen(true);
  }

  // Persist a single AI draft via the existing create API.
  async function saveDraft(d: AiScheduleProposal) {
    const payload: Record<string, unknown> = {
      program_course_id: d.program_course_id,
      topic_id: d.topic_id ?? undefined,
      difficulty: d.difficulty ?? undefined,
      question_count: d.question_count,
      label: d.label ?? undefined,
      timezone: d.timezone,
      recurrence: d.recurrence,
    };
    if (d.recurrence === 'once') {
      payload.run_at = d.run_at;
    } else {
      payload.days_of_week = d.days_of_week;
      payload.time_of_day = d.time_of_day;
      if (d.ends_on) payload.ends_on = d.ends_on;
    }
    await apiPost('/api/schedules', payload);
  }
```

- [ ] **Step 8: Render the assistant above the form card**

Find the `{/* Form card */}` comment and insert this block immediately before it:

```tsx
        {/* AI assistant */}
        <AiScheduleAssistant
          onEditDraft={prefillFromDraft}
          onSaveDraft={saveDraft}
          onSaved={() => { setFormSuccess(true); loadSchedules(); }}
        />

```

- [ ] **Step 9: Replace the Course block (CourseSelect → profile `<select>`)**

Replace the entire current Course block:

```tsx
              {/* Course */}
              {editingId ? (
                <div>
                  <span className={labelCls}>Course</span>
                  <div className="px-3 py-2 bg-bg-sunken border border-border-subtle rounded-xl text-sm text-text-primary">
                    {editingRow?.course_name ?? '—'}
                  </div>
                </div>
              ) : (
                <div>
                  <span className={labelCls}>Course</span>
                  <CourseSelect
                    value={form.programCourseId}
                    onChange={(id) => updateForm({ programCourseId: id, topicId: '' })}
                    persistKey="schedule"
                  />
                </div>
              )}
```

with:

```tsx
              {/* Course — read-only when editing or draft-locked, else a period dropdown */}
              {editingId || draftCourseName ? (
                <div>
                  <span className={labelCls}>Course</span>
                  <div className="px-3 py-2 bg-bg-sunken border border-border-subtle rounded-xl text-sm text-text-primary">
                    {editingId ? (editingRow?.course_name ?? '—') : draftCourseName}
                  </div>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Course</label>
                  {!coursesLoading && courses.length === 0 ? (
                    <div className="px-3 py-2 bg-bg-sunken border border-border-subtle rounded-xl text-xs text-text-secondary">
                      No courses for {userProfile?.year ?? 'your year'}, {userProfile?.semester ?? 'your semester'} yet. Set your year &amp; semester in Settings.
                    </div>
                  ) : (
                    <select
                      value={form.programCourseId}
                      onChange={(e) => updateForm({ programCourseId: e.target.value, topicId: '' })}
                      disabled={coursesLoading}
                      className={inputCls}
                    >
                      <option value="" disabled hidden>
                        {coursesLoading ? 'Loading…' : '— pick a course —'}
                      </option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>{c.courses?.name ?? 'Course'}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
```

- [ ] **Step 10: Topic field renders unchanged**

The Topic block condition is `{(form.programCourseId || editingId) && (`. Since both a manual course pick and a draft set `form.programCourseId`, the topic field renders and its existing `useEffect` fetches topics for that course — no change needed. Verify by reading the block.

- [ ] **Step 11: Typecheck**

Run: `npm run lint`
Expected: PASS — and confirm no remaining reference to `CourseSelect` in the file.

- [ ] **Step 12: Commit**

```bash
git add src/lib/period.ts src/components/ScheduledScreen.tsx
git commit -m "feat: profile-period course picker + AI assistant in ScheduledScreen"
```

---

### Task 12: Full E2E + final verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — including the new `scheduleAiParse`, `scheduleAiValidate`, `scheduleAiPrompt`, `scheduleDraft` tests, and all pre-existing tests.

- [ ] **Step 2: Manual UI E2E (frontend hot-reloads; backend already restarted in Task 7)**

In the running app → Scheduled screen:
0. Open "+ New schedule" → confirm the course field is now a single dropdown of your current year/semester courses (no department/year/sem pickers), then Topic. Picking a course loads its topics.
1. Open "Ask AI to schedule", type *"practice my weakest thermo topic every Monday and Wednesday at 6pm"*, Send.
2. Confirm one or more draft cards appear with a `why` line.
3. Click **Edit** on a card → the create form opens pre-filled, course shown read-only, topic/difficulty/days/time populated. Adjust and Save → it appears in the list.
4. Send again, click **Save** directly on a card → appears in the list, card disappears.
5. With multiple drafts, click **Save all** → all appear; list refreshes.
6. Type an off-topic request (*"what is entropy?"*) → no cards, polite message.
7. Confirm a brand-new account (no sessions) gets the "practice first" message.

- [ ] **Step 3: Commit any fixes, then push**

```bash
git push
```

(Render auto-deploys from `main`. The feature degrades safely: if `GROQ_API_KEY` were ever unset, `/ai-draft` returns a 500 surfaced as the inline "Couldn't draft that" error — no other screen is affected.)

---

## Self-review

- **Spec coverage:**
  - Inline "describe it" box + draft cards (Edit/Remove/Save/Save all) → Tasks 10–11. ✓
  - `POST /api/schedules/ai-draft` (requireAuth) → Task 7. ✓
  - Gather context (courses/topics + mastery) → Task 5 (profile-period courses; documented above). ✓
  - Scheduled screen uses the profile period (year+sem from Settings); department/year/sem pickers removed → Task 11. ✓
  - Strict structured-output Groq call → Tasks 4, 6. ✓
  - Server re-validates every proposal vs `ScheduleCreate` + real ids; drops invalid → Task 3. ✓
  - Drafts not saved; save reuses `POST /api/schedules` → Tasks 10–11. ✓
  - Guardrails / off-topic → empty proposals + message → Tasks 4, 6, 10. ✓
  - Transparent planning (`why`, mastery surfaced) → Tasks 4, 6, 10. ✓
  - Browser passes IANA tz + today → Tasks 1, 10. ✓
  - LLM failure → inline error; no course/topic → message → Tasks 6, 10. ✓
  - Cap ~7 proposals; 50-active cap on save → Task 6 (`MAX_PROPOSALS`), existing `createSchedule` cap. ✓
  - Pure logic unit-tested; LLM/DB manual → Tasks 2, 3, 4, 9 (vitest); 5, 6, 8 (manual). ✓
  - Out of scope (chat, editing existing via AI, timed exams) → not built. ✓
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `AiScheduleProposal` is defined identically in `scheduleAiService.ts` (backend response) and `scheduleDraft.ts` (frontend); `draftToForm` returns fields matching `FormState` in ScheduledScreen.tsx (`programCourseId`, `questionCountRaw`, `daysOfWeek`, etc.); `validateProposal` → `{ value, why }` consumed by the orchestrator; `gatherScheduleContext` returns `{ courses, allowed }` consumed by the orchestrator and validator. Consistent.
