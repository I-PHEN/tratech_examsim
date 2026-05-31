# Student Progress & Saving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire per-topic recency-weighted mastery onto topic cards, add a per-topic diagnostic report above the review screen, and add server-persisted question bookmarks with a Saved screen + re-practice.

**Architecture:** Three independently-shippable groups. **A (Mastery):** a pure `computeMastery` weighting function + a `getCourseMastery` service exposed at `GET /api/mastery`, merged into the topic-select cards. **B (Diagnostic):** a pure `summarizeByTopic` function feeding a `topic_breakdown` field on the existing session-review payload, rendered as a header block for `diagnostic` sessions. **C (Bookmarks):** a new `bookmarked_questions` table + CRUD routes, a `bookmarked` flag on the review payload, a `question_ids` branch on session creation, and a Saved screen.

**Tech Stack:** Express + tsx backend, Supabase Postgres (service-role), React 19 + Vite frontend, Vitest. Spec: [docs/superpowers/specs/2026-05-30-student-progress-and-saving-design.md](../specs/2026-05-30-student-progress-and-saving-design.md).

---

## File Structure

**Group A — Mastery**
- Create: `backend/services/masteryService.ts` — `computeMastery` (pure) + `getCourseMastery` (DB).
- Create: `backend/services/masteryService.test.ts` — `computeMastery` unit tests.
- Create: `backend/routes/mastery.ts` — `GET /api/mastery`.
- Modify: `backend/server.ts` — mount the router.
- Modify: `src/types.ts` — `Topic.masteryState`.
- Modify: `src/App.tsx` — fetch+merge mastery in the topic-select effect.
- Modify: `src/components/ui/TopicCard.tsx` — render the three states.

**Group B — Diagnostic report**
- Create: `backend/services/topicBreakdown.ts` — `summarizeByTopic` (pure).
- Create: `backend/services/topicBreakdown.test.ts` — unit tests.
- Modify: `backend/services/sessionService.ts` — populate `topic_breakdown` in `getSessionById` for diagnostics.
- Modify: `src/App.tsx` — `ReviewSessionData.topic_breakdown` + header block + Practice CTA.

**Group C — Bookmarks**
- Migration: `bookmarked_questions` table (via `mcp__supabase__apply_migration`).
- Create: `backend/services/bookmarkService.ts` — add/remove/list.
- Create: `backend/routes/bookmarks.ts` — POST/DELETE/GET.
- Modify: `backend/server.ts` — mount the router.
- Modify: `backend/schemas/session.ts` — `question_ids` on `SessionCreate`.
- Modify: `backend/services/sessionService.ts` — `question_ids` branch in `createSession`; `bookmarked` flag in `getSessionById`.
- Modify: `src/App.tsx` — review star toggle; `'SAVED'` step; Saved screen + nav + "Quiz me".
- Create: `src/components/SavedScreen.tsx` — the Saved collection UI.

---

# GROUP A — TOPIC MASTERY

## Task A1: `computeMastery` pure function (TDD)

**Files:**
- Create: `backend/services/masteryService.ts`
- Test: `backend/services/masteryService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeMastery } from './masteryService';

describe('computeMastery', () => {
  it('returns not_started for no answers', () => {
    expect(computeMastery([])).toEqual({ state: 'not_started', mastery: 0, answered_count: 0 });
  });

  it('returns in_progress for 1-3 answers', () => {
    expect(computeMastery([1]).state).toBe('in_progress');
    expect(computeMastery([1, 0, 1]).state).toBe('in_progress');
    expect(computeMastery([1, 0, 1]).answered_count).toBe(3);
  });

  it('returns scored at 4+ answers', () => {
    expect(computeMastery([1, 1, 1, 1])).toEqual({ state: 'scored', mastery: 100, answered_count: 4 });
    expect(computeMastery([0, 0, 0, 0]).mastery).toBe(0);
  });

  it('weights recent answers more heavily (newest-first input)', () => {
    const recentCorrect = computeMastery([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const recentWrong = computeMastery([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(recentCorrect.mastery).toBeGreaterThan(55);
    expect(recentWrong.mastery).toBeLessThan(45);
    expect(recentCorrect.mastery).toBeGreaterThan(recentWrong.mastery);
  });

  it('honours partial-credit points', () => {
    expect(computeMastery([0.5, 0.5, 0.5, 0.5]).mastery).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/services/masteryService.test.ts`
Expected: FAIL — `computeMastery` not exported / file missing.

- [ ] **Step 3: Write minimal implementation**

Add to `backend/services/masteryService.ts`:

