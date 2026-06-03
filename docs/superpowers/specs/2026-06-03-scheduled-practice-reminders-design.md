# Scheduled practice & reminders

Date: 2026-06-03
Branch: `feat/ui-admin-improvements` (implementation deferred — spec only)
Status: **Designed, not yet scheduled for implementation.**

Let students schedule practice for later — one-off or recurring — and be
reminded when it's time, by email (works with the app closed) and an in-app
notification feed. Tapping a reminder opens a pre-filled "Start" screen.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| What's scheduled | **Both** one-off and recurring (weekly) |
| Delivery channel | **Email** (reliable backbone) **+ in-app feed** (bell). Web push is a possible later add. |
| Scheduler | **Render Cron Job → secret-protected backend endpoint** |
| Where it lives | **Dedicated "Scheduled" sidebar section** (its own form + list; practice setup screen unchanged) |
| Reminder tap | **Pre-filled "Start" screen** (one tap to begin; not auto-start) |
| Email provider | **Resend** |
| Mode scope | **PRACTICE only** for now (timed exams later) |

## Data model (Supabase; RLS enabled, no policies — service role)

### `practice_schedules`
- `id` uuid pk default `uuid_generate_v4()`
- `user_uid` text not null (Firebase uid; no FK)
- `program_course_id` uuid not null — FK → `program_courses` ON DELETE CASCADE
- `topic_id` uuid null — FK → `topics` ON DELETE CASCADE (null = whole course / mixed)
- `difficulty` text null — `'easy' | 'medium' | 'hard'`, null = All
- `question_count` int not null default 10 (check 1–50)
- `label` text null
- `timezone` text not null — IANA tz captured from the browser
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
- `recurrence` text not null — `'once' | 'weekly'`
  - once: `run_at` timestamptz
  - weekly: `days_of_week` int[] (0=Sun … 6=Sat), `time_of_day` text (`"18:00"`),
    `ends_on` date null
- `next_run_at` timestamptz null — **single source of truth for the scheduler**
  (once → = run_at; weekly → next future occurrence; null when not active)
- `status` text not null default `'active'` — `active | paused | completed | cancelled`
- `last_fired_at` timestamptz null
- `created_at` / `updated_at` timestamptz default now()

### `notifications` (in-app feed + record of every fire)
- `id` uuid pk default `uuid_generate_v4()`
- `user_uid` text not null
- `type` text not null — `'practice_reminder'` (room for more later)
- `title` text not null, `body` text null
- `schedule_id` uuid null — FK → `practice_schedules` ON DELETE SET NULL
- `payload` jsonb null — params to start: `{ program_course_id, topic_id, difficulty, question_count, mode }`
- `read_at` timestamptz null
- `email_sent_at` timestamptz null (observability)
- `created_at` timestamptz default now()

## Scheduler + delivery

### Cron → endpoint
- Render Cron Job (`render.yaml`, schedule `* * * * *`) calls
  `POST /api/internal/run-due-reminders` with header `x-cron-secret: $CRON_SECRET`.
- The endpoint is **not** behind `requireAuth`; it validates the secret header
  against `CRON_SECRET` and 401s otherwise.

### Firing engine (idempotent)
1. **Atomically claim** due rows:
   `UPDATE practice_schedules SET last_fired_at = now(), next_run_at = <next-or-null>, status = <active|completed> WHERE status='active' AND next_run_at <= now() RETURNING *`.
   Advancing `next_run_at` inside the claim guarantees each due instant fires
   once even if two cron runs overlap.
2. For each claimed row: **insert the `notifications` row first** (so the
   reminder is never lost if email fails), then **send the email** (best-effort;
   stamp `email_sent_at` on success; log on failure).
3. Recurrence: compute the next **future** occurrence with `luxon` (DST-correct).
   Missed occurrences (server down, etc.) are skipped to the next future one
   rather than spamming a backlog; a one-off whose time has passed still fires
   once then completes.

### Email (`backend/lib/email.ts`)
- Thin `EmailSender` wrapper around Resend (`RESEND_API_KEY`, from `EMAIL_FROM`).
- Template: subject "Time to practice — {course/topic}", body with a **Begin
  practice** button linking to `APP_URL/?start=<scheduleId>`.

### Deep link
- `APP_URL/?start=<scheduleId>` opens the app. If the user is signed in, the app
  resolves the schedule's params **live** (GET the schedule) and shows the
  pre-filled Start screen. If not signed in, the pending `start` is preserved
  across sign-in and honored afterward. The link carries no session/secret.

