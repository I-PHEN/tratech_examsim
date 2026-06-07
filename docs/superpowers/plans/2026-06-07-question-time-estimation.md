# Question Time Estimation + Practice Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author set an optional per-question solve-time estimate when creating questions, and use the aggregate (with a buffer) to prefill the recommended practice timer — which the student can still edit.

**Architecture:** Add a nullable `estimated_minutes` column to `questions` (one estimate per logical question; for a multi-part group it lives on the lead part). The author enters it in Manual Entry. A pure helper turns per-question estimates (or a type+difficulty fallback) into a recommended duration: `roundUpTo5(sum × 1.15)`. A new `GET /api/sessions/estimate-time` computes a representative recommendation from the eligible question pool (group-aware via `groupIntoLogical` from the previous plan), and the practice confirm screen prefills its editable time box from it — replacing the old `count × 2` heuristic.

**Tech Stack:** TypeScript, Express, Supabase (service-role), Zod, React 19, Vitest (`npx vitest run`), `npm run lint` (`tsc --noEmit`). Backend has NO watch mode — restart after backend edits.

**Out of scope (separate later plan):** AI "Suggest" button in Manual Entry, AI auto-estimate in the ingestion pipeline + draft review, and the multi-part Group Editor estimate field. This plan covers manual entry + aggregation + the practice recommendation end to end.

---

## File Structure

- **DB migration** — add `questions.estimated_minutes smallint` (nullable).
- **Modify** `backend/schemas/question.ts` — add `estimated_minutes` to `QuestionCreate` and `QuestionUpdate`.
- **Modify** `backend/services/questionService.ts` — surface/persist `estimated_minutes` (type, join row, `getQuestionById`, `createQuestion`, `updateQuestion`).
- **Create** `backend/lib/timeEstimate.ts` (+ `.test.ts`) — pure fallback table + buffer + recommendation math.
- **Create** `backend/services/estimateService.ts` — pool query → recommended minutes (uses `groupIntoLogical` + `timeEstimate`).
- **Modify** `backend/routes/sessions.ts` — add `GET /estimate-time`.
- **Modify** `backend/schemas/session.ts` — reuse `SessionPickQuery` for the estimate query (already has the fields).
- **Modify** `src/components/admin/ManualQuestionEntry.tsx` — optional "Est. solve time (min)" input + payload wiring.
- **Modify** `src/App.tsx` — practice confirm screen prefills the time box from `/estimate-time`.

Tests cover the pure helper (`timeEstimate`). DB/service/route/UI wiring is verified by `npm run lint` + manual check, per the codebase convention.

---

### Task 1: DB migration — `estimated_minutes` column

**Files:** Supabase migration (DDL).

- [ ] **Step 1: Apply the migration**

Use the Supabase migration tool (`mcp__supabase__apply_migration`) with name `add_questions_estimated_minutes` and this SQL:

```sql
alter table questions
  add column estimated_minutes smallint;

comment on column questions.estimated_minutes is
  'Optional author estimate of solve time in minutes. For a multi-part group the estimate lives on the lead (lowest part_index) part; other parts are null.';
```

If the Supabase MCP tool is unavailable, run the same SQL against the project via the SQL editor. The column is nullable with no default — existing rows become `null` (they fall back to the type+difficulty table).

- [ ] **Step 2: Verify the column exists**

Run (via `mcp__supabase__execute_sql` or SQL editor):

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'questions' and column_name = 'estimated_minutes';
```

Expected: one row, `smallint`, `is_nullable = YES`.

(No code commit for this task — it's a remote DDL change. The schema/service tasks that follow are what get committed.)

---

### Task 2: Schema — accept `estimated_minutes`

**Files:**
- Modify: `backend/schemas/question.ts`

- [ ] **Step 1: Add the field to `McqCreate` and `CalcCreate`**

In `backend/schemas/question.ts`, both `McqCreate` and `CalcCreate` are `z.object({...})` with top-level keys `program_course_id, topic_id, type, difficulty, exam_scope, ...GroupFields, content, ...`. Add this key to BOTH objects (put it right after the `...GroupFields,` spread):

```ts
  estimated_minutes: z.number().int().min(1).max(600).optional(),