```ts
export type MasteryState = 'not_started' | 'in_progress' | 'scored';

export interface MasteryResult {
  state: MasteryState;
  mastery: number; // 0-100, rounded
  answered_count: number;
}

const HALF_LIFE = 15; // weight halves every ~15 answers
const SCORED_THRESHOLD = 4;

/**
 * Recency-weighted mastery. `orderedPoints` is newest-first; each entry is a
 * 0..1 per-answer score. Recent answers dominate via an attempt-order half-life.
 */
export function computeMastery(orderedPoints: number[]): MasteryResult {
  const answered_count = orderedPoints.length;
  if (answered_count === 0) return { state: 'not_started', mastery: 0, answered_count: 0 };

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < orderedPoints.length; i++) {
    const w = Math.pow(0.5, i / HALF_LIFE);
    weightedSum += w * orderedPoints[i];
    weightTotal += w;
  }
  const mastery = Math.round((weightedSum / weightTotal) * 100);
  const state: MasteryState = answered_count >= SCORED_THRESHOLD ? 'scored' : 'in_progress';
  return { state, mastery, answered_count };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/services/masteryService.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/masteryService.ts backend/services/masteryService.test.ts
git commit -m "feat(mastery): recency-weighted computeMastery pure function + tests"
```

## Task A2: `getCourseMastery` service + `/api/mastery` route

**Files:**
- Modify: `backend/services/masteryService.ts`
- Create: `backend/routes/mastery.ts`
- Modify: `backend/server.ts`

- [ ] **Step 1: Add the DB aggregation to `masteryService.ts`**

Append:

```ts
import { supabase } from '../lib/supabase';

export interface TopicMastery {
  topic_id: string;
  state: MasteryState;
  mastery: number;
  answered_count: number;
}

/**
 * Per-topic recency-weighted mastery for one user within a course. Pulls the
 * user's graded answers (points not null) for that course, newest-first, groups
 * by topic, and runs computeMastery on each group.
 */
export async function getCourseMastery(
  uid: string,
  programCourseId: string
): Promise<TopicMastery[]> {
  const { data, error } = await supabase
    .from('session_answers')
    .select(
      'points, answered_at, questions!inner(topic_id, program_course_id), sessions!inner(user_uid)'
    )
    .eq('sessions.user_uid', uid)
    .eq('questions.program_course_id', programCourseId)
    .not('points', 'is', null)
    .order('answered_at', { ascending: false });
  if (error) throw error;

  const byTopic = new Map<string, number[]>();
  for (const row of (data ?? []) as unknown as Array<{
    points: number | null;
    questions: { topic_id: string } | { topic_id: string }[] | null;
  }>) {
    const q = Array.isArray(row.questions) ? row.questions[0] : row.questions;
    const tid = q?.topic_id;
    if (!tid || row.points == null) continue;
    const arr = byTopic.get(tid) ?? [];
    arr.push(row.points); // already newest-first from the ORDER BY
    byTopic.set(tid, arr);
  }

  return Array.from(byTopic.entries()).map(([topic_id, points]) => ({
    topic_id,
    ...computeMastery(points),
  }));
}
```

- [ ] **Step 2: Create the route `backend/routes/mastery.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { uuid } from '../schemas/common';
import { getCourseMastery } from '../services/masteryService';

const router = Router();

const MasteryQuery = z.object({ program_course_id: uuid });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(MasteryQuery, req.query);
    const data = await getCourseMastery(uid, query.program_course_id);
    res.json(data);
  })
);

export default router;
```

- [ ] **Step 3: Mount it in `backend/server.ts`**

Find the block where other authed routers are mounted (search `app.use('/api/sessions'` or `analyticsRouter`). Add an import alongside the others:

```ts
import masteryRouter from './routes/mastery';
```

And mount it next to the analytics mount (same `requireAuth` grouping — mirror exactly how `/api/analytics` is mounted):

```ts
app.use('/api/mastery', masteryRouter);
```

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: clean (no output).

- [ ] **Step 5: Commit**

```bash
git add backend/services/masteryService.ts backend/routes/mastery.ts backend/server.ts
git commit -m "feat(mastery): getCourseMastery service + GET /api/mastery"
```

## Task A3: Topic cards consume mastery

**Files:**
- Modify: `src/types.ts:32-38`
- Modify: `src/App.tsx` (topic-select effect near line 434-457)
- Modify: `src/components/ui/TopicCard.tsx:63-85`

- [ ] **Step 1: Extend the `Topic` type**

In `src/types.ts`, change the `Topic` interface to add `masteryState`:

```ts
export interface Topic {
  id: string;
  name: string;
  questionsCount?: number;
  mastery?: number;
  masteryState?: 'not_started' | 'in_progress' | 'scored';
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}
```

- [ ] **Step 2: Fetch + merge mastery in the topic-select effect**

In `src/App.tsx`, the effect at ~line 434 fetches `/api/topics` and maps to `{ id, name, questionsCount }`. Add a parallel mastery fetch and merge. Define the API type near `ApiTopic` (~line 92):

