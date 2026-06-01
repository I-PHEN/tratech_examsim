# UI & Admin Improvements — Design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)

Six independent improvements, bundled into one spec but executed one at a time with a
manual-test gate between each. Suggested order (safest UI fixes first, backend-touching
features last): **6 → 1 → 3 → 2 → 4 → 5**.

---

## 1. Focused review — only the solution scrolls

**Problem:** In the side-by-side review the whole page scrolls, so scrolling to read the
worked solution pushes the question and the student's answer out of view.

**Where:** `ReviewFocusModal` / `ReviewQuestionDetail` in [src/App.tsx](../../../src/App.tsx)
(`split` branch, currently `grid grid-cols-1 lg:grid-cols-2 ... items-start`, ~line 2427).

**Design (wide screens, `lg+`):** two panes inside the fixed-height modal `main`.
- **Left pane** — question + shared stem + diagram. Own bounded scroll; effectively held in view.
- **Right pane** — a flex column with three regions:
  - **Answer** — pinned at top (`shrink-0`). The answer-comparison block (MCQ options /
    written / multi-field) + examiner feedback + the correct answer.
  - **Step-by-step solution** — the worked solution (`it.explanation`); the **only**
    scrolling region (`flex-1 min-h-0 overflow-y-auto`).
  - **Ask Jude** — pinned at bottom (`shrink-0`). A persistent button that opens today's
    existing `JudePanel` pop-out. Jude stays a pop-out; we are **not** embedding the chat
    inline.

**Rename:** "Model Answer" → "Answer" everywhere in the review (written branch ~line 2340,
input branch ~line 2398, and the multi-field "Model" column header ~line 2351).

**Mobile / small screens:** unchanged — stacked single scroll (question → answer → solution).

**Edge case:** for long written answers + long examiner feedback the pinned top region can
grow tall. Cap its height (e.g. `max-h-[40%]` with its own overflow) so the solution always
keeps a usable scroll area.

---

## 2. Shrink the top bars; move academic selectors into Settings

### 2a. Student header
**Where:** header at [src/App.tsx](../../../src/App.tsx) ~line 990 (`h-20`), Year/Semester
selects ~lines 1007–1060, hardcoded "Department of Chemical Engineering" ~line 1062.

**Design:**
- Header height `h-20` → ~`h-12`.
- Remove the Year/Semester selects and the Department label from the header.
- Left side keeps the menu/back button + a **read-only context chip** "Year 3 · Sem 1" that
  navigates to Settings → Academics on tap. Right side keeps `ThemeToggle` + `NotificationsBell`.
- Year/Semester still drive `state.year` / `state.semester` and the `/api/program-courses`
  fetch exactly as today; only the control's *location* moves.

### 2b. Settings → Academics
**Where:** [src/components/SettingsScreen.tsx](../../../src/components/SettingsScreen.tsx).

**Design:** add an **Academics** section (new sidebar tab, peer of Account/Preferences/
Notifications). Contains:
- **Year** selector (Year 1–4) and **Semester** selector (Sem 1–2) — reuse the existing
  `persistYearSemester` Firestore write so the change propagates to the dashboard.
- **Department** — a fixed label for now (no functional selector; course filtering keys off
  Year + Semester only). Revisit if real department scoping is wanted later.

### 2c. Admin console header
**Where:** [src/Admin.tsx](../../../src/Admin.tsx) `AdminDashboardScreen` header ~line 132 (`h-20`).

**Design:** slim header ~`h-12`: back arrow + small "Question Engine" title only. Drop the
large `Database` icon and the "Admin Console" subtitle. Tab row stays below, unchanged.

---

## 3. Exam diagram display

**Problem:** Diagram sits in a cramped ~400px side column (`max-h-50vh`), so detailed
diagrams look small.

**Where:** exam question arena [src/App.tsx](../../../src/App.tsx) ~lines 3590–3631
(`lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]`).

**Design (chosen: wider side-by-side + clear zoom affordance):**
- Widen the diagram column (e.g. `minmax(0,1fr)_minmax(0,520px)` or a ~45% share) and raise
  `max-h` so it's bigger by default while question + answer stay visible.
- Add an explicit "tap to enlarge" badge/hint over the diagram so students discover the
  existing full-screen lightbox (`setLightboxSrc`, ~line 3337). Lightbox behaviour unchanged.

