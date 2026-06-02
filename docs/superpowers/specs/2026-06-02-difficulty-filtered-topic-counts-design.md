# Difficulty-filtered topic counts

Date: 2026-06-02
Branch: `feat/ui-admin-improvements`

On the Targeted Practice topic-select screen, the difficulty filter
(Easy/Medium/Hard/All) currently only affects the quiz *start* request. The
per-topic question count on each `TopicCard` always shows the topic's total,
regardless of the selected difficulty. Make the count reflect the selected
difficulty for every topic, and disable topics that have zero questions at that
difficulty.

## Behavior

- Selecting a difficulty updates every topic card's count to the number of
  questions in that topic at that difficulty. "All" shows the topic total.
- A topic with 0 questions for the selected difficulty is **disabled** (greyed,
  not clickable). This rule is universal — under "All", a topic with 0 total
  questions is disabled too (today it is clickable but empty).
- If the currently selected topic drops to 0 when the difficulty changes, the
  selection is cleared so the user can't proceed to READY with an empty set.
- Switching difficulty is instant (no refetch / no spinner): all buckets are
  computed server-side once and chosen client-side.

## Data shape

`difficulty` is stored lowercase on `questions` (`easy` | `medium` | `hard`).
A question with a null/unknown difficulty counts toward the topic total only,
not toward any specific bucket.

## Backend — `GET /api/topics` (`backend/routes/topics.ts`)

- Change the count query from `.select('topic_id')` to
  `.select('topic_id, difficulty')`.
- Bucket per topic into `{ total, easy, medium, hard }`.
- Return per topic (additive — existing callers unaffected):
  - `question_count`: total (unchanged; drives "All").
  - `question_counts`: `{ easy, medium, hard }`.

## Frontend — `src/App.tsx` + `src/components/ui/TopicCard.tsx`

- `Topic` type gains `questionCounts?: { easy: number; medium: number; hard: number }`,
  populated where topics are mapped (App.tsx ~476-487) from `r.question_counts`.
- In the topic grid, compute per card:
  - `count = state.difficulty === 'All' ? topic.questionsCount : topic.questionCounts?.[diffKey] ?? 0`
    where `diffKey` is the lowercased difficulty.
  - `disabled = count === 0`.
  - Pass `count` and `disabled` into `TopicCard`.
- `TopicCard` gains `count?: number` and `disabled?: boolean` props:
  - Show `count` in the "N Questions" label (fall back to `topic.questionsCount`
    if `count` is not provided, for safety).
  - When `disabled`: `<button disabled>`, reduced opacity, `cursor-not-allowed`,
    no active styling, no click.
- When `state.difficulty` changes, if `selectedTopic` now resolves to a 0 count,
  clear `selectedTopic`.

## Out of scope

- The Quick 5/10/20 buttons and the question-count max are unchanged.
- Diagnostic and exam-simulation modes are unaffected (no difficulty filter UI).
- The existing difficulty-fallback on quiz start is unchanged; disabling 0-count
  topics simply means the user can't reach it for a difficulty that has none.

## Verification

`npm run lint` clean. Backend: confirm `/api/topics` returns `question_counts`
per topic (probe or in-app). Frontend: on the topic-select screen, toggle
Easy/Medium/Hard/All and confirm counts update and 0-count cards disable;
confirm a selected topic clears if it disables on a difficulty switch.