```ts
interface ApiMastery {
  topic_id: string;
  state: 'not_started' | 'in_progress' | 'scored';
  mastery: number;
  answered_count: number;
}
```

Replace the body of the topics-loading effect's `.then` so it also pulls mastery and merges:

```ts
    Promise.all([
      apiGet<ApiTopic[]>(`/api/topics?program_course_id=${state.selectedCourse.id}`),
      apiGet<ApiMastery[]>(`/api/mastery?program_course_id=${state.selectedCourse.id}`).catch(
        () => [] as ApiMastery[]
      ),
    ])
      .then(([rows, mastery]) => {
        if (cancelled) return;
        const byTopic = new Map(mastery.map((m) => [m.topic_id, m]));
        setAvailableTopics(
          rows.map((r) => {
            const m = byTopic.get(r.id);
            return {
              id: r.id,
              name: r.name,
              questionsCount: r.question_count ?? 0,
              mastery: m?.mastery ?? 0,
              masteryState: m?.state ?? 'not_started',
            };
          })
        );
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Failed to load topics', e);
        setAvailableTopics([]);
      })
      .finally(() => {
        if (!cancelled) setTopicsLoading(false);
      });
```

(Replace the existing single `apiGet<ApiTopic[]>(...).then(...).catch(...).finally(...)` chain entirely. Keep the surrounding `setTopicsLoading(true)` and `cancelled` guard.)

- [ ] **Step 3: Render the three states in `TopicCard.tsx`**

Replace the counters + bar block (lines 67-85) with:

```tsx
        <div className="pt-4 border-t border-border-subtle space-y-2">
          <div className="flex justify-between items-center text-[11px] font-semibold tracking-[0.14em] uppercase">
            <span className={active ? 'text-accent-text' : 'text-text-tertiary'}>
              {topic.questionsCount ?? 0} Questions
            </span>
            <span className={active ? 'text-accent-text' : 'text-text-tertiary'}>
              {topic.masteryState === 'scored'
                ? `${topic.mastery ?? 0}% Mastery`
                : topic.masteryState === 'in_progress'
                  ? 'In progress'
                  : 'Not started'}
            </span>
          </div>
          <div className="w-full h-1 bg-bg-sunken rounded-full overflow-hidden">
            <div
              style={{ width: topic.masteryState === 'scored' ? `${topic.mastery ?? 0}%` : topic.masteryState === 'in_progress' ? '12%' : '0%' }}
              className={cn(
                'h-full rounded-full transition-colors',
                topic.masteryState === 'scored'
                  ? active ? 'bg-accent' : 'bg-text-tertiary/40'
                  : 'bg-text-tertiary/20',
              )}
            />
          </div>
        </div>
```

- [ ] **Step 4: Verify lint + tests**

Run: `npm run lint && npx vitest run`
Expected: lint clean; all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/App.tsx src/components/ui/TopicCard.tsx
git commit -m "feat(mastery): render recency-weighted mastery states on topic cards"
```

---

# GROUP B — DIAGNOSTIC REPORT

## Task B1: `summarizeByTopic` pure function (TDD)

**Files:**
- Create: `backend/services/topicBreakdown.ts`
- Test: `backend/services/topicBreakdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { summarizeByTopic } from './topicBreakdown';

