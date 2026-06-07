# SolveX Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For the visual sections (Tasks 3–5), use the **frontend-design** skill to polish while preserving the structure, copy, props, and behavior specified here.

**Goal:** A bold signed-out landing page that positions SolveX as "the biggest question hub for KNUST students" (starting with Chemical Engineering), with a looping flow animation, real-feature sections, and CTAs that lead into the existing auth screen.

**Architecture:** `ProtectedApp`'s signed-out branch renders a new `SignedOutFlow` that toggles `landing ↔ auth` in local state (no router change; all auth gates intact). `LandingScreen` is a self-contained marketing page using the app's real Tailwind tokens, the `Logo` (∫X), `font-display` (Fraunces) headings, and lucide icons. `OnboardingScreen` gains an optional initial mode + back action and becomes form-only on mobile. Animations are CSS-only and honor `prefers-reduced-motion`.

**Tech Stack:** React 19, Tailwind 4 (token classes like `bg-bg-page`, `text-text-primary`, `accent`, `font-display`), lucide-react, `npm run lint` (`tsc --noEmit`). No backend changes.

**Verification:** Each task ends with `npm run lint` (zero errors; ignore IDE phantom JSX diagnostics) + a manual check. No unit tests (presentational; matches the codebase). Frontend hot-reloads — no server restart.

---

## File Structure

- **Create** `src/components/landing/LandingScreen.tsx` — the page + its section subcomponents (`LandingNav`, `Hero`, `FlowDemo`, `Features`, `FinalCta`, `LandingFooter`) co-located in one file.
- **Create** `src/components/landing/SignedOutFlow.tsx` — landing ↔ auth toggle.
- **Modify** `src/OnboardingScreen.tsx` — `initialMode` + `onBack` props; mobile form-only.
- **Modify** `src/main.tsx` — `ProtectedApp` renders `SignedOutFlow` when signed out.

Theme tokens available (from `src/index.css`): `bg-bg-page` `#121212`, `bg-bg-surface` `#1E1E1E`, `bg-bg-raised`, `accent`/`text-accent` `#7B8CFA`, `accent-text` `#A0ADFB`, `accent-muted`, `text-text-primary/secondary/tertiary`, `border-border-subtle/medium`, `success-text`. Fonts: `font-display` (Fraunces, use `italic`), `font-sans` (Inter). The `Logo` component (`src/components/ui/Logo.tsx`) renders the ∫X mark; size with `className="w-8 h-8"`.

---

### Task 1: `OnboardingScreen` — initial mode, back action, mobile form-only

**Files:** Modify `src/OnboardingScreen.tsx`.

- [ ] **Step 1: Add props**

Change the signature:
```tsx
export function OnboardingScreen() {
  const [isLogin, setIsLogin] = useState(true);
```
to:
```tsx
export function OnboardingScreen({
  initialMode = 'login',
  onBack,
}: {
  initialMode?: 'login' | 'signup';
  onBack?: () => void;
} = {}) {
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
```

- [ ] **Step 2: Make the branding column desktop-only**

The left branding column currently starts with `className="w-full lg:w-1/2 p-6 md:p-12 lg:p-20 flex flex-col justify-center lg:justify-between bg-surface-dim border-b lg:border-b-0 lg:border-r border-border-subtle relative overflow-hidden min-h-[30vh] lg:min-h-screen shrink-0"`. Change the leading `w-full ... flex` so it is hidden on mobile: replace `w-full lg:w-1/2` with `hidden lg:flex lg:w-1/2` (and drop the now-irrelevant `min-h-[30vh]` / `border-b`):
```tsx
      <div className="hidden lg:flex lg:w-1/2 p-6 md:p-12 lg:p-20 flex-col justify-center lg:justify-between bg-surface-dim lg:border-r border-border-subtle relative overflow-hidden lg:min-h-screen shrink-0">
```
Inside it, there is a mobile-only logo block (`flex lg:hidden ...`) — since the whole column is now desktop-only, that mobile block is dead; leave it (harmless) or remove it. Prefer removing the `<div className="flex lg:hidden items-center gap-3 mb-4">…</div>` block to avoid confusion.

- [ ] **Step 3: Add a mobile brand header + optional Back to the form column**

The form column is `<div className="w-full lg:flex-1 ... flex flex-col justify-center items-center ...">` containing `<div className="w-full max-w-sm space-y-8">`. Inside that inner `max-w-sm` wrapper, BEFORE the existing `<div className="text-center space-y-2">`, add a mobile-only brand + an optional back button:
```tsx
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowRight className="w-3 h-3 rotate-180" /> Back
              </button>
            )}
            <div className="flex lg:hidden items-center gap-2 justify-center">
              <Logo className="w-8 h-8 shrink-0" />
              <span className="text-sm font-bold text-text-primary uppercase tracking-wider">SolveX</span>
            </div>
```
(`Logo` and `ArrowRight` are already imported in this file.)

