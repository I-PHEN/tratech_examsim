# Topic Card — Attempted Question Count

**Date:** 2026-06-08

## Goal

Show students how many distinct questions they've attempted out of the total on each topic card, displayed as `4 / 10 Questions`.

## Decisions Made

- **"Attempted"** = distinct question IDs the student has submitted an answer for, regardless of correctness.
- **Display format** = replace the plain `N Questions` label with `X / N Questions` (Option A from brainstorm — simplest, no layout change).
- **Data source** = extend the existing mastery endpoint (Option A) — no new endpoint, no extra round-trip.
- **Difficulty filter** = the denominator (`count` prop) already adjusts per difficulty filter; the numerator (`attemptedCount`) is always the topic-wide distinct total, not filtered by difficulty. Acceptable trade-off for now.

## Backend Change — `backend/services/masteryService.ts`

**`getCourseMastery`:**

1. Add `question_id` to the Supabase select string.
2. In the per-topic grouping loop, maintain a `Set<string>` of distinct question IDs alongside the existing `points` array.
3. Add `attempted_count: number` (= `Set.size`) to `TopicMastery` interface and return it per topic.

No new routes. No schema changes.

## Frontend Changes

### `App.tsx`

- Add `attempted_count: number` to `ApiMastery` interface.
- Add `attemptedCount: number` to the `Topic` interface.
- Map `m?.attempted_count ?? 0` when building topics from the fetch response (alongside existing `mastery`, `masteryState`).
- Pass `attemptedCount={topic.attemptedCount}` to `<TopicCard>`.

### `src/components/ui/TopicCard.tsx`

- Add optional `attemptedCount?: number` prop.
- Change left label render:
  - If `attemptedCount` is defined: `{attemptedCount} / {shownCount} Questions`
  - Else (fallback): `{shownCount} Questions`

## Files Touched

| File | Change |
|------|--------|
| `backend/services/masteryService.ts` | Add `question_id` to select; count distinct per topic; add `attempted_count` to `TopicMastery` |
| `src/App.tsx` | Add `attempted_count` to `ApiMastery`; add `attemptedCount` to `Topic`; map + pass to card |
| `src/components/ui/TopicCard.tsx` | Add `attemptedCount` prop; update label render |

## Out of Scope

- Per-difficulty attempted counts (can revisit if "4 / 5 Hard" confusion becomes real feedback).
- Admin topic cards (not used).