```

- [ ] **Step 2: Add the field to `McqUpdate` and `CalcUpdate`**

Both update objects have top-level `topic_id, type, difficulty, exam_scope, content, ...`. Add the same line to BOTH (after `exam_scope: ExamScope,`):

```ts
  estimated_minutes: z.number().int().min(1).max(600).optional(),
```

- [ ] **Step 2b: Type-check**

Run: `npm run lint`
Expected: PASS. (`QuestionCreateInput` / `QuestionUpdateInput` now include the optional field.)

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/question.ts
git commit -m "feat: accept optional estimated_minutes on question create/update

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Persist & surface `estimated_minutes` in questionService

**Files:**
- Modify: `backend/services/questionService.ts`

- [ ] **Step 1: Add to the `QuestionWithContent` interface**

In `backend/services/questionService.ts`, the `export interface QuestionWithContent {` block (lines ~109-125) has `part_index: number | null;`. Add directly after it:

```ts
  estimated_minutes: number | null;
```

- [ ] **Step 2: Add to the `QuestionJoinRow` interface**

The `interface QuestionJoinRow {` block (lines ~186-201) also has `part_index: number | null;`. Add directly after it:

```ts
  estimated_minutes: number | null;
```

- [ ] **Step 3: Select and map it in `getQuestionById`**

In `getQuestionById`, the `.select(...)` string begins:
`'id, program_course_id, topic_id, type, difficulty, exam_scope, answer_type, ' + 'question_group_id, part_label, part_index, ' + ...`.
Change the second line of that select string to include `estimated_minutes`:

```ts
        'question_group_id, part_label, part_index, estimated_minutes, ' +
```

Then in the `const result: QuestionWithContent = { ... }` object, after `part_index: row.part_index,` add:

```ts
    estimated_minutes: row.estimated_minutes,
```

- [ ] **Step 4: Persist in `createQuestion`**

In `createQuestion`, the `const questionRow = { ... }` object ends with `part_index: input.part_index ?? null,`. Add after it:

```ts
    estimated_minutes: input.estimated_minutes ?? null,
```

- [ ] **Step 5: Persist in `updateQuestion`**

In `updateQuestion`, the `const questionPatch = { topic_id, difficulty, exam_scope, answer_type }` object — add:

```ts
    estimated_minutes: input.estimated_minutes ?? null,
```

(So editing a question without sending the field clears it to null; Manual Entry always sends the current value, so a saved estimate round-trips.)

- [ ] **Step 6: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Manual verification (restart backend)**

Restart backend:
```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```
Then `npm run dev` (Bash `run_in_background`). `POST /api/questions` with an `estimated_minutes` value, then `GET /api/questions/:id` and confirm the value round-trips; POST without it → stored/returned `null`.

- [ ] **Step 8: Commit**

```bash
git add backend/services/questionService.ts
git commit -m "feat: persist and surface estimated_minutes on questions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `timeEstimate` pure helper + tests

**Files:**
- Create: `backend/lib/timeEstimate.ts`
- Test: `backend/lib/timeEstimate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/lib/timeEstimate.test.ts
import { describe, it, expect } from 'vitest';
import { fallbackMinutes, questionMinutes, bufferAndRound, recommendMinutes } from './timeEstimate';

describe('fallbackMinutes', () => {
  it('uses the type+difficulty table', () => {
    expect(fallbackMinutes('mcq', 'easy')).toBe(1);
    expect(fallbackMinutes('mcq', 'hard')).toBe(3);
    expect(fallbackMinutes('calc', 'easy')).toBe(5);
    expect(fallbackMinutes('calc', 'medium')).toBe(12);
    expect(fallbackMinutes('calc', 'hard')).toBe(25);
  });
  it('defaults a null/unknown difficulty to medium', () => {
    expect(fallbackMinutes('calc', null)).toBe(12);
  });
});

describe('questionMinutes', () => {
  it('prefers the explicit estimate', () => {
    expect(questionMinutes({ type: 'calc', difficulty: 'hard', estimated_minutes: 30 })).toBe(30);
  });
  it('falls back when estimate is null', () => {
    expect(questionMinutes({ type: 'calc', difficulty: 'hard', estimated_minutes: null })).toBe(25);
  });
});

describe('bufferAndRound', () => {
  it('adds 15% and rounds UP to the next 5 minutes', () => {
    // 30 * 1.15 = 34.5 -> 35
    expect(bufferAndRound(30)).toBe(35);
    // 10 * 1.15 = 11.5 -> 15
    expect(bufferAndRound(10)).toBe(15);
  });
  it('never returns less than 5', () => {
    expect(bufferAndRound(0)).toBe(5);
    expect(bufferAndRound(1)).toBe(5);
  });
});

describe('recommendMinutes', () => {
  it('sums all estimates when the pool is no larger than count', () => {
    // sum = 5 + 25 = 30 -> *1.15 = 34.5 -> 35
    expect(recommendMinutes([5, 25], 2)).toBe(35);
    expect(recommendMinutes([5, 25], 10)).toBe(35);
  });
  it('scales the average by count when the pool is larger than count', () => {
    // avg = (10+20+30)/3 = 20; * count(2) = 40; *1.15 = 46 -> 50
    expect(recommendMinutes([10, 20, 30], 2)).toBe(50);
  });
  it('returns 0 for an empty pool', () => {
    expect(recommendMinutes([], 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/lib/timeEstimate.test.ts`
Expected: FAIL (import cannot be resolved).

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/lib/timeEstimate.ts

export type QuestionType = 'mcq' | 'calc';
type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Default solve-time (minutes) when a question has no explicit estimate. Keyed
 * by type then difficulty. Tunable.
 */
const FALLBACK: Record<QuestionType, Record<Difficulty, number>> = {
  mcq: { easy: 1, medium: 2, hard: 3 },
  calc: { easy: 5, medium: 12, hard: 25 },
};

/** Fallback minutes for a type+difficulty; a null/unknown difficulty is treated as medium. */
export function fallbackMinutes(type: QuestionType, difficulty: string | null): number {
  const d: Difficulty =
    difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
      ? difficulty
      : 'medium';
  return FALLBACK[type][d];
}

/** Minutes for one logical question: the explicit estimate, else the fallback. */
export function questionMinutes(q: {
  type: QuestionType;
  difficulty: string | null;
  estimated_minutes: number | null;
}): number {
  return q.estimated_minutes != null ? q.estimated_minutes : fallbackMinutes(q.type, q.difficulty);
}

/** Add a 15% cushion and round UP to the next 5 minutes; never below 5. */
export function bufferAndRound(minutes: number): number {
  const buffered = minutes * 1.15;
  const rounded = Math.ceil(buffered / 5) * 5;
  return Math.max(5, rounded);
}

/**
 * Recommended practice duration for `count` questions drawn from a pool whose
 * per-logical-question minutes are `perQuestionMinutes`. If the pool is no larger
 * than `count`, the student will get all of them, so sum directly; otherwise use
 * the pool average scaled to `count`. Then apply the buffer. Empty pool → 0.
 */
export function recommendMinutes(perQuestionMinutes: number[], count: number): number {
  const n = perQuestionMinutes.length;
  if (n === 0) return 0;
  const sum = perQuestionMinutes.reduce((s, m) => s + m, 0);
  const base = n <= count ? sum : (sum / n) * count;
  return bufferAndRound(base);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/lib/timeEstimate.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/timeEstimate.ts backend/lib/timeEstimate.test.ts
git commit -m "feat: timeEstimate — fallback table, 15% buffer, pool recommendation math

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `estimateService` + `GET /api/sessions/estimate-time`

**Files:**
- Create: `backend/services/estimateService.ts`
- Modify: `backend/routes/sessions.ts`

- [ ] **Step 1: Write the service**

Create `backend/services/estimateService.ts`:

```ts
import { supabase } from '../lib/supabase';
import { groupIntoLogical } from '../lib/logicalQuestions';
import { questionMinutes, recommendMinutes, type QuestionType } from '../lib/timeEstimate';
import type { SessionPickInput } from '../schemas/session';

const DEFAULT_COUNT: Record<SessionPickInput['mode'], number> = {
  practice: 10,
  diagnostic: 20,
  midsem: 30,
  full_exam: 60,
};

function scopesForMode(mode: SessionPickInput['mode']): Array<'midsem' | 'final' | 'both'> {
  if (mode === 'midsem') return ['midsem', 'both'];
  return ['midsem', 'final', 'both'];
}

interface EstimateRow {
  id: string;
  type: QuestionType;
  difficulty: string | null;
  estimated_minutes: number | null;
  question_group_id: string | null;
  part_index: number | null;
}

/**
 * Recommended practice duration (minutes) for the given course/mode/topic/
 * difficulty and question count. Counts a multi-part group as ONE logical
 * question (estimate taken from its lead part), falls back to a type+difficulty
 * table for un-estimated questions, and applies the standard buffer. Returns 0
 * when the pool is empty (caller leaves the existing default in place).
 */
export async function recommendedPracticeMinutes(input: SessionPickInput): Promise<number> {
  const count = input.count ?? DEFAULT_COUNT[input.mode];
  const scopes = scopesForMode(input.mode);

  let q = supabase
    .from('questions')
    .select('id, type, difficulty, estimated_minutes, question_group_id, part_index')
    .eq('program_course_id', input.program_course_id)
    .in('exam_scope', scopes);
  if (input.mode === 'practice' && input.topic_id) q = q.eq('topic_id', input.topic_id);
  if (input.difficulty && input.mode !== 'diagnostic') q = q.eq('difficulty', input.difficulty);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as EstimateRow[];
  // Collapse multi-part groups to one logical question (the lead part carries the
  // estimate), then map each to its minutes (explicit estimate or fallback).
  const perQuestion = groupIntoLogical(rows).map((u) =>
    questionMinutes({
      type: u.lead.type,
      difficulty: u.lead.difficulty,
      estimated_minutes: u.lead.estimated_minutes,
    })
  );
  return recommendMinutes(perQuestion, count);
}
```

- [ ] **Step 2: Add the route**

In `backend/routes/sessions.ts`, the file imports session services and uses `parse(...)` with schemas. Add an import for the new service and `SessionPickQuery`, then add a GET route. At the top, alongside the existing service imports add:

```ts
import { recommendedPracticeMinutes } from '../services/estimateService';
```

And ensure `SessionPickQuery` is imported from `'../schemas/session'` (add it to the existing import from that module if not already there).

Then add this route (place it next to the other `router.get(...)` definitions):

```ts
router.get(
  '/estimate-time',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(SessionPickQuery, req.query);
    const recommended_minutes = await recommendedPracticeMinutes(query);
    res.json({ recommended_minutes });
  })
);
```

IMPORTANT: place this BEFORE any `router.get('/:id', ...)` route, otherwise Express matches `/:id` first and treats `estimate-time` as a session id. If `/:id` is above it, move `/estimate-time` above `/:id`.

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verification (restart backend)**

Restart backend. With an authenticated token, `GET /api/sessions/estimate-time?program_course_id=<id>&mode=practice&count=4` returns `{ "recommended_minutes": <n> }`. For a course/topic with estimates set, `n` should reflect them; with none set it reflects the fallback table; both buffered/rounded to a multiple of 5. An empty pool returns `0`.

- [ ] **Step 5: Commit**

```bash
git add backend/services/estimateService.ts backend/routes/sessions.ts
git commit -m "feat: GET /api/sessions/estimate-time — buffered practice time recommendation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Manual Entry — optional estimated-time input

**Files:**
- Modify: `src/components/admin/ManualQuestionEntry.tsx`

- [ ] **Step 1: Add state**

Near the other field state (after `const [sourceReference, setSourceReference] = useState('');`, ~line 133), add:

```ts
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
```

- [ ] **Step 2: Load existing value in edit mode**

In the `useEffect` that hydrates fields when `editing` (where it does `setSourceReference(q.content.source_reference ?? '');`, ~line 182), add:

```ts
        setEstimatedMinutes(q.estimated_minutes != null ? String(q.estimated_minutes) : '');
```

(The `q` here is the loaded question; `estimated_minutes` is now on it from Task 3. If TypeScript complains the loaded type lacks the field, add `estimated_minutes?: number | null;` to the local question type used for `editing`/the fetched question in this file.)

- [ ] **Step 3: Render the input**

Add this field to the form near the difficulty / exam-scope / source-reference controls (pick a sensible spot in the shared metadata section). Use the existing input styling in the file for consistency:

```tsx
        <label className="block">
          <span className="text-sm font-medium text-text-secondary">Est. solve time (min)</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value.replace(/\D/g, ''))}
            placeholder="optional"
            className="mt-1 w-32 bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <span className="block text-[11px] text-text-tertiary mt-1">
            Roughly how long an average student needs. For a multi-part question, the time for the whole question.
          </span>
        </label>
```

(Match the surrounding markup/classes — if the file wraps fields differently, follow that pattern. The functional requirement is a numeric, digits-only, optional input bound to `estimatedMinutes`.)

- [ ] **Step 4: Include it in the create/update payloads**

Define a helper value once, near the top of the submit handler (`async function` that builds the payloads), after `setSubmitting(true);`:

```ts
    const estMin = estimatedMinutes.trim() ? Number(estimatedMinutes.trim()) : undefined;
```

Then add `...(estMin != null ? { estimated_minutes: estMin } : {})` as a top-level key to each payload:

- In the **multi-part** branch, add it to the `apiPost('/api/questions', { ... })` object ONLY for the lead part (`i === 0`); for other parts omit it. Concretely, change that object to include:

```ts
            ...(i === 0 && estMin != null ? { estimated_minutes: estMin } : {}),
```

- In each of the three **single-question** `createPayload` variants (mcq / multi / single calc), add as a top-level key (sibling of `difficulty`, `exam_scope`):

```ts
              ...(estMin != null ? { estimated_minutes: estMin } : {}),
```

(For the `editing` path, `createPayload` is reused for the PATCH after stripping `program_course_id`, so the estimate is included on update too. Good.)

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: PASS. (Ignore IDE phantom JSX diagnostics; only `npm run lint` matters.)

- [ ] **Step 6: Manual verification**

Frontend hot-reloads. In Admin → Manual Entry, create a single question with "Est. solve time" = 30 → save → re-open it (edit) and confirm 30 is shown. Create a multi-part question with an estimate → confirm (via `GET /api/questions/:id` on the lead part, or the DB) that only the first part carries the value.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ManualQuestionEntry.tsx
git commit -m "feat: optional estimated solve-time input in manual question entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Practice confirm screen prefills the recommended time

**Files:**
- Modify: `src/App.tsx`

Context: today, `setQuestionCount` (~line 731) prefills `practiceTimeLimit = count * 2` (and `practiceTimeRaw`) when the user hasn't manually set the time (`!practiceTimeUserSet`). The confirm screen ("READY" step) shows the editable time box bound to `practiceTimeRaw` / `practiceTimeLimit`. We replace the `count × 2` guess with the server recommendation, still only when the user hasn't overridden.

- [ ] **Step 1: Remove the `count × 2` heuristic from `setQuestionCount`**

In `setQuestionCount` (~lines 731-743), delete the two places that set the time from `count * 2`:
- the `if (!practiceTimeUserSet) { next.practiceTimeLimit = Math.max(1, clamped * 2); }` block, and
- the trailing `if (!practiceTimeUserSet) { setPracticeTimeRaw(String(Math.max(1, clamped * 2))); }` block.

So `setQuestionCount` only updates `questionCount`:

```ts
  const setQuestionCount = (n: number) => {
    const clamped = Math.max(1, Math.min(50, Math.floor(n)));
    setState((prev) => ({ ...prev, questionCount: clamped }));
  };
```

- [ ] **Step 2: Add an effect that fetches the recommendation on the practice confirm step**

Add this `useEffect` inside the main `App` component (near the other effects; it must have access to `state`, `practiceTimeUserSet`, `setState`, `setPracticeTimeRaw`, and `apiGet`). It fires when the practice selection inputs change and the user is on the READY step:

```tsx
  // Prefill the practice time box with a server recommendation (sum of per-question
  // estimates + buffer), unless the student has manually set the time. Falls back
  // to leaving the current value if the request fails or returns 0.
  useEffect(() => {
    if (state.mode !== 'PRACTICE' || state.step !== 'READY') return;
    if (practiceTimeUserSet) return;
    if (!state.selectedCourse?.id) return;
    const apiDifficulty =
      state.difficulty === 'Easy' ? 'easy'
      : state.difficulty === 'Medium' ? 'medium'
      : state.difficulty === 'Hard' ? 'hard'
      : null;
    const params = new URLSearchParams({
      program_course_id: state.selectedCourse.id,
      mode: 'practice',
      count: String(state.questionCount),
    });
    if (state.selectedTopic?.id) params.set('topic_id', state.selectedTopic.id);
    if (apiDifficulty) params.set('difficulty', apiDifficulty);
    let cancelled = false;
    apiGet<{ recommended_minutes: number }>(`/api/sessions/estimate-time?${params.toString()}`)
      .then((r) => {
        if (cancelled || practiceTimeUserSet) return;
        if (r.recommended_minutes > 0) {
          setState((p) => ({ ...p, practiceTimeLimit: r.recommended_minutes }));
          setPracticeTimeRaw(String(r.recommended_minutes));
        }
      })
      .catch(() => {
        /* leave the existing value; recommendation is best-effort */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.mode,
    state.step,
    state.selectedCourse?.id,
    state.selectedTopic?.id,
    state.difficulty,
    state.questionCount,
    practiceTimeUserSet,
  ]);
```

(If `state.step`'s ready value is named differently in this codebase, use the actual constant for the practice confirm step. The intent: fetch when the practice confirm screen is shown for the current course/topic/difficulty/count.)

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Frontend hot-reloads. Start a PRACTICE flow, pick a course/topic with some estimated questions, choose a count, and land on the confirm screen: the Time Limit box should prefill with the buffered recommendation (a multiple of 5), not `count × 2`. Type a custom time → it sticks (user override). Change the count → if you haven't typed your own time, it re-fetches; if you have, it stays. A course with no estimates still gets a sensible fallback-based number.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: practice confirm screen prefills recommended time from estimates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (design doc §1 + §3, manual-input slice):**
- Optional per-question estimate stored on the question, group estimate on the lead part → Tasks 1–3, 6. ✓
- Aggregation = sum of estimates with type+difficulty fallback, plus the chosen `roundUpTo5(sum × 1.15)` buffer → Task 4. ✓
- Group-aware aggregation (a multi-part group counts once) → Task 5 uses `groupIntoLogical`. ✓
- Practice recommendation prefilled into the editable time box, replacing `count × 2`, student can override → Task 7. ✓
- Scope: practice only; midsem/diagnostic/full-exam untouched (the endpoint is only called on the practice confirm step). ✓

**Placeholder scan:** No TBD/TODO; pure-helper code is complete with tests; wiring tasks show the exact code and the existing anchors. The two "match the surrounding markup" notes (Task 6 Step 3, Task 7 Step 2 step-constant) are styling/naming adaptations, not missing logic — the functional code is fully specified.

**Type consistency:** `estimated_minutes: number | null` on `QuestionWithContent`/`QuestionJoinRow` (Task 3) matches the schema's `number().int().optional()` (Task 2) and the `?? null` persistence. `QuestionType`/`questionMinutes`/`recommendMinutes` (Task 4) are consumed exactly as defined in `estimateService` (Task 5). The endpoint returns `{ recommended_minutes: number }`, consumed verbatim in Task 7.

**Deferred (next plan):** AI "Suggest" button (Manual Entry), AI auto-estimate in the ingestion pipeline + draft-review field, and the Group Editor estimate field for editing existing multi-part groups.