- [ ] **Step 4: Type-check + manual**

Run `npm run lint` → PASS. Manual: at desktop width the two-column auth is unchanged; at mobile width only the form shows (with the SolveX logo on top); if `onBack` is passed, a "← Back" control appears.

- [ ] **Step 5: Commit**
```bash
git add src/OnboardingScreen.tsx
git commit -m "feat: OnboardingScreen accepts initial mode + back; mobile shows form only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `SignedOutFlow` + wire into `ProtectedApp`

**Files:** Create `src/components/landing/SignedOutFlow.tsx`; modify `src/main.tsx`.

- [ ] **Step 1: Create `SignedOutFlow.tsx`**

```tsx
import { useState } from 'react';
import { OnboardingScreen } from '../../OnboardingScreen';
import { LandingScreen } from './LandingScreen';

type View = 'landing' | 'auth';
type AuthMode = 'login' | 'signup';

/**
 * Signed-out shell: shows the marketing landing first, then the auth screen when
 * the visitor chooses to sign in or start. All real auth lives in OnboardingScreen.
 */
export function SignedOutFlow() {
  const [view, setView] = useState<View>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  if (view === 'auth') {
    return <OnboardingScreen initialMode={authMode} onBack={() => setView('landing')} />;
  }
  return (
    <LandingScreen
      onStart={() => {
        setAuthMode('signup');
        setView('auth');
      }}
      onSignIn={() => {
        setAuthMode('login');
        setView('auth');
      }}
    />
  );
}
```

- [ ] **Step 2: Render it in `ProtectedApp`**

In `src/main.tsx`, replace the import of `OnboardingScreen` usage in `ProtectedApp`. Add an import:
```tsx
import { SignedOutFlow } from './components/landing/SignedOutFlow';
```
Then in `ProtectedApp`, change:
```tsx
  if (!currentUser) {
    return <OnboardingScreen />;
  }
```
to:
```tsx
  if (!currentUser) {
    return <SignedOutFlow />;
  }
```
(The direct `OnboardingScreen` import in `main.tsx` becomes unused — remove it from `main.tsx`'s imports to keep lint clean. `OnboardingScreen` is still imported by `SignedOutFlow`.)

- [ ] **Step 3: Type-check + manual**

`npm run lint` → PASS (no unused imports). Manual: signed-out now shows the landing; clicking a CTA shows auth with the right mode + a Back control; Back returns to landing; signing in proceeds into the app as before.

- [ ] **Step 4: Commit**
```bash
git add src/components/landing/SignedOutFlow.tsx src/main.tsx
git commit -m "feat: SignedOutFlow — landing first, then auth (signup/login)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `LandingScreen` shell — Nav + Hero

**Files:** Create `src/components/landing/LandingScreen.tsx`.

> Use the **frontend-design** skill to polish spacing/visuals, but keep the props, copy, structure, tokens, and the `Logo`/icons specified here. Match the approved mockup (indigo-on-near-black, `font-display` italic headline, exam-arena preview on the right at `lg`, stacked on mobile).

- [ ] **Step 1: Create the file with the page shell, `LandingNav`, and `Hero`**

