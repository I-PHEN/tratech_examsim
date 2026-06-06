# Question time estimation, multi-part counting, timer fix & exam layout

Date: 2026-06-06
Branch: (new) off `main`

Four related changes to the practice / exam experience, bundled because the
first two share a "logical question" concept and the last two live in the same
flow:

1. **Per-question time estimation** — an optional estimated solve-time on each
   question, AI-suggestable, aggregated into a recommended practice timer.
2. **Logical multi-part counting + group-aware scoring** — a multi-part
   question counts as ONE question everywhere a student sees it (count picker,
   totals, score).
3. **Timer clock-skew fix** — the "195 hours remaining" bug on a client whose
   clock is wrong.
4. **Exam question layout** — input flows directly under the question; the space
   below is intentionally blank; only the nav bar is pinned.

---

## Shared concept: the "logical question"

A multi-part question is stored as several `questions` rows sharing a
`question_group_id`, ordered by `part_index`. Today the count budget, the stored
total, and scoring all treat each part as a separate question. The student-facing
display already collapses parts into one number (`computeQuestionNumbers`,
[src/App.tsx](src/App.tsx)).

We introduce a single shared notion used by sections 1 and 2: a **logical
question** is either a standalone question or a whole group counted once. The
group's **lead part** is the member with the lowest `part_index`; it is the
representative row that carries the group's `estimated_minutes` and stands in for
the group in counting/aggregation.

A small group-aware helper (backend) iterates a picked set yielding one entry per
logical question (groups represented by their lead part). Sections 1 and 2 both
consume it; this is the only new abstraction and it is justified by ≥2 callers.

---

## 1. Per-question time estimation

### Data model

Add a nullable `estimated_minutes smallint` column to `questions`.

- **Standalone question** — holds its own estimate.
- **Multi-part group** — ONE estimate for the whole group, stored on the **lead
  part** (lowest `part_index`); every other part stays `null`. This means a plain
  sum of non-null estimates across a picked set already counts each group once.
- The field is **optional everywhere**. `null` falls back to the type+difficulty
  table (§3).

Migration: `mcp__supabase__apply_migration` adding the column (nullable, no
default, no backfill).

### Authoring (Manual Entry + Group Editor)

- An optional **"Est. solve time (min)"** numeric input.
  - Single question → on the question form
    ([src/components/admin/ManualQuestionEntry.tsx](src/components/admin/ManualQuestionEntry.tsx)).
  - Multi-part → **one** field at the group level in
    [src/components/admin/QuestionGroupEditor.tsx](src/components/admin/QuestionGroupEditor.tsx),
    written to the lead part (not per-part).
- A **"Suggest"** button beside the field → `POST /api/questions/estimate-time`
  (new route + thin service) that sends the prompt(s) to Groq
  ([backend/lib/llm.ts](backend/lib/llm.ts)) and returns a suggested integer. For
  a group, the AI sees all parts and returns one number. The author can accept or
  overwrite; nothing is auto-saved.
- Schema: add `estimated_minutes` (optional, positive int) to `QuestionCreate`,
  `QuestionUpdate`, and the `QuestionGroupUpdate.shared` block in
  [backend/schemas/question.ts](backend/schemas/question.ts). `createQuestion` /
  update services in
  [backend/services/questionService.ts](backend/services/questionService.ts)
  persist it (lead part only for groups).

### Ingestion pipeline (AI auto-suggest)

- The verifier step already reads the full question
  ([backend/services/extraction/](backend/services/extraction/)). Extend its LLM
  output to include `estimated_minutes` (no extra round-trip). One estimate per
  group.
- Add `estimated_minutes` to the ingestion draft schema
  ([backend/schemas/ingestion.ts](backend/schemas/ingestion.ts)) and persist on
  the draft.
- [src/components/admin/DraftReviewTable.tsx](src/components/admin/DraftReviewTable.tsx)
  shows the suggested minutes as an editable field before publish.
- On publish (`backend/services/ingestionService.ts` → `createQuestion`), write
  the estimate to the lead part of each group.

---

## 2. Logical multi-part counting + group-aware scoring

Per the decision, a multi-part question counts as ONE everywhere the student
sees it, **and** scoring is made consistent with that (results screen is
group-aware).

### Count picker

[backend/services/routingService.ts](backend/services/routingService.ts):
`pickSessionQuestions` consumes **1** slot of the requested `count` per logical
question (group = 1), instead of one per part. Groups remain atomic (all
siblings pulled in, contiguous, ordered by `part_index`) — only the budget
accounting changes so "give me 2 questions" yields 2 logical questions.

### Stored total

`sessions.total_questions` stores the **logical** count (groups = 1). Set in
`createSession` ([backend/services/sessionService.ts](backend/services/sessionService.ts)).
Surfaces in the pre-start stat, resume/pending banner, and history.

### Group-aware scoring

`finishSession` ([backend/services/sessionService.ts](backend/services/sessionService.ts)):
each logical question contributes a single score in `[0,1]`:

- standalone → its existing points (mcq/calc 0/1, written fractional, multi =
  fraction of fields correct — unchanged per-part grading).
- group → the **average** of its parts' points.

`score` = sum of logical contributions; `total_questions` = logical count;
`accuracy = score / total_questions`. Per-part grading logic itself is
unchanged — only the final aggregation groups parts. This keeps history and the
results screen consistent.

### Results screen