**Tables:** No work needed. `RichText` already renders GFM tables via `remark-gfm` with styled
`table`/`th`/`td` and horizontal scroll ([src/components/ui/RichText.tsx](../../../src/components/ui/RichText.tsx#L198-L206)).
Markdown tables in prompts/options/solutions already render. (Documented here for reference.)

---

## 4. Tiered admin access (Owner / Editor)

**Problem:** Admin is binary today — every admin can promote other admins and delete
curriculum. We're granting access to helpers who should not have that power.

**Current model:** [backend/lib/auth.ts](../../../backend/lib/auth.ts) — `requireAdmin` passes if
email ∈ `ADMIN_EMAILS` **or** a doc exists at `admins/{uid}`. Frontend `isAdmin` =
`admins/{uid}` doc exists ([src/lib/AuthContext.tsx](../../../src/lib/AuthContext.tsx)).

**Design — two tiers:**
- **Owner** — the four project builders. Defined by `ADMIN_EMAILS` (all four emails seeded
  there, all treated as Owner) **or** an `admins/{uid}` doc with `role: 'owner'`. Full access.
- **Editor** — the **default** role for any account granted through the UI. Day-to-day content
  work only.

**Capability matrix:**

| Capability | Owner | Editor |
|---|---|---|
| Ingestion (upload, run pipeline, publish drafts) | ✓ | ✓ |
| Manual question entry | ✓ | ✓ |
| Library: create / edit questions | ✓ | ✓ |
| Library: **delete** questions | ✓ | ✗ |
| Curriculum: add / rename dept / course / topic | ✓ | ✓ |
| Curriculum: **delete** dept / course / program / topic | ✓ | ✗ |
| Manage Admins (grant / revoke / set role) | ✓ | ✗ |
| View user analytics (Topic 5) | ✓ | ✗ |

**Implementation:**
- Add `role: 'owner' | 'editor'` to the `admins/{uid}` doc. Backfill any existing docs to a
  deliberate value (existing admins were full admins → set them `'owner'`; new grants default
  `'editor'`).
- New `requireOwner` middleware (after `requireAdmin`) for Owner-only routes: Manage-Admins
  writes, curriculum **deletes**, question **deletes**, the analytics route.
- Expose role to the frontend: `useAuth()` gains `role` (or `isOwner`) read from the
  `admins/{uid}` doc. The bootstrap `ADMIN_EMAILS` owners must also resolve to `isOwner: true`
  client-side (a lightweight `/api/admin/me` endpoint, or include role in an existing payload).
- UI: hide the **Manage Admins** and **Users** tabs for Editors; hide/disable delete buttons in
  Library and Curriculum for Editors. Server is the real gate; UI hiding is cosmetic.
- "Manage Admins" tab gains: a role choice when granting (defaults Editor), a list of current
  admins with their role, and a **revoke** action. (Today it is add-only.)

**To provide at implementation time:** the three other builder/owner emails to seed into
`ADMIN_EMAILS` (the fourth, `iphhennom@gmail.com`, is already present).

---

## 5. User analytics — Owner-only "Users" tab

**Goal:** See who has signed up and how the app is being used, without cluttering the console.

**Where:** new tab in [src/Admin.tsx](../../../src/Admin.tsx), rendered only for Owners.

**Data:**
- **Roster source = Firebase Auth** (`admin.auth().listUsers()`): every account, with
  `creationTime`, `lastSignInTime`, `emailVerified`. Enrich each by uid with the Firestore
  `users` profile (preferredName, department, year, semester) where it exists.
- **Usage = Supabase**, aggregated per uid: number of sessions, number of answers, last
  activity timestamp. Joined onto the roster by uid.

**Backend:** `GET /api/admin/analytics/users` gated by `requireAuth` + `requireAdmin` +
`requireOwner`. Returns:
- **summary**: total users, new this week, active in last 7 days, total exams taken.
- **users[]**: `{ uid, email, name, department, year, semester, signedUpAt, lastSignInAt,
  emailVerified, sessionCount, answerCount, lastActiveAt }`.

**Frontend:** summary stat cards on top + a sortable table below. Read-only. No mock data —
empty/zero states are fine.

**Note:** `listUsers` paginates (1000/page). Fine for current scale; loop pages if it grows.

---

## 6. Navigator filter-pill count never wraps

**Problem:** In the exam Question Navigator, the "Unanswered" filter pill's count can drop onto
a second line in the narrow sidebar, making the pill taller and shifting the whole grid below.

**Where:** filter pills [src/App.tsx](../../../src/App.tsx) ~lines 3240–3260; three `flex-1`
buttons rendering `{label} {count}` with no nowrap. Secondary shift: the
"Every question is answered." line at ~line 3301 only renders at 0.

**Design:** keep label + count on one line in all states — add `whitespace-nowrap` and let the
text shrink/center rather than wrap (and/or tighten `tracking`). The count is always beside the
label; the navigator height is stable regardless of value. Confirm the exact reflow against the
running app during execution.

---

## Out of scope / deferred

- Real department scoping of courses (Topic 2 keeps Department as a label).
- Embedding the Jude chat inline in the review (Topic 1 keeps the pop-out).
- A third "Viewer" admin tier (Topic 4 is two tiers).
- Analytics charts/time-series beyond the summary cards (Topic 5 v1 is cards + table).