```tsx
import { Logo } from '../ui/Logo';
import {
  ArrowRight, Target, FileText, Stethoscope, Bot, CalendarClock, BarChart3,
} from 'lucide-react';

export function LandingScreen({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-bg-page text-text-primary font-sans overflow-x-hidden">
      <LandingNav onStart={onStart} onSignIn={onSignIn} />
      <Hero onStart={onStart} onSignIn={onSignIn} />
      {/* Task 4 inserts <FlowDemo /> here */}
      {/* Task 5 inserts <Features />, <FinalCta />, <LandingFooter /> here */}
    </div>
  );
}

function LandingNav({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <header className="sticky top-0 z-50 h-16 flex items-center justify-between px-5 md:px-10 border-b border-border-subtle bg-bg-page/80 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <Logo className="w-8 h-8 shrink-0" />
        <span className="text-base font-bold tracking-tight">SolveX</span>
      </div>
      <div className="flex items-center gap-2.5">
        <button onClick={onSignIn} className="px-4 py-2 rounded-xl border border-border-medium text-xs font-bold uppercase tracking-wide text-text-primary hover:bg-bg-raised transition-colors">
          Sign in
        </button>
        <button onClick={onStart} className="px-4 py-2 rounded-xl bg-accent text-bg-page text-xs font-bold uppercase tracking-wide hover:bg-accent-hover transition-colors">
          Start for free
        </button>
      </div>
    </header>
  );
}

function Hero({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <section className="relative overflow-hidden px-5 md:px-10 py-16 md:py-24">
      <div className="absolute -z-0 w-[36rem] h-[36rem] rounded-full bg-accent/15 blur-[120px] -bottom-60 -left-40 pointer-events-none" />
      <div className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div>
          <span className="inline-flex items-center gap-2 text-[10px] md:text-xs font-bold uppercase tracking-[0.12em] text-accent-text bg-accent-muted border border-accent/30 rounded-full px-3 py-1.5">
            ★ #TNBT · Starting with Chemical Engineering
          </span>
          <h1 className="mt-5 font-display italic font-bold leading-[1.05] tracking-tight text-4xl md:text-6xl">
            The biggest <span className="text-accent-text">question hub</span> for KNUST students.
          </h1>
          <p className="mt-3 font-display italic text-lg md:text-xl text-accent-text">Solve more. Stress less.</p>
          <p className="mt-4 text-sm md:text-base text-text-secondary leading-relaxed max-w-md">
            Practice past questions, sit full mock exams, and let SolveX bring the next set to you — starting with Chemical Engineering.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={onStart} className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent text-bg-page text-sm font-bold uppercase tracking-wide hover:bg-accent-hover transition-all hover:scale-[1.02] active:scale-95">
              Start for free <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={onSignIn} className="px-6 py-3 rounded-2xl border border-border-medium text-sm font-bold uppercase tracking-wide text-text-primary hover:bg-bg-raised transition-colors">
              Sign in
            </button>
          </div>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

/** Static exam-arena preview built from UI primitives — NOT real question data. */
function HeroPreview() {
  return (
    <div className="rounded-3xl border border-border-subtle bg-bg-surface p-4 md:p-5 shadow-2xl">
      <div className="text-[9px] uppercase tracking-[0.16em] text-text-tertiary mb-3">Reactor Design · Practice</div>
      <div className="h-2.5 rounded bg-bg-raised w-[92%] mb-2" />
      <div className="h-2.5 rounded bg-bg-raised w-[74%] mb-5" />
      <div className="flex flex-col gap-2.5">
        <div className="h-9 rounded-lg bg-accent/15 border border-accent/40" />
        <div className="h-9 rounded-lg bg-bg-raised" />
        <div className="h-9 rounded-lg bg-bg-raised" />
      </div>
      <div className="flex justify-between mt-5 text-[9px] uppercase tracking-[0.16em] text-text-tertiary">
        <span>Q3 / 10</span><span className="text-accent-text">19:54</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + manual**

`npm run lint` → PASS. Manual: signed-out landing shows nav + hero; both CTAs route to auth (signup from "Start for free", login from "Sign in"); responsive (hero stacks on mobile, preview below).

- [ ] **Step 3: Commit**
```bash
git add src/components/landing/LandingScreen.tsx
git commit -m "feat: LandingScreen shell — nav + hero with exam-arena preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `FlowDemo` — looping CSS flow animation

**Files:** Modify `src/components/landing/LandingScreen.tsx` (add `FlowDemo`, render it after `<Hero/>`).

The animation is pure CSS (no JS, no library). Four frames cross-fade on a 12s loop (3s each). Use a `<style>` tag inside the component for the `@keyframes` (scoped class names prefixed `sx-`), guarded by `prefers-reduced-motion`.

- [ ] **Step 1: Add `FlowDemo` and render it**

In `LandingScreen`, replace `{/* Task 4 inserts <FlowDemo /> here */}` with `<FlowDemo />`. Add:

