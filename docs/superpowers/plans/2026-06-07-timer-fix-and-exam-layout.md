# Timer Clock-Skew Fix + Exam Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Make the exam timer immune to a wrong client clock (the "195 hours remaining" bug), and (B) make a short question's input sit directly under it instead of pinned to the bottom with a dead gap.

**Architecture:**
- **A (timer):** `resumeSession` returns a server-computed `elapsed_ms` (now − started_at − total_paused_ms, all on the server clock). The exam screen seeds a **client-clock virtual start** = `Date.now() − elapsed_ms` and measures remaining time as `durationMs − (now − startedAt − totalPausedMs)` using ONLY client timestamps — so client/server clock skew cancels out. The remaining-time math moves into a pure, tested `remainingMs` helper that also clamps to `[0, durationMs]`.
- **B (layout):** In the exam "Question Arena", move the answer block INSIDE the scrolling zone so it flows right under the prompt; the leftover space falls to the bottom (intentional blank); only the Prev/Flag/Next bar stays pinned. Long written answers grow to fill.

**Tech Stack:** TypeScript, Express, Supabase, React 19, Vitest (`npx vitest run`), `npm run lint` (`tsc --noEmit`). Backend has NO watch mode — restart after backend edits.

---

## File Structure

- **Modify** `backend/services/sessionService.ts` — `resumeSession` returns `elapsed_ms`.
- **Create** `src/lib/examTimer.ts` (+ `.test.ts`) — pure `remainingMs` helper.
- **Modify** `src/App.tsx` — hydrate effect seeds a client-clock virtual start from `elapsed_ms`; `timeLeftMs` uses `remainingMs`; AND the Question Arena layout restructure.

---

### Task A1: `resumeSession` returns server-computed `elapsed_ms`

**Files:** Modify `backend/services/sessionService.ts` (`resumeSession`, ~lines 948-962).

- [ ] **Step 1: Replace the function body**

Current:
```ts
export async function resumeSession(uid: string, sessionId: string): Promise<SessionRow> {
  const row = await loadOwnedSession(uid, sessionId);
  if (row.finished_at) throw new ApiError(409, 'ALREADY_FINISHED', 'Session already finished');
  if (!row.paused_at) return row;
  const pausedMs = Date.now() - new Date(row.paused_at).getTime();
  const nextTotal = (row.total_paused_ms ?? 0) + Math.max(0, pausedMs);
  const { data, error } = await supabase
    .from('sessions')
    .update({ paused_at: null, total_paused_ms: nextTotal })
    .eq('id', sessionId)
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return data as SessionRow;
}
```

Replace with:
```ts
export async function resumeSession(
  uid: string,
  sessionId: string
): Promise<SessionRow & { elapsed_ms: number }> {
  const row = await loadOwnedSession(uid, sessionId);
  if (row.finished_at) throw new ApiError(409, 'ALREADY_FINISHED', 'Session already finished');

  let current: SessionRow = row;
  if (row.paused_at) {
    const pausedMs = Date.now() - new Date(row.paused_at).getTime();
    const nextTotal = (row.total_paused_ms ?? 0) + Math.max(0, pausedMs);
    const { data, error } = await supabase
      .from('sessions')
      .update({ paused_at: null, total_paused_ms: nextTotal })
      .eq('id', sessionId)
      .select(SESSION_COLUMNS)
      .single();
    if (error) throw error;
    current = data as SessionRow;
  }

  // Elapsed time excluding pauses, computed entirely on the SERVER clock (now −
  // started_at − total_paused_ms). The client seeds its countdown from this and
  // then only adds client-measured deltas, so a wrong client clock can't skew it.
  const elapsed_ms = Math.max(
    0,
    Date.now() - new Date(current.started_at).getTime() - (current.total_paused_ms ?? 0)
  );
  return { ...current, elapsed_ms };
}
```

(The `POST /:id/resume` route returns this object as JSON unchanged, so `elapsed_ms` is included automatically — no route change.)

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual verification (restart backend)**

