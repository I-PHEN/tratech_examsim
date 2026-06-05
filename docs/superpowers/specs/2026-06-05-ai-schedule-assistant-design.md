# AI Schedule Assistant

Date: 2026-06-05
Status: **Designed, on hold.** (Resume → writing-plans when ready.)
Depends on: the shipped Scheduled practice & reminders feature (Phases 1–3).

An AI helper inside the **Scheduled** area that turns plain English into
ready-to-save practice schedules — both quick natural-language creation and
data-driven study planning — while being strictly **scope-limited to
scheduling**.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| AI role | **Both** quick NL-create **and** study planning |
| Plan intelligence | **Data-driven but transparent** — uses the student's topic mastery/accuracy to prioritise weak topics, and shows *why* each topic was picked so they can override |
| Interaction surface | **A — inline "describe it" box** (one input → draft cards), not chat, not a wizard |
| Agency | AI **proposes drafts only**; nothing is created until the user saves |

## UX

In the Scheduled screen, above "+ New schedule": a collapsible **"✨ Ask AI to
schedule"** box — a single text field + Send.

- The user types a request, e.g. *"reactor design Mon/Wed/Fri 6pm"* or *"thermo
  exam June 20, I'm weak on entropy"*.
- The assistant returns one or more **draft cards**. Each card shows
  course · topic · difficulty · count · when (once / weekly with days+time), plus
  a one-line **why** (e.g. "Entropy — your weakest at 45%").
- Per card: **Edit** (opens the existing schedule form pre-filled), **Remove**,
  **Save**. A **Save all** convenience action saves every remaining draft.
- Saving creates the schedule via the existing `POST /api/schedules`; the list
  refreshes and drafts clear.
- Off-topic / unclear input → a short message ("I can only help schedule
  practice — tell me what to practice and when"), no cards.

## Architecture

### Frontend
- New `AiScheduleAssistant` component inside `ScheduledScreen` (input + draft
  cards). Editing a draft **reuses the existing schedule form**; saving reuses
  the existing create API. No chat history/state in v1.

### Backend
- `POST /api/schedules/ai-draft` (requireAuth) → new `scheduleAiService.ts`:
  1. **Gather context** — the user's available program-courses + topics for the
     current period, and their topic mastery/accuracy — reusing existing
     analytics/mastery services.
  2. **Call Groq** (existing `backend/lib/llm.ts`) with a strict system prompt +
     the context + the user's text, requesting **structured JSON output**: a
     `proposals[]` array, each item carrying the schedule fields
     (program_course_id, topic_id|null, difficulty|null, question_count,
     recurrence + once/weekly fields, timezone, label) plus a `why` string.
  3. **Validate every proposal server-side** against the `ScheduleCreate` Zod
     schema **and** confirm the program_course_id / topic_id actually belong to
     this user's available set (reject hallucinated or out-of-scope ids). Drop
     invalid proposals.
  4. Return `{ proposals, message }` — **drafts, not saved**.

## Guardrails ("only schedule")

- The model has **no capability except "propose schedules"** — structured output,
  no tools, a system prompt that refuses anything else.
- The server **never trusts the model**: each proposal is re-validated against the
  Zod schema and the user's real course/topic ids before display, and nothing is
  created until the user clicks Save. Worst case is a dropped draft — never a
  wrong or out-of-scope action.
- Off-topic input → empty proposals + a polite message.

## Transparent planning

- The model is given the student's weak-topic stats (mastery/accuracy) so it can
  prioritise them and **cite the reason** in each card's `why`. The student sees
  the reasoning and overrides by editing/removing.
- The browser passes its **IANA timezone + today's date** so relative phrases
  ("every weekday", "next Monday 6pm", "until June 20") resolve correctly. Final
  `next_run_at` is computed by the existing luxon create path on save.

## Errors / limits

- LLM failure/timeout → inline "Couldn't draft that — try rephrasing" (reuse the
  app's inline-error pattern).
- No matching course/topic → the message says what's missing (e.g. "I couldn't
  find a Thermodynamics course in your current period").
- Cap ~7 proposals per request; the existing 50-active-schedule cap applies on
  save.

## Testing

- Pure logic — proposal → validated draft, id-ownership check, tz/relative-date
  resolution — gets vitest unit tests (matches the repo's TDD-for-pure-logic
  convention). The LLM call itself is integration / manual.

## Out of scope (v1)

- Multi-turn chat / refinement (could evolve from approach A later).
- Editing or rescheduling **existing** schedules via AI.
- Non-practice modes (timed exams).
- Bulk plan management beyond "save these drafts".
