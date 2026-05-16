# CLAUDE.md

Notes for Claude Code working in this repo. Keep this short — anything that would rot in a month doesn't belong here.

## Stack

- **Backend**: Express, served by `tsx backend/server.ts`. Vite middleware-mode handles the frontend in dev.
- **Frontend**: React 19 + Vite + Tailwind 4. Entry is [src/App.tsx](src/App.tsx) (student) and [src/Admin.tsx](src/Admin.tsx) (admin console).
- **Database**: Supabase Postgres + Storage (bucket `ingestion-uploads`).
- **Auth**: Firebase Auth (ID tokens) + Firestore for user profile.
- **AI**: OpenRouter (LLM — classifier / verifier / topic matcher / tutor) and Mistral (OCR for PDF + images).

## Dev loop

- `npm run dev` → `tsx backend/server.ts`. **No watch mode.** Backend edits need a manual restart:
  ```powershell
  $pid = (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess
  Stop-Process -Id $pid -Force
  npm run dev   # run via Bash run_in_background
  ```
  Frontend edits hot-reload via Vite, no restart needed.
- `npm run lint` → `tsc --noEmit`. **This is the source of TypeScript truth.** The IDE TS server in this workspace regularly emits phantom diagnostics like `JSX element implicitly has type 'any'` or `Could not find a declaration file for module 'react'` after edits — ignore them and trust `npm run lint`.
- `.env` is read at process startup — restart backend after editing.

## Where things live

- `backend/routes/*.ts` — Express routers, mounted in `backend/server.ts`.
- `backend/services/*.ts` — business logic; routes stay thin.
- `backend/schemas/*.ts` — Zod validators (`parse(Schema, input)` from `backend/lib/validate.ts`).
- `backend/services/extraction/` — AI ingestion pipeline (OCR → classify → topic-match → verify).
- `src/components/admin/` — admin console UI.
- `src/lib/apiClient.ts` — `apiGet/apiPost/apiPatch/apiDelete/apiUpload`. All include the Firebase ID token automatically.
- `src/lib/AuthContext.tsx` — `useAuth()` exposes `currentUser`, `userProfile`, `isAdmin`.

## Auth

- All `/api/*` routes except `/api/health` are gated by `requireAuth` ([backend/lib/auth.ts](backend/lib/auth.ts)). Downstream handlers can read `req.user.uid` / `req.user.email`.
- Admin-only endpoints add `requireAdmin`. Admin status is an **email allowlist** in `ADMIN_EMAILS` in the same file — not a role table. Update the set to grant admin.
- The frontend's "passcode gate" in [src/Admin.tsx](src/Admin.tsx) (`STOIC2026`) is UI-only; the real check is server-side `requireAdmin`.

## Database conventions

- All tables have **RLS enabled with no policies**. The backend uses the service-role key (`SUPABASE_SERVICE_ROLE_KEY`) which bypasses RLS. Don't add policies unless you're moving a route to the anon client (which we don't do today).
- DDL → `mcp__supabase__apply_migration`. DML / inspection → `mcp__supabase__execute_sql`.
- PK default is `uuid_generate_v4()` (matches existing tables). Don't switch to `gen_random_uuid()` mid-schema.
- FK conventions used so far:
  - `ON DELETE CASCADE` for tightly-coupled children: `mcq_options`, `question_content`, `question_assets`, `session_answers`, `topics → program_courses`.
  - `ON DELETE SET NULL` for soft references: `session_answers.picked_option_id`, `sessions.topic_id`.
  - `ON DELETE RESTRICT` for protected references: `sessions.program_course_id`.
- **Storage objects cannot be deleted via SQL** (`storage.protect_delete` trigger). Use the Storage API — see `removeFile` in [backend/services/storage.ts](backend/services/storage.ts).

## Error pattern (full stack)

Backend throws structured errors:

```ts
throw new ApiError(404, 'NO_QUESTIONS', 'No questions found for that course.');
```

`errorMiddleware` ([backend/lib/errors.ts](backend/lib/errors.ts)) formats them as `{error: {code, message}}` JSON.

Frontend [src/lib/apiClient.ts](src/lib/apiClient.ts) parses that body and re-throws an `ApiError(status, code, message)`. UI handlers branch on `e.code`:

```ts
catch (e) {
  if (e instanceof ApiError && e.code === 'NO_QUESTIONS') { ... }
  else { ... }
}
```

Don't regex error messages and don't render raw error JSON to users.

## AI services

- **OpenRouter** ([backend/lib/openrouter.ts](backend/lib/openrouter.ts)): default model in `.env` `OPENROUTER_DEFAULT_MODEL`. The wrapper retries 429 / 502 / 503 / 504 (and body errors with `code` 429) with `Retry-After` or 2s/5s/12s backoff, up to 3 attempts. On retry-exhausted or 200-with-empty-content, throws a descriptive error including `finish_reason` and a body snippet.
- **Pipeline concurrency** ([backend/services/extraction/pipeline.ts](backend/services/extraction/pipeline.ts)): drops classify concurrency from 3 → 1 when the model id ends in `:free` (free models have aggressive rate limits).
- **Mistral OCR** ([backend/lib/mistralOcr.ts](backend/lib/mistralOcr.ts)): PDF goes through Files API (upload → signed URL → OCR). Images go inline base64.

## Question creation paths

Two ways to get questions into the DB, both use the same `QuestionCreate` Zod schema and write the same DB tables (`questions` + `question_content` + `mcq_options` + optional `question_assets`):

1. **Admin → Manual Entry** ([src/components/admin/ManualQuestionEntry.tsx](src/components/admin/ManualQuestionEntry.tsx)) — direct `POST /api/questions`, then sequential `POST /api/questions/:id/assets` for diagrams. Use this when authoring or testing.
2. **Admin → Ingestion** — upload PDF/image/text → AI pipeline (OCR → classify → topic-match → verify) → produces `ingestion_drafts` for review → `POST /api/ingestion/jobs/:id/publish` calls `createQuestion` per accepted draft.

## User preferences (observed)

- **No mock or seeded data anywhere** — empty states are fine, fake content is not.
- **Don't over-engineer** — no premature abstractions, no preemptive feature flags, no half-wired UI.
- **Fix root causes** — don't add fallbacks that mask the real failure (e.g. `parseInt(x) || 1` was masking an empty input bug; the right fix was a raw-string state).
- **Inline error states beat detached error pages** — keep the sidebar/header visible, render the message in context.
- **Real end-to-end before polish** — happy path working > one screen looking nicer.

## Gotchas

- `npm run dev` failures with `exit code 127` after a foreground kill are usually the *previous* background process closing — check the new `bg-id` output file, not the notification.
- `Bash` tool's `findstr /FI` syntax fails because Git Bash shadows `findstr`'s argument parsing. Use `Get-NetTCPConnection`/`Stop-Process` via PowerShell tool for port management.
- After deleting `program_courses` rows, `topics` cascade away (FK `confdeltype = 'c'`). Confirmed via `pg_constraint`.
- `userProfile.year` and `.semester` may be stored as `"3"` / `"Sem 1"` / `"Year 3"` — the App normalises with the `.startsWith("Year")` check before use.
