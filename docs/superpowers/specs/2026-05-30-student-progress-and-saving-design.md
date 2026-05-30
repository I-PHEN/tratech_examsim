# Student Progress & Saving — Design

**Date:** 2026-05-30
**Status:** Approved (pending written-spec review)

## Context

Three student-facing gaps surfaced while reviewing the topic-select and diagnostic flows:

1. **The topic card's "% MASTERY" is dead.** `Topic.mastery` is an optional field nothing ever populates, so every card reads `0% Mastery` with an empty bar ([src/components/ui/TopicCard.tsx:73-83](src/components/ui/TopicCard.tsx#L73-L83)). Students get no signal of where they stand per topic. (The sibling "N QUESTIONS" counter was just fixed in a separate commit.)
2. **The diagnostic has no payoff.** Diagnostic mode runs 20 questions balanced across topics/difficulty ([backend/services/routingService.ts:71-98](backend/services/routingService.ts#L71-L98)), then dumps the student into the same per-question review as any exam. The mode-select copy promises "find your weak spots" ([src/App.tsx:1320](src/App.tsx#L1320)) but no weak-spot breakdown is ever shown.
3. **No way to save questions.** The only "mark" is the in-exam Flag, which is purely client-side per-session state (`flagged: Set<number>` in [src/App.tsx](src/App.tsx)) and vanishes on submit. Students can't keep a tricky question to revisit.

This spec covers all three as one coherent body of work. They share data (per-answer `points`/`is_correct` already persisted on `session_answers`) and ship as one design, then split into implementation plans.

## What already exists (reuse)

- **Per-answer grading is persisted.** `session_answers` carries `is_correct` (bool|null) and `points` (0–1 fractional) per answer ([backend/services/sessionService.ts:38-50](backend/services/sessionService.ts)). MCQ/numeric graded at submit; written answers AI-graded during `finishSession` with partial-credit `points`.
- **User identity** is the Firebase uid string, stored as `sessions.user_uid`. No Supabase users table.
- **Lifetime per-topic analytics** already exist: `GET /analytics/by-topic` returns attempts/correct/accuracy ([backend/routes/analytics.ts](backend/routes/analytics.ts)). Mastery is a *different* (recency-weighted) computation but the join pattern (`session_answers` ⋈ `sessions` ⋈ `questions`) is the same.
- **Review screen** at [src/App.tsx:1715-2069](src/App.tsx#L1715-L2069) fetches `GET /api/sessions/:id` and renders score, accuracy, and per-question detail with All/Correct/Incorrect/Unanswered filters.

## Feature 1 — Topic Mastery

**Definition.** Recency-weighted accuracy, per user, per topic. Every graded answer ever given on the topic counts, but recent answers dominate.

**Formula.** Order the user's graded answers on a topic newest→oldest. Answer `i` (0 = most recent) gets weight `w = 0.5^(i / 15)` — weight halves every ~15 answers. `mastery = round(100 · Σ(wᵢ·pointsᵢ) / Σ(wᵢ))`. Only answers with non-null `points` count.

**States by graded-answer count:**
| Count | State | Card |
|------|-------|------|
| 0 | `not_started` | "Not started", no bar |
| 1–3 | `in_progress` | "In progress", muted bar, no % |
| ≥4 | `scored` | mastery % + filled bar |

**Backend.** New `backend/services/masteryService.ts`:
- `computeMastery(orderedPoints: number[]): { state, mastery, answered_count }` — **pure**, exported, unit-tested. `orderedPoints` is newest-first.
- `getCourseMastery(userUid, programCourseId)` — one query: `session_answers` selecting `points, answered_at`, embedded `sessions!inner(user_uid, program_course_id)` and `questions!inner(topic_id)`, filtered `points not null` + the uid/course, ordered `answered_at` desc. Group rows by `topic_id`, run `computeMastery` per group.

New route `GET /api/mastery?program_course_id=…` (auth'd, in `backend/routes/mastery.ts`, mounted in `server.ts`) → `[{ topic_id, state, mastery, answered_count }]`.

**Why not fold into `/api/topics`:** that endpoint is shared with the admin console, where per-user mastery is meaningless. Keep it clean.

**Frontend.** The topic-select effect already fetches `/api/topics` ([src/App.tsx:442](src/App.tsx#L442)); add a parallel `/api/mastery` fetch and merge by `topic_id` into `availableTopics`. Extend `Topic` ([src/types.ts:32-38](src/types.ts#L32-L38)) with `masteryState?: 'not_started' | 'in_progress' | 'scored'`. `TopicCard` renders the three states instead of the raw `mastery ?? 0`.

## Feature 2 — Diagnostic Report

**Behavior.** When a `diagnostic` session's review loads, render a diagnostic-only header block **above** the existing per-question review:
- Every topic touched in the diagnostic, listed with its accuracy **for this session** (e.g. "Reactor Design 80% · Kinetics 30%"), sorted weakest-first.
- A **"Practice [topic]"** button on each topic scoring **below 60%** → launches targeted practice (PRACTICE mode, that topic) via the existing flow ([src/App.tsx:691](src/App.tsx#L691) sets `step: 'TOPIC_SELECT'` / targeted practice). If no topic is below 60%, the block shows a "solid across the board" note and no CTA.

The per-question review below is unchanged.

**Backend.** The `GET /api/sessions/:id` review payload gains `topic_breakdown: [{ topic_id, topic_name, correct, total, accuracy }] | null`, populated **only when `mode === 'diagnostic'`**. Grouping extracted as pure `summarizeByTopic(answers)` in `sessionService` (or a small helper module), unit-tested. Topic names resolved with one `topics` lookup over the session's distinct topic ids.

**Frontend.** `ReviewSessionData` ([src/App.tsx:1617-1650](src/App.tsx#L1617-L1650)) gains `topic_breakdown`. ReviewScreen renders the header block when it's present.

## Feature 3 — Bookmarks

**Table** (migration via `mcp__supabase__apply_migration`):
```sql
create table bookmarked_questions (
  id uuid primary key default uuid_generate_v4(),
  user_uid text not null,
  question_id uuid not null references questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_uid, question_id)
);
alter table bookmarked_questions enable row level security;
-- no policies; service-role key bypasses RLS (repo convention)
```

**API** — `backend/routes/bookmarks.ts` + `backend/services/bookmarkService.ts`, mounted in `server.ts` (auth'd):
- `POST /api/bookmarks { question_id }` — insert, ignore-on-conflict (idempotent).
- `DELETE /api/bookmarks/:question_id` — remove for the current user.
- `GET /api/bookmarks?program_course_id=…` — saved questions joined to `question_content` (prompt/explanation) + topic, for the Saved screen.

**Save surface — review only.** The review payload gains `bookmarked: boolean` per question (one lookup over the session's question ids). ReviewScreen shows a star toggle per question wired to POST/DELETE. The exam UI and its ephemeral Flag are untouched.

**Saved screen.** New `'SAVED'` step in `AppState` ([src/types.ts:58](src/types.ts#L58)), reachable from the nav alongside Sessions History. Lists saved questions grouped by course/topic, each showing prompt + explanation. Two actions: **"Quiz me"** (graded session, below) and a per-question expand for review.

**Re-practice path.** `POST /api/sessions` gains an optional `question_ids: string[]`. When present, it bypasses the topic router (`pickSessionQuestions`) and seeds the session directly from those ids: `mode = 'practice'`, `total_questions = ids.length`. Answers grade and feed mastery like any session. **Edge case:** a saved multi-part sub-part is quizzed standalone (its `shared_stem` still renders); no automatic sibling expansion.

## Data flow summary

```
Topic mastery:   session_answers ⋈ sessions(user) ⋈ questions(topic)
                   → computeMastery() per topic → /api/mastery → topic cards

Diagnostic:      finishSession grades → review fetch builds topic_breakdown
                   (mode=diagnostic only) → ReviewScreen header block → Practice CTA

Bookmarks:       review star → POST/DELETE /api/bookmarks
                 Saved screen → GET /api/bookmarks → "Quiz me"
                   → POST /api/sessions { question_ids } → graded session → feeds mastery
```

## Testing

No DB integration harness exists (deliberate — see prior decision). CRUD/route wiring is verified by `npm run lint` + manual smoke. The pure logic is extracted and unit-tested with Vitest:

- **`computeMastery(orderedPoints)`** — decay weighting (recent answers dominate), the three threshold states (0 / 1–3 / ≥4 answers), empty input, all-correct vs mixed-points, a long sequence where old mistakes are out-weighted by recent successes.
- **`summarizeByTopic(answers)`** — grouping by topic, accuracy rounding, single-topic and multi-topic, all-correct and all-wrong topics.

## Out of scope

- Time-based / forgetting decay (chose attempt-order decay).
- Bookmarking from inside the exam (review-only by decision).
- A no-stakes flip-through review mode for saved questions (re-practice is a real graded session).
- Mastery on the admin console.
- Auto-expanding multi-part siblings in saved re-practice.

## Verification

1. `npm run lint` clean; `npm run test` green incl. new `computeMastery` / `summarizeByTopic` cases.
2. Manual: answer several questions on a topic across sessions → topic card shows the right state transitions (Not started → In progress → %), and a recent run of correct answers visibly raises the %.
3. Manual: run a diagnostic → review opens with the per-topic header block + weakest-first ranking; "Practice [topic]" launches that topic's practice.
4. Manual: star a question in review → appears on the Saved screen → "Quiz me" creates a graded session from saved ids → answers show in history and move mastery.
