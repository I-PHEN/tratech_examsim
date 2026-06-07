# SolveX landing page (signed-out marketing + auth entry)

Date: 2026-06-07
Branch: (current) `feat/question-time-estimation` or a fresh branch off `main`

## Problem

Signed-out users currently land straight on the auth form (`OnboardingScreen`,
rendered by `ProtectedApp` when `!currentUser`). There is no marketing page to
explain what SolveX is or convince a first-time visitor it's a real product. We
want a bold landing page that positions SolveX as **"the biggest question hub for
KNUST students"** (vision), **starting with Chemical Engineering** (honest
present scope), and routes visitors into the existing auth screen.

## Goals

- A landing page that loads first for signed-out visitors, communicates the
  vision + real features, and drives sign-up.
- "Start for free" / "Sign in" CTAs lead into the existing auth screen.
- On mobile, the auth screen is just the form (no split / branding column).
- Match the app exactly: real theme tokens, the in-app `Logo` (∫X), brand
  written **"SolveX"**.
- A lightweight, looping animation showing a typical flow; subtle scroll reveals.
- No fabricated content (no fake testimonials, stats, or course breadth) — per
  the project's no-mock-data rule.

Non-goals: blog/pricing/about pages; SEO/SSR; analytics tracking; routing/URL
changes; any change to the authentication logic itself.

## Architecture

### Entry wiring (`src/main.tsx` → `ProtectedApp`)

`ProtectedApp` keeps all existing gates (loading → `!currentUser` → email-verify →
profile-setup → `App`). The only change: the `!currentUser` branch renders a new
`<SignedOutFlow />` instead of `<OnboardingScreen />` directly.

`SignedOutFlow` (new component) owns local UI state:

```ts
type View = 'landing' | 'auth';
type AuthMode = 'login' | 'signup';
```

- Default `view = 'landing'` → renders `<LandingScreen onStart={...} onSignIn={...} />`.
- `onStart` → `setView('auth'); setAuthMode('signup')`.
- `onSignIn` → `setView('auth'); setAuthMode('login')`.
- `view === 'auth'` → renders `<OnboardingScreen initialMode={authMode} onBack={() => setView('landing')} />`.

No router changes (keeps the existing `/` + `/admin` routes and all auth gates
intact). Refreshing returns to the landing — acceptable for a signed-out shell.

### New: `src/components/landing/LandingScreen.tsx`

A self-contained signed-out marketing page. Props: `{ onStart: () => void; onSignIn: () => void }`. Uses the app's Tailwind tokens (`bg-bg-page`, `text-text-primary`, `accent`, etc.), the `Logo` component, Fraunces (`font-display`) for headings, Inter for body. Composed of small section subcomponents kept in the same file (or a `landing/` folder if it grows): `LandingNav`, `Hero`, `FlowDemo`, `Features`, `FinalCta`, `LandingFooter`.

Sections:
1. **LandingNav** — `Logo` + "SolveX"; right side: "Sign in" (ghost → `onSignIn`) and "Start for free" (primary → `onStart`).
2. **Hero** — badge `#TNBT · Starting with Chemical Engineering`; headline *"The biggest question hub for KNUST students."* (`font-display` italic, accent on "question hub"); motto *"Solve more. Stress less."*; one-line subhead mentioning Chemical Engineering + "brings the next set to you"; dual CTAs; an exam-arena **preview card** (static mock built from real UI primitives — prompt lines, options, Q-count + timer chip). The preview uses placeholder shapes, NOT real question data.
3. **FlowDemo ("See how it works")** — a looping, CSS-only 4-frame cross-fade: **Pick** (course → topic) → **Solve** (answer under timer) → **Review** (score + weak-topic bars) → **Schedule** (SolveX brings the next set). A step rail (4 dots) tracks the active frame. Pure CSS `@keyframes` with staggered `animation-delay`; no JS, no library.
4. **Features** — 6 cards, real capabilities only: Topic practice · Full mock exams · Diagnostics · AI-graded answers · **Scheduled practice — brings questions to you** · Progress analytics. Each: icon (lucide), title, one-line description.
5. **FinalCta** — #TNBT badge + "Normalize solving. Start with Chemical Engineering." + "Start for free" → `onStart`.
6. **LandingFooter** — `Logo` + "SolveX", "© 2026 · Built for KNUST · #TNBT".

### `OnboardingScreen` changes (`src/OnboardingScreen.tsx`)

Additive, backward-compatible:
- New optional props: `initialMode?: 'login' | 'signup'` (defaults to `'login'`, used to seed `isLogin`) and `onBack?: () => void`.
- When `onBack` is provided, render a small "← Back" affordance (top-left) that calls it.
- **Mobile = form only:** the left branding column is hidden on small screens (`hidden lg:flex`) instead of stacking on top. The form column shows the `Logo` + "SolveX" at the top on mobile so brand is still present. (Today the branding block stacks above the form on mobile; we change it to desktop-only.)
- The auth logic (Firebase email/password, Google, reset, verify) is unchanged.

### Animation policy

- CSS only (`@keyframes`, transitions). No `framer-motion` or similar.
- The FlowDemo loops continuously. Section reveal-on-scroll via a tiny
  `IntersectionObserver` hook (`useReveal`) that toggles a CSS class, OR pure CSS
  if simpler.
- Wrap non-essential animation in `@media (prefers-reduced-motion: reduce)` so it
  is disabled for users who request reduced motion (FlowDemo shows its first/last
  frame statically; reveals are instant).

## Components & responsibilities

| Unit | Does | Depends on |
|---|---|---|
| `SignedOutFlow` | Toggles landing ↔ auth, holds auth mode | `LandingScreen`, `OnboardingScreen` |
| `LandingScreen` | Renders the marketing page; emits `onStart`/`onSignIn` | `Logo`, Tailwind tokens, lucide |
| `FlowDemo` | CSS-looping flow animation | none (self-contained) |
| `useReveal` (optional) | Reveal-on-scroll class toggling | `IntersectionObserver` |
| `OnboardingScreen` (edit) | Auth; optional initial mode + back; mobile form-only | Firebase (unchanged) |

## Testing / verification

- `npm run lint` clean (TS truth).
- No backend change → no server restart needed; frontend hot-reloads.
- Manual:
  - Signed-out: landing shows first; "Start for free" → auth in **signup**; "Sign in" → auth in **login**; "← Back" returns to landing.
  - The auth flow still works (email/password, Google, verify, profile-setup, into `App`) and signed-in users never see the landing.
  - Mobile width: auth screen shows **only** the form (logo + form), no branding column; landing is responsive (hero stacks, features go 1–2 columns, FlowDemo still loops).
  - `prefers-reduced-motion: reduce`: the FlowDemo and reveals don't animate.
- No automated tests for the pure-presentational landing (consistent with the
  codebase, which doesn't unit-test layout components). If a non-trivial pure
  helper emerges (e.g. `useReveal`), it can get a small test.

## Out of scope / future

- Adding more KNUST courses/programmes (the page says "starting with Chemical
  Engineering" precisely because that's the current real scope).
- Shareable `/login` URL, SEO/meta, testimonials/real usage stats (add only when
  real data exists).