describe('summarizeByTopic', () => {
  it('returns empty for no rows', () => {
    expect(summarizeByTopic([])).toEqual([]);
  });

  it('groups by topic and computes accuracy', () => {
    const out = summarizeByTopic([
      { topic_id: 't1', topic_name: 'Kinetics', is_correct: true },
      { topic_id: 't1', topic_name: 'Kinetics', is_correct: false },
      { topic_id: 't2', topic_name: 'Reactors', is_correct: true },
    ]);
    const t1 = out.find((e) => e.topic_id === 't1')!;
    const t2 = out.find((e) => e.topic_id === 't2')!;
    expect(t1).toMatchObject({ topic_name: 'Kinetics', correct: 1, total: 2, accuracy: 0.5 });
    expect(t2).toMatchObject({ correct: 1, total: 1, accuracy: 1 });
  });

  it('sorts weakest-first', () => {
    const out = summarizeByTopic([
      { topic_id: 'strong', topic_name: 'A', is_correct: true },
      { topic_id: 'weak', topic_name: 'B', is_correct: false },
    ]);
    expect(out[0].topic_id).toBe('weak');
    expect(out[1].topic_id).toBe('strong');
  });

  it('treats null is_correct as not correct', () => {
    const out = summarizeByTopic([
      { topic_id: 't1', topic_name: 'X', is_correct: null },
      { topic_id: 't1', topic_name: 'X', is_correct: true },
    ]);
    expect(out[0]).toMatchObject({ correct: 1, total: 2, accuracy: 0.5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/services/topicBreakdown.test.ts`
Expected: FAIL — module/function missing.

- [ ] **Step 3: Write minimal implementation**

`backend/services/topicBreakdown.ts`:

```ts
export interface TopicBreakdownEntry {
  topic_id: string;
  topic_name: string | null;
  correct: number;
  total: number;
  accuracy: number; // 0..1
}

interface AnswerRow {
  topic_id: string;
  topic_name: string | null;
  is_correct: boolean | null;
}

/** Per-topic correctness for a single session, sorted weakest-first. */
export function summarizeByTopic(rows: AnswerRow[]): TopicBreakdownEntry[] {
  const buckets = new Map<string, { topic_name: string | null; correct: number; total: number }>();
  for (const r of rows) {
    const b = buckets.get(r.topic_id) ?? { topic_name: r.topic_name, correct: 0, total: 0 };
    b.total += 1;
    if (r.is_correct === true) b.correct += 1;
    buckets.set(r.topic_id, b);
  }
  return Array.from(buckets.entries())
    .map(([topic_id, b]) => ({
      topic_id,
      topic_name: b.topic_name,
      correct: b.correct,
      total: b.total,
      accuracy: b.total > 0 ? b.correct / b.total : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/services/topicBreakdown.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/topicBreakdown.ts backend/services/topicBreakdown.test.ts
git commit -m "feat(diagnostic): summarizeByTopic pure function + tests"
```

## Task B2: Populate `topic_breakdown` in the review payload

**Files:**
- Modify: `backend/services/sessionService.ts` (`getSessionById`, ~line 369-487)

- [ ] **Step 1: Import the helper**

At the top of `backend/services/sessionService.ts`, add:

```ts
import { summarizeByTopic, type TopicBreakdownEntry } from './topicBreakdown';
```

- [ ] **Step 2: Build the breakdown for diagnostic sessions**

In `getSessionById`, after the `questions` array is built and sorted (just before the `const accuracy =` line ~464), insert:

```ts
  let topic_breakdown: TopicBreakdownEntry[] | null = null;
  if (s.mode === 'diagnostic' && questions.length > 0) {
    const topicById = new Map(questions.map((q) => [q.id, q.topic_id]));
    const topicIds = Array.from(new Set(questions.map((q) => q.topic_id)));
    const { data: topicRows } = await supabase
      .from('topics')
      .select('id, name')
      .in('id', topicIds);
    const nameById = new Map((topicRows ?? []).map((t) => [t.id as string, t.name as string]));
    const rows = (answers ?? []).map((a) => {
      const tid = topicById.get(a.question_id) ?? '';
      return { topic_id: tid, topic_name: nameById.get(tid) ?? null, is_correct: a.is_correct };
    }).filter((r) => r.topic_id !== '');
    topic_breakdown = summarizeByTopic(rows);
  }
```

- [ ] **Step 3: Add it to the returned object**

In the `return { session: {...}, answers, questions }` object, add `topic_breakdown` at the top level:

```ts
  return {
    session: { /* ...unchanged... */ },
    answers: (answers ?? []) as SessionAnswerRow[],
    questions,
    topic_breakdown,
  };
```

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add backend/services/sessionService.ts
git commit -m "feat(diagnostic): add topic_breakdown to diagnostic session review"
```

## Task B3: Render the diagnostic header block + Practice CTA

**Files:**
- Modify: `src/App.tsx` — `ReviewSessionData` interface (~line 1617-1650); `ReviewScreen` component signature (line 1715) + render; `<ReviewScreen … />` render site (lines 886-890).

Context: `ReviewScreen` is a standalone component `function ReviewScreen({ sessionId, onBack, courseName }: …)` (line 1715). Its loaded payload is in local state `data` (`const [data, setData] = useState<ReviewSessionData | null>(null)`), NOT `review`. `cn` is module-imported. We add a new `onPracticeTopic` prop wired at the render site to `setState`.

- [ ] **Step 1: Extend `ReviewSessionData`**

Add to the interface:

```ts
  topic_breakdown?: Array<{
    topic_id: string;
    topic_name: string | null;
    correct: number;
    total: number;
    accuracy: number;
  }> | null;
```

- [ ] **Step 2: Add the `onPracticeTopic` prop to ReviewScreen**

Change the component signature (line 1715) to:

```tsx
function ReviewScreen({ sessionId, onBack, courseName, onPracticeTopic }: { sessionId: string; onBack: () => void; courseName: string; onPracticeTopic: (topicId: string, topicName: string) => void }) {
```

- [ ] **Step 3: Render the block in ReviewScreen**

In the ReviewScreen JSX, immediately above the per-question list (after the score/accuracy summary header, where `data` is guaranteed non-null in the loaded branch), add:

```tsx
{data.session.mode === 'diagnostic' && data.topic_breakdown && data.topic_breakdown.length > 0 && (
  <div className="bg-bg-surface border border-border-subtle rounded-2xl p-5 mb-4">
    <h3 className="text-sm font-black uppercase tracking-widest text-accent-text mb-3">
      Diagnostic breakdown
    </h3>
    {data.topic_breakdown.every((t) => t.accuracy >= 0.6) ? (
      <p className="text-sm text-text-secondary mb-2">Solid across the board — no weak topics flagged.</p>
    ) : null}
    <div className="space-y-2">
      {data.topic_breakdown.map((t) => {
        const pct = Math.round(t.accuracy * 100);
        const weak = t.accuracy < 0.6;
        return (
          <div key={t.topic_id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-primary">{t.topic_name ?? 'Untitled topic'}</span>
            <div className="flex items-center gap-3">
              <span className={cn('text-sm font-bold', weak ? 'text-danger-text' : 'text-text-secondary')}>
                {pct}% ({t.correct}/{t.total})
              </span>
              {weak && (
                <button
                  onClick={() => onPracticeTopic(t.topic_id, t.topic_name ?? '')}
                  className="text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-accent text-bg-page hover:bg-accent-hover"
                >
                  Practice
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 4: Wire `onPracticeTopic` at the render site (lines 886-890)**

Replace the `<ReviewScreen … />` element with:

```tsx
          <ReviewScreen
            sessionId={state.reviewSessionId}
            onBack={goBack}
            courseName={state.selectedCourse?.name || 'Session'}
            onPracticeTopic={(topicId, topicName) =>
              setState((prev) => ({
                ...prev,
                mode: 'PRACTICE',
                selectedTopic: { id: topicId, name: topicName },
                step: 'READY',
                reviewSessionId: undefined,
              }))
            }
          />
```

This lands the student on the READY screen for that topic; pressing start runs the existing `startExam` (line 634) which creates a normal practice session.

- [ ] **Step 4: Verify lint + tests**

Run: `npm run lint && npx vitest run`
Expected: clean; tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(diagnostic): render topic breakdown + practice CTA in review"
```

---

# GROUP C — BOOKMARKS

## Task C1: `bookmarked_questions` table

**Files:**
- Migration via `mcp__supabase__apply_migration`.

- [ ] **Step 1: Apply the migration**

Use the `mcp__supabase__apply_migration` tool with name `create_bookmarked_questions` and SQL:

```sql
create table bookmarked_questions (
  id uuid primary key default uuid_generate_v4(),
  user_uid text not null,
  question_id uuid not null references questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_uid, question_id)
);
alter table bookmarked_questions enable row level security;
create index bookmarked_questions_user_idx on bookmarked_questions (user_uid);
```

- [ ] **Step 2: Verify the table exists**

Use `mcp__supabase__execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'bookmarked_questions' order by ordinal_position;
```

Expected: rows for `id, user_uid, question_id, created_at`.

- [ ] **Step 3: Commit** (no repo files changed; record the migration in any migrations log if the repo keeps one — otherwise skip. Migrations live in Supabase.)

No git commit needed for this task unless the repo tracks SQL files. Proceed to C2.

## Task C2: Bookmark service + routes

**Files:**
- Create: `backend/services/bookmarkService.ts`
- Create: `backend/routes/bookmarks.ts`
- Modify: `backend/server.ts`

- [ ] **Step 1: Create `backend/services/bookmarkService.ts`**

```ts
import { supabase } from '../lib/supabase';
import { mapAssets, type QuestionAsset } from './questionService';

export async function addBookmark(uid: string, questionId: string): Promise<void> {
  const { error } = await supabase
    .from('bookmarked_questions')
    .upsert({ user_uid: uid, question_id: questionId }, { onConflict: 'user_uid,question_id' });
  if (error) throw error;
}

export async function removeBookmark(uid: string, questionId: string): Promise<void> {
  const { error } = await supabase
    .from('bookmarked_questions')
    .delete()
    .eq('user_uid', uid)
    .eq('question_id', questionId);
  if (error) throw error;
}

/** Question ids the user has bookmarked among the given ids (for review flags). */
export async function bookmarkedIdsAmong(uid: string, questionIds: string[]): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('bookmarked_questions')
    .select('question_id')
    .eq('user_uid', uid)
    .in('question_id', questionIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.question_id as string));
}

export interface SavedQuestion {
  id: string;
  topic_id: string;
  topic_name: string | null;
  type: 'mcq' | 'calc';
  prompt: string;
  explanation: string | null;
  created_at: string;
  assets: QuestionAsset[];
}

/** Saved questions for one course, newest-bookmark-first, with content. */
export async function listBookmarks(uid: string, programCourseId: string): Promise<SavedQuestion[]> {
  const { data, error } = await supabase
    .from('bookmarked_questions')
    .select(
      'created_at, question_id, questions!inner(id, type, topic_id, program_course_id, ' +
        'question_content(prompt, explanation), topics(name), ' +
        'question_assets(id, storage_path, mime_type, position))'
    )
    .eq('user_uid', uid)
    .eq('questions.program_course_id', programCourseId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    created_at: string;
    questions: {
      id: string;
      type: 'mcq' | 'calc';
      topic_id: string;
      question_content: { prompt: string; explanation: string | null } | { prompt: string; explanation: string | null }[] | null;
      topics: { name: string } | { name: string }[] | null;
      question_assets: Array<{ id: string; storage_path: string; mime_type: string; position: number }> | null;
    };
  }>;

  return Promise.all(
    rows.map(async (r) => {
      const q = r.questions;
      const content = Array.isArray(q.question_content) ? q.question_content[0] : q.question_content;
      const topic = Array.isArray(q.topics) ? q.topics[0] : q.topics;
      return {
        id: q.id,
        topic_id: q.topic_id,
        topic_name: topic?.name ?? null,
        type: q.type,
        prompt: content?.prompt ?? '',
        explanation: content?.explanation ?? null,
        created_at: r.created_at,
        assets: await mapAssets(q.question_assets),
      };
    })
  );
}
```

- [ ] **Step 2: Create `backend/routes/bookmarks.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { uuid } from '../schemas/common';
import { addBookmark, listBookmarks, removeBookmark } from '../services/bookmarkService';

const router = Router();

const CreateBody = z.object({ question_id: uuid });
const ListQuery = z.object({ program_course_id: uuid });
const QuestionIdParam = z.object({ question_id: uuid });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(ListQuery, req.query);
    res.json(await listBookmarks(uid, query.program_course_id));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const body = parse(CreateBody, req.body);
    await addBookmark(uid, body.question_id);
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/:question_id',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { question_id } = parse(QuestionIdParam, req.params);
    await removeBookmark(uid, question_id);
    res.status(204).end();
  })
);

export default router;
```

- [ ] **Step 3: Mount in `backend/server.ts`**

```ts
import bookmarksRouter from './routes/bookmarks';
// ...
app.use('/api/bookmarks', bookmarksRouter);
```

(Mount in the same authed group as `/api/sessions` and `/api/mastery`.)

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add backend/services/bookmarkService.ts backend/routes/bookmarks.ts backend/server.ts
git commit -m "feat(bookmarks): bookmark service + CRUD routes"
```

## Task C3: `bookmarked` flag on the review payload

**Files:**
- Modify: `backend/services/sessionService.ts` (`getSessionById`)

- [ ] **Step 1: Import the helper**

Add to the imports:

```ts
import { bookmarkedIdsAmong } from './bookmarkService';
```

- [ ] **Step 2: Look up bookmarks and attach to questions**

In `getSessionById`, after `orderedIds` is computed (~line 403) and before/after building `questions`, fetch the user's bookmarks among `orderedIds`:

```ts
  const bookmarkedSet = await bookmarkedIdsAmong(uid, orderedIds);
```

Then, in the `questions = await Promise.all(... map ...)` return object for each question, add:

```ts
        bookmarked: bookmarkedSet.has(r.id),
```

Add `bookmarked: boolean;` to the `ReviewQuestion` interface (~line 52-61).

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/services/sessionService.ts
git commit -m "feat(bookmarks): expose per-question bookmarked flag in review"
```

## Task C4: `question_ids` branch in session creation

**Files:**
- Modify: `backend/schemas/session.ts:14-21`
- Modify: `backend/services/sessionService.ts:67-105` (`createSession`)

- [ ] **Step 1: Add `question_ids` to the schema**

In `backend/schemas/session.ts`, extend `SessionCreate`:

```ts
export const SessionCreate = z.object({
  program_course_id: uuid,
  mode: StudyMode,
  count: z.coerce.number().int().min(1).max(100).optional(),
  topic_id: uuid.optional(),
  difficulty: Difficulty.optional(),
  question_ids: z.array(uuid).min(1).max(100).optional(),
});
```

- [ ] **Step 2: Branch in `createSession`**

In `backend/services/sessionService.ts`, add `getQuestionById` to the **existing** `./questionService` import (line 4 currently imports `mapAssets, type QuestionAsset, type QuestionContent, type McqOption`) — merge it in rather than adding a second import line:

```ts
import { getQuestionById, mapAssets, type QuestionAsset, type QuestionContent, type McqOption } from './questionService';
```

Replace the start of `createSession` (the `pickSessionQuestions` call through the empty-check) so that when `question_ids` are provided it seeds directly:

```ts
export async function createSession(uid: string, input: SessionCreateInput) {
  let pickedQuestions;
  let difficultyFallback = false;
  let topicId = input.topic_id ?? null;

  if (input.question_ids && input.question_ids.length > 0) {
    // Seed directly from an explicit id list (e.g. re-practice from Saved).
    const loaded = await Promise.all(
      input.question_ids.map((id) => getQuestionById(id).catch(() => null))
    );
    pickedQuestions = loaded.filter((q): q is NonNullable<typeof q> => q !== null);
    topicId = null;
  } else {
    const picked = await pickSessionQuestions({
      program_course_id: input.program_course_id,
      mode: input.mode,
      count: input.count,
      topic_id: input.topic_id,
      difficulty: input.difficulty,
    });
    pickedQuestions = picked.picked;
    difficultyFallback = picked.difficulty_fallback;
  }

  if (pickedQuestions.length === 0) {
    throw new ApiError(
      404,
      'NO_QUESTIONS',
      'No questions found for that course / mode / filters. Add some via Admin → Manual Entry.'
    );
  }

  const { data: row, error } = await supabase
    .from('sessions')
    .insert({
      user_uid: uid,
      program_course_id: input.program_course_id,
      mode: input.mode,
      topic_id: topicId,
      total_questions: pickedQuestions.length,
      question_ids: pickedQuestions.map((q) => q.id),
    })
    .select('*')
    .single();
  if (error) throw error;

  return {
    session_id: row.id,
    picked: pickedQuestions,
    difficulty_fallback: difficultyFallback,
  };
}
```

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/schemas/session.ts backend/services/sessionService.ts
git commit -m "feat(bookmarks): seed a session from an explicit question_ids list"
```

## Task C5: Review screen star toggle

**Files:**
- Modify: `src/App.tsx` (ReviewScreen per-question render + `ReviewSessionData`/question type)

- [ ] **Step 1: Add `bookmarked` to the review question type**

Wherever the per-question shape in `ReviewSessionData` is declared (the `questions` array type), add `bookmarked?: boolean;`.

- [ ] **Step 2: Add local bookmark state + toggle handler in ReviewScreen**

`data` is ReviewScreen's loaded payload (`useState<ReviewSessionData | null>`). `apiPost` and `apiDelete` are already module-imported at the top of App.tsx (line 81). Near ReviewScreen's other hooks, add:

```ts
const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
useEffect(() => {
  if (!data) return;
  setBookmarkedIds(new Set(data.questions.filter((q) => q.bookmarked).map((q) => q.id)));
}, [data]);

const toggleBookmark = async (questionId: string) => {
  const isOn = bookmarkedIds.has(questionId);
  // optimistic
  setBookmarkedIds((prev) => {
    const next = new Set(prev);
    if (isOn) next.delete(questionId); else next.add(questionId);
    return next;
  });
  try {
    if (isOn) await apiDelete(`/api/bookmarks/${questionId}`);
    else await apiPost('/api/bookmarks', { question_id: questionId });
  } catch {
    // revert on failure
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (isOn) next.add(questionId); else next.delete(questionId);
      return next;
    });
  }
};
```

- [ ] **Step 3: Render a star button per question**

In the per-question review row header, add (import `Bookmark` from `lucide-react` at the top of App.tsx if not present):

```tsx
<button
  onClick={() => toggleBookmark(q.id)}
  className="p-1.5 rounded-lg hover:bg-bg-raised text-text-tertiary hover:text-accent-text"
  aria-label={bookmarkedIds.has(q.id) ? 'Remove bookmark' : 'Save question'}
  title={bookmarkedIds.has(q.id) ? 'Saved' : 'Save'}
>
  <Bookmark className={cn('w-4 h-4', bookmarkedIds.has(q.id) ? 'fill-accent text-accent' : 'fill-none')} />
</button>
```

(Place it next to the per-question number/heading; `q` is the loop variable over `review.questions`.)

- [ ] **Step 4: Verify lint + tests**

Run: `npm run lint && npx vitest run`
Expected: clean; tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(bookmarks): star toggle to save questions from review"
```

## Task C6: Saved screen + nav + Quiz me

**Files:**
- Create: `src/components/SavedScreen.tsx`
- Modify: `src/types.ts` (`AppState.step` union)
- Modify: `src/App.tsx` (nav entry + render `SavedScreen` for `step === 'SAVED'`)

- [ ] **Step 1: Add the `'SAVED'` step**

In `src/types.ts`, add `'SAVED'` to both `step` and `returnStep` unions in `AppState` (line 58-59).

- [ ] **Step 2: Create `src/components/SavedScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Loader2, Bookmark, Play } from 'lucide-react';
import { apiGet, apiPost } from '../lib/apiClient';
import { RichText } from './ui/RichText';

interface SavedQuestion {
  id: string;
  topic_id: string;
  topic_name: string | null;
  type: 'mcq' | 'calc';
  prompt: string;
  explanation: string | null;
}

export function SavedScreen({
  programCourseId,
  onQuiz,
}: {
  programCourseId: string;
  onQuiz: (questionIds: string[]) => void;
}) {
  const [items, setItems] = useState<SavedQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!programCourseId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    apiGet<SavedQuestion[]>(`/api/bookmarks?program_course_id=${programCourseId}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [programCourseId]);

  if (loading) {
    return <div className="flex justify-center py-12 text-text-secondary"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary flex flex-col items-center gap-2">
        <Bookmark className="w-6 h-6" />
        No saved questions yet. Star a question from any review to save it here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-text-primary">Saved questions</h2>
        <button
          onClick={() => onQuiz(items.map((i) => i.id))}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-bg-page text-[11px] font-black uppercase tracking-widest hover:bg-accent-hover"
        >
          <Play className="w-4 h-4" /> Quiz me ({items.length})
        </button>
      </div>
      <div className="space-y-3">
        {items.map((q) => (
          <div key={q.id} className="bg-bg-surface border border-border-subtle rounded-2xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">
              {q.topic_name ?? 'Untitled topic'} · {q.type === 'mcq' ? 'MCQ' : 'Calc'}
            </div>
            <RichText className="text-sm text-text-primary">{q.prompt}</RichText>
            {q.explanation && (
              <details className="mt-2">
                <summary className="text-[11px] font-bold uppercase tracking-wider text-accent-text cursor-pointer">Explanation</summary>
                <RichText className="text-sm text-text-secondary mt-1">{q.explanation}</RichText>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add `startSavedQuiz` in the App component**

In the App component (the one holding `startExam`, `setActiveSession`, `setStartError` — around line 634), add a handler that mirrors `startExam` exactly but seeds from ids. `ApiSessionCreated` (line 136) and `apiQuestionsToFrontend` (line 200) already exist:

```ts
const startSavedQuiz = async (questionIds: string[]) => {
  if (!state.selectedCourse || questionIds.length === 0) return;
  setStartError(null);
  try {
    const res = await apiPost<ApiSessionCreated>('/api/sessions', {
      program_course_id: state.selectedCourse.id,
      mode: 'practice',
      question_ids: questionIds,
    });
    setActiveSession({
      sessionId: res.session_id,
      questions: apiQuestionsToFrontend(res.picked),
      difficultyFallback: res.difficulty_fallback,
    });
    setState((prev) => ({ ...prev, step: 'EXAM' }));
  } catch (e) {
    setStartError(e instanceof Error ? e.message : 'Could not start the saved quiz.');
  }
};
```

- [ ] **Step 4: Add the nav item (mirror the My Sessions NavItem at line 794)**

Insert next to the `History` NavItem. Import `Bookmark` from `lucide-react` (top of App.tsx) if not already imported. **Access constraint:** Saved is scoped to a selected course, so only show the item when `state.selectedCourse` is set (mirrors how topic/review screens require a course):

```tsx
{state.selectedCourse && (
  <NavItem onClick={() => { setState(p => ({ ...p, returnStep: p.step, step: 'SAVED' })); setIsMobileMenuOpen(false); }} icon={Bookmark} label="Saved" active={state.step === 'SAVED'} expanded={isSidebarExpanded || isMobileMenuOpen} />
)}
```

- [ ] **Step 5: Render the screen (next to the `state.step === 'SESSIONS_HISTORY'` branch ~line 891)**

Import `SavedScreen` at the top of App.tsx, then add a render branch in the same conditional chain:

```tsx
) : state.step === 'SAVED' && state.selectedCourse ? (
  <SavedScreen
    programCourseId={state.selectedCourse.id}
    onQuiz={startSavedQuiz}
  />
```

(`goBack` already handles returning from `SAVED` via the generic `returnStep` path at line 686-689; add `'SAVED'` to the catch-all `goBack` clause at line 702 alongside the other utility steps so back works even without a `returnStep`.)

- [ ] **Step 6: Verify lint + tests**

Run: `npm run lint && npx vitest run`
Expected: clean; tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/SavedScreen.tsx src/types.ts src/App.tsx
git commit -m "feat(bookmarks): Saved screen with quiz-me re-practice"
```

---

## Final verification (after all groups)

- [ ] `npm run lint` — clean.
- [ ] `npx vitest run` — all tests pass (existing 16 + `computeMastery` 5 + `summarizeByTopic` 4).
- [ ] Restart backend (`npm run dev`) and smoke-test per the spec's Verification section:
  1. Topic cards show Not started / In progress / % across answer-count transitions.
  2. Diagnostic review shows the weakest-first breakdown + Practice CTAs under 60%.
  3. Star a question in review → it appears on the Saved screen → Quiz me starts a graded session → answers feed mastery and show in history.