[src/App.tsx](src/App.tsx) `ReviewScreen`: `items` collapses each group into ONE
review item (parts shown together under one number), and `stats`
(correct/incorrect/unanswered/total/percent) counts logical questions. A group's
review row shows its parts and an aggregate result derived from the averaged
contribution.

---

## 3. Time aggregation + practice recommendation

### Aggregation

A group-aware sum over the logical questions of a set:

```
recommendedMinutes = Σ ( estimated_minutes ?? fallback(type, difficulty) )
```

Fallback table (chosen defaults — adjustable):

| | easy | medium | hard |
|---|------|--------|------|
| MCQ  | 1 | 2  | 3  |
| Calc | 5 | 12 | 25 |

### Where it surfaces (practice) — **Approach A** (flag for veto at review)

Practice questions are only picked at `POST /api/sessions`; the editable time box
on the confirm screen ([src/App.tsx](src/App.tsx) READY step) is set *before*
questions exist. Of the three integration options considered (A pool-estimate,
B exact preview-pick, C post-create on exam screen), we use **A**:

- New endpoint `GET /api/sessions/estimate-time` (params:
  `program_course_id, mode, topic_id?, difficulty?, count`) computes the
  **average logical-question estimate over the eligible pool** (same base query
  as `pickSessionQuestions`, group-aware, with fallback) × `count`, and returns
  `recommended_minutes`.
- The confirm screen calls it when count/topic/difficulty change and prefills the
  editable time box, **replacing the `count × 2` heuristic**
  ([src/App.tsx](src/App.tsx#L736)). Fully editable — it's a recommendation.
- Exact when the pool ≤ count; representative otherwise. Acceptable because it is
  explicitly an editable suggestion.

Rejected: B (requires `createSession` to accept predetermined ids — larger
refactor) and C (timer starts on exam-screen mount, so "adjust before start" gets
awkward).

Scope: recommendation applies to **practice only**. Midsem / diagnostic /
full-exam keep their fixed durations.

---

## 4. Timer clock-skew fix

### Root cause

`timeLeftMs` subtracts the server's `started_at` from the client's `now`
([src/App.tsx](src/App.tsx#L3204-L3208)):

```
elapsed = now(client clock) − startedAt(server clock) − totalPausedMs
```

When a client's clock is wrong (the reported case: laptop ~8 days behind),
`elapsed` goes hugely negative and `timeLeft` balloons to ~195h. The math
assumes client and server clocks agree.

### Fix (clock-skew-proof)

Never subtract a server timestamp from a client timestamp.

- `resumeSession`
  ([backend/services/sessionService.ts](backend/services/sessionService.ts))
  returns a server-computed `elapsed_ms = now − started_at − total_paused_ms`
  (all on the server clock).
- The hydrate effect ([src/App.tsx](src/App.tsx#L3278)) seeds
  `remainingAtHydrate = durationMs − elapsed_ms` and records the client's
  `Date.now()` at that moment. `timeLeftMs` ([src/App.tsx](src/App.tsx#L3204))
  then counts down using only **client-side deltas** since hydrate
  (`remainingAtHydrate − (now − clientHydrateTs) − pausedSinceHydrate`). Client
  clock skew cancels out.
- Clamp `timeLeftMs` to `[0, durationMs]` defensively.

Pause/resume keeps working since pauses are measured as client-relative deltas.

---

## 5. Exam question layout

Confirmed via mockups. The current arena pins the answer to the bottom of a
`flex-1` scroll zone, so a short prompt leaves a large dead gap between question
and answer ([src/App.tsx](src/App.tsx#L3856-L3917)).

New layout for the question core:

- **Input flows directly under the question** (dynamic) — answer sits where the
  eye lands after reading, not pinned to the bottom. Applies to MCQ options,
  short input, multi-input, and written.
- **The space below is intentionally left blank** — no centering, no stretching,
  no filler. (Vertical centering was the previously-reverted mistake.)
- **Only the Prev / Next / Submit bar is pinned** to the bottom (a legitimate
  persistent control), so the blank sits above a real element and reads as
  deliberate.
- **Long written answers grow to fill** the available height, so they show
  little or no blank.
- Diagram questions keep their existing prompt+diagram arrangement.
- No scratchpad (students work on paper; not worth the complexity).

This is a layout change within the existing question-core JSX — the 12-col
grid + navigator and the scroll/diagram handling are unchanged except for
un-pinning the answer and pinning the nav bar.

---

## Out of scope

- No change to per-part grading correctness (only final aggregation groups
  parts).
- No change to midsem/diagnostic/full-exam fixed durations.
- No backfill of `estimated_minutes` onto existing questions (they use the
  fallback until edited).
- No new merge/split admin UI; no scratchpad.
- AI schedule assistant (separate in-flight work) untouched.

---

## Verification

- `npm run lint` clean (the source of TS truth).
- Backend restart after service/route/schema changes.
- DB: new column present; estimates persist on the lead part for groups.
- Counting: requesting N practice questions yields N logical questions; a 3-part
  group shows as one in the count, the total, and the results list; accuracy is
  out of logical questions and never exceeds 100%.
- Timer: with the OS clock set deliberately wrong, a fresh practice session shows
  the correct remaining time (manual check / simulated `elapsed_ms`).
- Recommendation: the practice time box prefills from estimates and remains
  editable; un-estimated questions fall back to the table.
- Layout: short MCQ/calc questions show input directly under the prompt with
  blank space below and a pinned nav bar; long written answers fill the height.
