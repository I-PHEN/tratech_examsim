# Scheduled practice reminders — go-live setup

The code (Phase 2) is deployed. Reminders fire when an **external cron** pings a
secret-protected endpoint every minute. Two channels: the **in-app bell** (works
with just the cron) and **email** (optional, needs Resend).

## How it works

```
cron-job.org  ──POST /api/internal/run-due-reminders (header x-cron-secret)──▶  web service
                                                                                  │
                          claims due schedules (atomic) ─▶ writes notification ─▶ best-effort email
```

The endpoint is **not** behind login — it is gated solely by the `x-cron-secret`
header matching the `CRON_SECRET` env var (fails closed: missing/wrong secret → 401).

## 1. Set environment variables on Render

Dashboard → the `tratech-examsim` service → **Environment**. All are `sync: false`
in `render.yaml`, so set the values here:

| Key | Value | Required? |
|---|---|---|
| `APP_URL` | `https://tratech-examsim.onrender.com` (your live URL) | Yes — used in reminder links |
| `CRON_SECRET` | a long random string (e.g. `openssl rand -hex 24`) | Yes — gates the cron endpoint |
| `RESEND_API_KEY` | from resend.com | Only for email |
| `EMAIL_FROM` | a verified sender, e.g. `Tratech <reminders@yourdomain>` | Only for email |

Save → Render redeploys. Use the **same** `CRON_SECRET` value in step 2.

## 2. Create the cron job (free) — cron-job.org

1. Sign up at https://cron-job.org and **Create cronjob**.
2. **URL:** `https://tratech-examsim.onrender.com/api/internal/run-due-reminders`
3. **Schedule:** every 1 minute (`* * * * *`).
4. **Request method:** `POST`.
5. **Headers:** add `x-cron-secret` = the exact `CRON_SECRET` value from step 1.
6. Save and enable.

That's it — in-app bell reminders now fire. (Pinging every minute also keeps the
Render free service awake, avoiding cold-start delays.)

> Alternative: a Cloudflare Worker Cron Trigger can do the same `fetch` with the
> header if you'd rather keep it in your own infra.

## 3. (Optional) Email via Resend

1. Create a Resend account, generate an **API key** → `RESEND_API_KEY`.
2. Either verify a sending domain and set `EMAIL_FROM` to an address on it, **or**
   for quick testing use Resend's `onboarding@resend.dev` sender to your own
   verified inbox.
3. Set both on Render (step 1) and redeploy.

Until these are set, `sendReminderEmail` is a no-op (logs and skips) — the bell
still works.

## Verify

With a due schedule present, hit the endpoint manually:

```bash
curl -s -X POST https://tratech-examsim.onrender.com/api/internal/run-due-reminders \
  -H "x-cron-secret: $CRON_SECRET"
# → {"fired":N,"emailed":M,"failed_emails":0}
```

A due schedule fires exactly once (the claim advances `next_run_at` atomically),
writes a `notifications` row, advances weekly schedules to their next occurrence,
and marks one-offs `completed`.
