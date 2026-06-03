# Multi-part singleton collapse

Date: 2026-06-03
Branch: `feat/ui-admin-improvements`

A multi-part question whose group has been reduced to a single surviving part
still renders as a part (e.g. "2a"), implying a sibling "b" that no longer
exists. It should behave as a standalone question.

## Root cause

- A question is labelled as a "part" wherever the render gates on
  `question_group_id` being **present**, regardless of how many siblings the
  group actually has. `groupSize` (live membership count) is already computed
  but not used in the label conditions.
- Singleton groups arise mainly from **ingestion publish**
  (`backend/services/ingestionService.ts`): every draft with a `group_key` gets
  a `question_group_id` + `part_label`, so publishing only one part of a group
  (rejecting the others) leaves a one-member group. Authoring enforces ≥2 parts
  and the library/group-editor can't drop a group to one, so those paths don't
  produce it.

## Fix — two layers

### 1. Display guard (frontend)

Render a question as a part only when its group has more than one live member.

- `src/App.tsx`: change the label conditions from `groupId ?` to
  `groupId && groupSize > 1 ?` at the three render sites (nav label ~3316,
  review header ~2506, focus header ~2106). `groupSize` is already populated
  from membership counts, so this is correct in every case — including a
  half-finished incremental publish (part 'a' shows standalone until 'b' lands,
  then both become parts again).
- `src/components/admin/QuestionLibrary.tsx` `buildItems`: a group with exactly
  one member is emitted as a `single` item (`{ kind: 'single', row: parts[0] }`)
  instead of a `group`, so the library stops showing "Multi-part · 1 parts".

### 2. Data collapse (backend)

- New helper `collapseSingletonGroup(groupId)` in
  `backend/services/questionService.ts`: if the group has exactly one member,
  clear that row's `question_group_id`, `part_label`, and `part_index`.
  `shared_stem` is kept (valid context, non-destructive).
- `deleteQuestion`: read the row's `question_group_id` before deleting; after a
  successful delete, if it had a group, call `collapseSingletonGroup(groupId)`.
  This makes "delete parts until one remains → standalone question" true in the
  data, not just the display.
- One-time cleanup (DML, run once against the project DB) for rows already in
  the broken state:
  ```sql
  update questions
     set question_group_id = null, part_label = null, part_index = null
   where question_group_id in (
     select question_group_id from questions
      where question_group_id is not null
      group by question_group_id having count(*) = 1
   );
  ```

## Why not collapse at publish time

Publishing is incremental (one part at a time), so a group legitimately passes
through a one-member state between publishes. Collapsing eagerly there would
split a group mid-publish. The display guard handles that transient correctly;
the delete-hook and one-time cleanup handle the genuine leftovers.

## Out of scope

- No change to the ingestion publish flow or the group editor.
- No new "merge/split" admin UI.

## Verification

`npm run lint` clean. Backend restart for the service change. Confirm: the
existing "2a" question now shows as a standalone "Q2" in an exam and as a single
item in the library; deleting a part of a 2-part group leaves a clean standalone
(no part label); the one-time cleanup SQL affects only single-member groups.