## Frontend UX

- **Sidebar**: new "Scheduled" item (Clock icon) between Targeted Practice and
  My Sessions. New `AppState.step = 'SCHEDULED'`.
- **Scheduled screen**:
  - **"+ New schedule"** form: Course (`CourseSelect`) → Topic (optional) →
    Difficulty (Easy/Medium/Hard/All) → Count → **When**: one-off (date + time)
    or weekly (day-of-week chips + time) → optional label → Save.
  - **List** of schedules: each row shows label/course·topic, difficulty·count,
    next run (e.g. "Tue Jun 10, 6:00 PM" or "Mon–Fri 6:00 PM · next Tue"),
    status, and actions **edit / pause·resume / cancel**.
  - Empty state.
- **Header bell**: unread count + dropdown of recent reminders, fetched on load
  and on window focus (simple polling, no websockets). Clicking a reminder opens
  the pre-filled Start screen and marks it read.
- **Pre-filled Start screen**: shows the practice params with **[Begin practice]**
  (runs the existing practice start flow with these params) and **[Reschedule]**
  (opens edit). Reuses the current practice-launch logic.

## Backend (routes / services / schemas)

- `backend/routes/schedules.ts` (requireAuth):
  `GET /`, `POST /`, `PATCH /:id`, `POST /:id/pause`, `POST /:id/resume`,
  `DELETE /:id`. Server computes `next_run_at` from tz + recurrence on
  create/update.
- `backend/routes/notifications.ts` (requireAuth):
  `GET /` (feed + unread count), `POST /:id/read`, `POST /read-all`.
- `backend/routes/internal.ts`: `POST /run-due-reminders` (cron secret) — firing
  engine.
- `backend/services/scheduleService.ts`: `next_run_at` computation (luxon),
  claim-and-fire.
- `backend/lib/email.ts`: Resend wrapper + reminder template.
- `backend/schemas/schedule.ts`: Zod validators.
- Mounted in `backend/server.ts`.

## Robustness

- **Timezones**: per-schedule IANA tz; all next-run math is DST-correct (luxon).
- **Idempotency**: atomic claim (advance `next_run_at` in the UPDATE…RETURNING)
  prevents double-send under overlapping cron runs.
- **No lost reminders**: in-app `notifications` row is written before the email;
  email failure is logged, not fatal.
- **Missed fires**: caught up once, then recurring advances to the next future
  occurrence (no backlog spam).
- **Limits**: cap active schedules per user (50) to prevent runaway.
- **Auth**: deep link requires sign-in; pending `start` survives sign-in.
- **Secret**: `CRON_SECRET` gates the internal endpoint.

## Setup dependencies (one-time, user action)

- **Resend**: create account → `RESEND_API_KEY`; verify a sending domain →
  `EMAIL_FROM`.
- **Render**: add a Cron Job service (paid feature) running every minute; set
  `CRON_SECRET` on both the cron job and the web service.
- **New env**: `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` (`APP_URL` already
  set). `.env` is read at startup — restart after editing.
- **New deps**: `resend`, `luxon` (+ `@types/luxon`).
- **Migrations**: `practice_schedules`, `notifications` (via
  `mcp__supabase__apply_migration`).

## Suggested build phases (one cohesive spec, staged execution)

1. **Data + CRUD + Scheduled UI** — migrations, `schedules.ts`, the Scheduled
   screen (create/list/manage). Schedules persist and are visible; no delivery
   yet.
2. **Scheduler + delivery** — `internal.ts` firing engine, `email.ts` (Resend),
   `notifications.ts`, render.yaml cron, the header bell feed.
3. **Deep-link Start** — `?start=<id>` handling + pre-filled Start screen +
   sign-in-pending handoff.

## Out of scope (for now)

- Web push / PWA / service worker (possible later channel).
- Scheduling timed exam simulations (PRACTICE mode only).
- Recurrence beyond weekly (no daily-N, monthly, or arbitrary multi-date).
- Group/shared scheduling.

## Verification (per phase)

`npm run lint` clean; backend restart after backend changes. Phase 1: create a
one-off and a weekly schedule, see them listed with correct next-run text,
edit/pause/cancel. Phase 2: hit `run-due-reminders` with the secret for a due
schedule → in-app notification appears + email arrives; confirm a row fires
once. Phase 3: open `?start=<id>` → pre-filled Start screen → Begin runs the
practice.