```tsx
function FlowDemo() {
  const frames = [
    { n: 1, tag: 'Pick', label: 'Chemical Engineering → Reactor Design' },
    { n: 2, tag: 'Solve', label: 'Answer under a live timer' },
    { n: 3, tag: 'Review', label: 'See your score & weak topics' },
    { n: 4, tag: 'Schedule', label: 'SolveX brings the next set to you' },
  ];
  return (
    <section className="px-5 md:px-10 py-14 border-t border-border-subtle">
      <style>{`
        @keyframes sxcyc { 0%{opacity:0;transform:translateY(8px)} 4%,21%{opacity:1;transform:translateY(0)} 25%,100%{opacity:0;transform:translateY(-8px)} }
        .sx-frame{opacity:0;animation:sxcyc 12s infinite}
        .sx-frame:nth-child(1){animation-delay:0s}
        .sx-frame:nth-child(2){animation-delay:3s}
        .sx-frame:nth-child(3){animation-delay:6s}
        .sx-frame:nth-child(4){animation-delay:9s}
        @media (prefers-reduced-motion: reduce){
          .sx-frame{animation:none;opacity:0}
          .sx-frame:nth-child(1){opacity:1}
        }
      `}</style>
      <div className="max-w-6xl mx-auto">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary">See how it works ↺</span>
        <h2 className="mt-1.5 font-display italic font-bold text-2xl md:text-3xl">A typical flow, start to finish.</h2>
        <div className="relative mt-6 h-44 rounded-2xl border border-border-subtle bg-bg-surface overflow-hidden">
          {frames.map((f) => (
            <div key={f.n} className="sx-frame absolute inset-0 p-5">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold text-accent-text bg-accent-muted border border-accent/40 rounded-lg px-2.5 py-1">{f.n} · {f.tag}</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{f.label}</span>
              </div>
              <FlowFrameBody n={f.n} />
              <div className="absolute left-5 right-5 bottom-4 flex gap-1.5">
                {frames.map((d) => (
                  <span key={d.n} className={`h-1 flex-1 rounded-full ${d.n === f.n ? 'bg-accent' : 'bg-bg-raised'}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowFrameBody({ n }: { n: number }) {
  if (n === 1) return (
    <div className="mt-4 space-y-2"><div className="h-3.5 w-3/5 rounded bg-bg-raised" /><div className="h-3.5 w-2/5 rounded bg-bg-raised" /></div>
  );
  if (n === 2) return (
    <div className="mt-3 space-y-1.5"><div className="h-5 rounded-md bg-success-bg border border-success-border" /><div className="h-5 rounded-md bg-bg-raised" /><div className="h-5 rounded-md bg-bg-raised" /></div>
  );
  if (n === 3) return (
    <div className="mt-4 flex items-end gap-2 h-12">
      <div className="w-4 rounded bg-accent" style={{ height: '60%' }} />
      <div className="w-4 rounded bg-accent" style={{ height: '90%' }} />
      <div className="w-4 rounded bg-border-medium" style={{ height: '40%' }} />
      <div className="w-4 rounded bg-accent" style={{ height: '75%' }} />
    </div>
  );
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-accent-muted border border-accent/40" />
      <div className="space-y-1.5"><div className="h-3 w-32 rounded bg-bg-raised" /><div className="h-2.5 w-20 rounded bg-bg-raised" /></div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + manual**

`npm run lint` → PASS. Manual: the panel auto-cycles Pick → Solve → Review → Schedule with the dot rail tracking; with `prefers-reduced-motion: reduce` it shows only the first frame, no animation.

- [ ] **Step 3: Commit**
```bash
git add src/components/landing/LandingScreen.tsx
git commit -m "feat: FlowDemo — looping CSS walkthrough (reduced-motion safe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Features + Final CTA + Footer

**Files:** Modify `src/components/landing/LandingScreen.tsx` (add the three sections; render them after `<FlowDemo/>`).

- [ ] **Step 1: Add the sections and render them**

Replace `{/* Task 5 inserts ... here */}` with `<Features />`, `<FinalCta onStart={onStart} />`, `<LandingFooter />`. Pass `onStart` down (thread it from `LandingScreen` into the render). Add:

```tsx
const FEATURES = [
  { icon: Target, title: 'Topic practice', desc: 'Drill any Reactor Design / ChemEng topic, at your difficulty.' },
  { icon: FileText, title: 'Full mock exams', desc: 'Timed midsem & full papers under real conditions.' },
  { icon: Stethoscope, title: 'Diagnostics', desc: 'A spread across topics that pinpoints your weak spots.' },
  { icon: Bot, title: 'AI-graded answers', desc: 'Written & multi-part questions marked with partial credit + feedback.' },
  { icon: CalendarClock, title: 'Brings questions to you', desc: 'Schedule practice; SolveX reminds you and loads the set — solve later, on time.' },
  { icon: BarChart3, title: 'Progress analytics', desc: 'Accuracy by topic, history, and mastery over time.' },
] as const;

function Features() {
  return (
    <section className="px-5 md:px-10 py-16 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary">Everything in one place</span>
        <h2 className="mt-1.5 font-display italic font-bold text-2xl md:text-3xl">Not just past questions — a full practice engine.</h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border-subtle bg-bg-surface p-5 hover:border-border-medium transition-colors">
              <div className="w-10 h-10 rounded-xl bg-accent-muted border border-accent/30 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-sm font-bold text-text-primary">{f.title}</h3>
              <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden px-5 md:px-10 py-20 border-t border-border-subtle text-center">
      <div className="absolute -z-0 w-[28rem] h-[28rem] rounded-full bg-accent/15 blur-[120px] -top-40 left-1/2 -translate-x-1/2 pointer-events-none" />
      <div className="relative z-10 max-w-2xl mx-auto">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent-text bg-accent-muted border border-accent/30 rounded-full px-3 py-1.5">★ #TNBT</span>
        <h2 className="mt-5 font-display italic font-bold text-3xl md:text-4xl leading-tight">Normalize solving. Start with Chemical Engineering.</h2>
        <div className="mt-8">
          <button onClick={onStart} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-accent text-bg-page text-sm font-bold uppercase tracking-wide hover:bg-accent-hover transition-all hover:scale-[1.02] active:scale-95">
            Start for free <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="px-5 md:px-10 py-8 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Logo className="w-6 h-6" /><span className="text-sm font-bold">SolveX</span></div>
      <span className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">© 2026 · Built for KNUST · #TNBT</span>
    </footer>
  );
}
```

Update `LandingScreen`'s body to pass `onStart` to `FinalCta`:
```tsx
      <FlowDemo />
      <Features />
      <FinalCta onStart={onStart} />
      <LandingFooter />
```

- [ ] **Step 2: Type-check + manual**

`npm run lint` → PASS. Manual: features grid (1/2/3 cols by width), final CTA → auth signup, footer present. Whole page scrolls cleanly on mobile + desktop.

- [ ] **Step 3: Commit**
```bash
git add src/components/landing/LandingScreen.tsx
git commit -m "feat: landing features, final CTA, footer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Reveal-on-scroll polish + full pass

**Files:** Modify `src/components/landing/LandingScreen.tsx` (optional reveal hook).

- [ ] **Step 1: Add a minimal reveal-on-scroll hook (optional, motion-safe)**

```tsx
import { useEffect, useRef, useState } from 'react';

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !ref.current) { setShown(true); return; }
    const el = ref.current;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}
```

Apply it to the `Features` and `FinalCta` section wrappers: attach `ref` and a class that animates in, e.g. `className={cn('transition-all duration-700', shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}` (import `cn` from `../../lib/utils`). Keep it subtle. Hero is above the fold — leave it visible immediately.

- [ ] **Step 2: Final manual QA pass**

Run `npm run lint` → PASS. Then verify the whole flow end-to-end:
- Signed out → landing first; "Start for free" → auth **signup**; "Sign in" → auth **login**; "← Back" → landing.
- Real auth still works through to the app; signed-in users never see the landing.
- Mobile: auth = form only; landing responsive; FlowDemo loops.
- `prefers-reduced-motion: reduce`: FlowDemo static (first frame), reveals instant.
- Brand reads "SolveX" with the ∫X logo throughout; copy says "starting with Chemical Engineering"; no fabricated stats/testimonials.

- [ ] **Step 3: Commit**
```bash
git add src/components/landing/LandingScreen.tsx
git commit -m "feat: subtle reveal-on-scroll on landing sections (reduced-motion safe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Landing-first for signed-out + CTAs into auth (signup/login) → Tasks 2, 3. ✓
- Mobile auth = form only → Task 1. ✓
- Real theme/Logo/SolveX casing, hero with #TNBT + ChemEng + motto + preview → Task 3. ✓
- Looping CSS flow demo incl. scheduling beat, reduced-motion safe → Task 4. ✓
- Real-feature sections incl. "brings questions to you", final CTA, footer → Task 5. ✓
- Reveal-on-scroll polish, motion-safe → Task 6. ✓
- No backend/router/auth-logic changes; no fabricated content. ✓

**Placeholder scan:** All code is concrete (real copy, tokens, icons, keyframes). The only adaptive note is "use frontend-design to polish" — structure/props/behavior are fully specified, so polish won't change contracts.

**Type consistency:** `OnboardingScreen({ initialMode, onBack })` (Task 1) matches `SignedOutFlow`'s usage (Task 2). `LandingScreen({ onStart, onSignIn })` matches `SignedOutFlow` and is threaded to `FinalCta({ onStart })` (Task 5). lucide icons imported in Task 3/5 exist in `lucide-react`.

**Note:** `OnboardingScreen` previously took no props and is rendered only via `SignedOutFlow` now; the default param (`= {}`) keeps it safe if rendered without props.