Restart backend:
```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```
Then `npm run dev` (Bash `run_in_background`). `POST /api/sessions/:id/resume` on an in-progress session returns the session row plus `elapsed_ms` (a small positive number that grows the longer the session has been open).

- [ ] **Step 4: Commit**
```bash
git add backend/services/sessionService.ts
git commit -m "feat: resumeSession returns server-computed elapsed_ms

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A2: `remainingMs` pure helper + tests

**Files:**
- Create: `src/lib/examTimer.ts`
- Test: `src/lib/examTimer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/examTimer.test.ts
import { describe, it, expect } from 'vitest';
import { remainingMs } from './examTimer';

describe('remainingMs', () => {
  it('counts down from duration as time elapses', () => {
    // started 10s ago, 60s duration, no pause -> 50s left
    const r = remainingMs({ startedAt: 1000, durationMs: 60000, totalPausedMs: 0, pausedAt: null }, 11000);
    expect(r).toBe(50000);
  });

  it('clamps to 0 when time is up', () => {
    const r = remainingMs({ startedAt: 1000, durationMs: 5000, totalPausedMs: 0, pausedAt: null }, 11000);
    expect(r).toBe(0);
  });

  it('clamps to durationMs when elapsed is negative (clock skew / future start)', () => {
    // startedAt is AHEAD of now (a skewed clock) -> never more than full duration
    const r = remainingMs({ startedAt: 20000, durationMs: 60000, totalPausedMs: 0, pausedAt: null }, 11000);
    expect(r).toBe(60000);
  });

  it('freezes while paused (uses pausedAt, not now)', () => {
    const r = remainingMs({ startedAt: 1000, durationMs: 60000, totalPausedMs: 0, pausedAt: 6000 }, 50000);
    expect(r).toBe(55000); // 60000 - (6000 - 1000)
  });

  it('excludes accumulated paused time from elapsed', () => {
    const r = remainingMs({ startedAt: 1000, durationMs: 60000, totalPausedMs: 3000, pausedAt: null }, 11000);
    expect(r).toBe(53000); // elapsed = 10000 - 3000 = 7000
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/examTimer.test.ts`
Expected: FAIL (import cannot be resolved).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/examTimer.ts

export interface TimerState {
  /** Client-clock virtual start: Date.now() − server elapsed_ms, captured at hydrate. */
  startedAt: number;
  durationMs: number;
  /** Paused time accumulated (client-measured) since hydrate. */
  totalPausedMs: number;
  /** Client ts when currently paused, else null (freezes the countdown). */
  pausedAt: number | null;
}

/**
 * Remaining milliseconds, clamped to [0, durationMs]. Pure — uses only the values
 * given. When paused, time is measured to `pausedAt` (frozen) rather than `now`.
 * Because every term is a client-clock timestamp, the result is immune to any
 * client/server clock skew (the server's contribution is already folded into
 * `startedAt` at hydrate as `Date.now() − elapsed_ms`).
 */
export function remainingMs(s: TimerState, now: number): number {
  const ref = s.pausedAt ?? now;
  const elapsed = ref - s.startedAt - s.totalPausedMs;
  return Math.min(s.durationMs, Math.max(0, s.durationMs - elapsed));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/examTimer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/examTimer.ts src/lib/examTimer.test.ts
git commit -m "feat: remainingMs — clock-skew-proof exam countdown (pure + clamped)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A3: Wire the clock-skew-proof timer into the exam screen

**Files:** Modify `src/App.tsx` (the exam screen component — the hydrate effect ~lines 3316-3346 and `timeLeftMs` ~lines 3242-3246).

- [ ] **Step 1: Add the import**

Near the other `./lib/...` imports at the top of `src/App.tsx`, add:
```ts
import { remainingMs } from './lib/examTimer';
```

- [ ] **Step 2: Replace `timeLeftMs`**

Current:
```ts
  const timeLeftMs = useMemo(() => {
    const timeRef = session.pausedAt || now;
    const elapsed = timeRef - session.startedAt - session.totalPausedMs;
    return Math.max(0, session.durationMs - elapsed);
  }, [session, now]);
```
Replace with:
```ts
  const timeLeftMs = useMemo(
    () =>
      remainingMs(
        {
          startedAt: session.startedAt,
          durationMs: session.durationMs,
          totalPausedMs: session.totalPausedMs,
          pausedAt: session.pausedAt,
        },
        now
      ),
    [session, now]
  );
```

- [ ] **Step 3: Rework the hydrate effect to use `elapsed_ms`**

Current hydrate effect body:
```ts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let serverStart = Date.now();
      let serverPaused = 0;
      try {
        const row = await apiPost<{ started_at: string; total_paused_ms: number }>(
          `/api/sessions/${sessionId}/resume`,
          {}
        );
        if (cancelled) return;
        serverStart = new Date(row.started_at).getTime();
        serverPaused = row.total_paused_ms ?? 0;
      } catch (e) {
        // Network hiccup: fall back to client time so the user can still play.
        console.error('resume session failed', e);
      }
      if (cancelled) return;
      setSession((prev) => ({
        ...prev,
        startedAt: serverStart,
        totalPausedMs: serverPaused,
        pausedAt: null,
      }));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
```
Replace with:
```ts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let elapsedMs = 0;
      try {
        const row = await apiPost<{ elapsed_ms: number }>(
          `/api/sessions/${sessionId}/resume`,
          {}
        );
        if (cancelled) return;
        elapsedMs = Math.max(0, row.elapsed_ms ?? 0);
      } catch (e) {
        // Network hiccup: fall back to a fresh start so the user can still play.
        console.error('resume session failed', e);
      }
      if (cancelled) return;
      setSession((prev) => ({
        ...prev,
        // Client-clock virtual start: from here we only add client-measured
        // deltas, so a wrong client clock can't blow up the remaining time.
        startedAt: Date.now() - elapsedMs,
        totalPausedMs: 0,
        pausedAt: null,
      }));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
```

(`togglePause`, the auto-resume effect, and the `TimerSession` type are unchanged: `startedAt` is still a number, just now a client-clock virtual start; pauses accumulate into `totalPausedMs` as before, measured with the client clock.)

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Frontend hot-reloads. Start a practice session — the timer counts down normally from the configured duration. Pause/resume still works (timer freezes while paused). THE KEY CHECK: set the OS clock deliberately wrong (e.g. a day behind) and start a session — the timer must still show the correct remaining time (it no longer balloons to hundreds of hours). Reset the clock afterward.

- [ ] **Step 6: Commit**
```bash
git add src/App.tsx
git commit -m "fix: exam timer is immune to client clock skew (seed from server elapsed_ms)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task B1: Exam layout — input flows under the question

**Files:** Modify `src/App.tsx` (the "Question Arena" — scroll zone ~3907, answer zone ~3954, nav buttons ~4046).

Today the arena card is `flex flex-col`: a `flex-1` scroll zone holding ONLY the prompt/diagram (so a short prompt leaves a big gap), then a `shrink-0` answer zone pinned above the nav bar. We move the answer INTO the scroll zone so it flows directly under the prompt; the blank falls to the bottom; only the nav bar stays pinned.

Make these FOUR edits (anchor on the exact strings):

- [ ] **Step 1: Un-pin the answer block (make it flow)**

Find:
```tsx
                  {/* Answer zone — pinned above the nav buttons */}
                  <div className="relative z-10 shrink-0 pt-2.5 border-t border-border-subtle">
```
Replace with:
```tsx
                  {/* Answer — flows directly under the question (not pinned) */}
                  <div className="relative z-10 mt-5">
```

- [ ] **Step 2: Move the scroll-zone close so it wraps the answer too**

The scroll zone opens at:
```tsx
                  {/* Scroll zone — ONLY the question text + diagrams scroll */}
                  <div className="relative z-10 flex-1 min-h-0 overflow-y-auto no-scrollbar py-2">
```
Currently it CLOSES right before the answer block. Two `</div>` lines appear together — the first closes the inner prompt/diagram grid, the second closes the scroll zone:
```tsx
                    </div>
                  </div>

                  {/* Answer — flows directly under the question (not pinned) */}
```
DELETE the second `</div>` (the scroll-zone close) from there, so it becomes:
```tsx
                    </div>

                  {/* Answer — flows directly under the question (not pinned) */}
```
Then add that `</div>` back AFTER the answer block closes. The answer block ends just before the nav-buttons row. Find:
```tsx
                      )}
                  </div>

                  <div className="flex items-center justify-between gap-3 shrink-0 pt-2.5 pb-0 border-t border-border-subtle relative z-10 bg-bg-surface">
```
Change to (insert one extra `</div>` to close the scroll zone after the answer block):
```tsx
                      )}
                  </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 shrink-0 pt-2.5 pb-0 border-t border-border-subtle relative z-10 bg-bg-surface">
```

Net effect: scroll zone (`flex-1`, scrolls) now contains BOTH the prompt/diagram grid and the answer block; the nav-buttons row (`shrink-0`, pinned, keeps its `border-t`) sits below as the only pinned element.

- [ ] **Step 3: Remove the inner scroll caps on MCQ options**

Find:
```tsx
                        <div className="grid grid-cols-1 gap-2.5 max-h-[40vh] overflow-y-auto no-scrollbar">
```
Replace with:
```tsx
                        <div className="grid grid-cols-1 gap-2.5">
```

- [ ] **Step 4: Remove the inner scroll caps on multi-input answers**

Find:
```tsx
                        <div className="space-y-3 max-h-[40vh] overflow-y-auto no-scrollbar pr-0.5">
```
Replace with:
```tsx
                        <div className="space-y-3 pr-0.5">
```

(The written-answer `AutoGrowTextarea` already grows; inside the scroll zone it now grows naturally and the whole zone scrolls if needed. The diagram column keeps its own `lg:sticky` behavior — unaffected.)

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: PASS. (If `tsc` reports a JSX nesting/tag mismatch, the `</div>` move in Step 2 is off by one — re-check that exactly one scroll-zone `</div>` was removed before the answer block and exactly one added after it.)

- [ ] **Step 6: Manual verification (visual)**

Frontend hot-reloads. In a practice session on a large screen:
- A SHORT MCQ/calc question: the prompt is at the top and the options/input sit **directly under it**, with empty space below and the Prev/Flag/Next bar pinned at the bottom — no big gap between prompt and answer.
- A LONG written question: the textarea grows to fill; little or no blank.
- A diagram question: prompt + diagram still render side-by-side on wide screens, with the answer below.
- Scrolling a very long question still works (prompt + answer scroll together; nav bar stays put).

- [ ] **Step 7: Commit**
```bash
git add src/App.tsx
git commit -m "feat: exam answer input flows directly under the question

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §4 timer clock-skew fix: server `elapsed_ms` (A1) + client-clock virtual start + clamped pure `remainingMs` (A2, A3). The remaining-time formula never subtracts a server timestamp from a client one. ✓
- §5 layout: answer flows under the prompt inside the scroll zone, blank below, only the nav bar pinned, long written answers grow, diagrams unaffected (B1). ✓

**Placeholder scan:** No TBD/TODO; every step shows real code/anchors. The Step 2 `</div>` move is described with exact surrounding strings + a lint-failure hint.

**Type consistency:** `remainingMs`/`TimerState` (A2) match the object passed in A3. `resumeSession` return type `SessionRow & { elapsed_ms: number }` (A1) matches the client's `{ elapsed_ms: number }` read (A3). `TimerSession` type unchanged — `startedAt` stays a `number`.

**Risk note:** B1 is the delicate edit (JSX brace matching). Execute it carefully and rely on `npm run lint` to catch any tag mismatch before committing.
