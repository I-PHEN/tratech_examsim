# Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the landing page hero to sell SolveX's complete KNUST question bank (past papers + reference books), Jude the AI tutor, and scheduled practice — with polished CSS animations.

**Architecture:** All changes are in one file: `src/components/landing/LandingScreen.tsx`. The `Hero` component owns the copy and the inline `<style>` block. The `HeroPreview` component owns the floating card mockup. No backend changes, no new files.

**Tech Stack:** React 19, Tailwind 4, CSS keyframe animations (no JS library), lucide-react icons, TypeScript. Verification via `npm run lint` (PowerShell).

---

## Files

| File | Action |
|------|--------|
| `src/components/landing/LandingScreen.tsx` | Modify — three areas: `<style>` block (new keyframes), `Hero` copy, `HeroPreview` visual |

---

### Task 1: Add new CSS keyframes and animation classes

**Files:**
- Modify: `src/components/landing/LandingScreen.tsx:77-87` (the `<style>` block inside `Hero`)

The existing style block is at lines 77–87. Replace it entirely with the expanded version below.

- [ ] **Step 1: Replace the `<style>` block in the `Hero` function**

Find this exact block (around line 77):

```tsx
      <style>{`
        @keyframes sxrise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sxfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes sxchipA{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes sxchipB{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
        .sx-rise{opacity:0;animation:sxrise .7s cubic-bezier(.22,1,.36,1) forwards}
        .sx-float{animation:sxfloat 6s ease-in-out infinite}
        .sx-chipA{animation:sxchipA 4.5s ease-in-out infinite}
        .sx-chipB{animation:sxchipB 5.5s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.sx-rise,.sx-float,.sx-chipA,.sx-chipB{animation:none;opacity:1}}
      `}</style>
```

Replace with:

```tsx
      <style>{`
        @keyframes sxrise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sxfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes sxchipA{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes sxchipB{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
        @keyframes sxchipC{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes sxgradshift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes sxbadgepulse{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 16px 4px color-mix(in srgb,var(--accent) 20%,transparent)}}
        @keyframes sxgridpan{from{background-position:0px 0px}to{background-position:48px 48px}}
        @keyframes sxglowbreathe{0%,100%{opacity:0.15;transform:scale(1)}50%{opacity:0.22;transform:scale(1.07)}}
        @keyframes sxproofslide{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        .sx-rise{opacity:0;animation:sxrise .7s cubic-bezier(.22,1,.36,1) forwards}
        .sx-float{animation:sxfloat 6s ease-in-out infinite}
        .sx-chipA{animation:sxchipA 4.5s ease-in-out infinite}
        .sx-chipB{animation:sxchipB 5.5s ease-in-out infinite}
        .sx-chipC{animation:sxchipC 3.8s ease-in-out infinite}
        .sx-gradshift{animation:sxgradshift 6s ease infinite}
        .sx-badgepulse{animation:sxbadgepulse 4s ease-in-out infinite}
        .sx-gridpan{animation:sxgridpan 20s linear infinite}
        .sx-glowbreathe{animation:sxglowbreathe 8s ease-in-out infinite}
        .sx-proofslide{opacity:0;animation:sxproofslide .5s cubic-bezier(.22,1,.36,1) forwards}
        @media (prefers-reduced-motion:reduce){.sx-rise,.sx-float,.sx-chipA,.sx-chipB,.sx-chipC,.sx-gradshift,.sx-badgepulse,.sx-gridpan,.sx-glowbreathe,.sx-proofslide{animation:none!important;opacity:1!important}}
      `}</style>
```

- [ ] **Step 2: Verify lint passes**

```powershell
npm run lint
```

Expected: no errors.

---

### Task 2: Update Hero copy — badge, headline, body, proof bar

**Files:**
- Modify: `src/components/landing/LandingScreen.tsx` — `Hero` function, copy section

Also add `BookOpen` to the lucide-react import at the top of the file.

- [ ] **Step 1: Add `BookOpen` to the lucide-react import**

Find the import at the top of the file (line ~1):

```tsx
import {
  ArrowRight, Target, FileText, Stethoscope, Bot, CalendarClock, BarChart3, Bell,
  Sparkles, Check, Clock,
} from 'lucide-react';
```

Replace with:

```tsx
import {
  ArrowRight, Target, FileText, Stethoscope, Bot, CalendarClock, BarChart3, Bell,
  Sparkles, Check, Clock, BookOpen,
} from 'lucide-react';
```

- [ ] **Step 2: Apply animated glow breathe to the two accent blob divs**

Find the two glow `div`s in `Hero` (around line 90):

```tsx
      <div className="absolute z-0 w-[40rem] h-[40rem] rounded-full bg-accent/15 blur-[130px] -top-48 -right-40 pointer-events-none" />
      <div className="absolute z-0 w-[34rem] h-[34rem] rounded-full bg-accent/10 blur-[130px] -bottom-56 -left-48 pointer-events-none" />
```

Replace with:

```tsx
      <div className="sx-glowbreathe absolute z-0 w-[40rem] h-[40rem] rounded-full bg-accent/15 blur-[130px] -top-48 -right-40 pointer-events-none" />
      <div className="sx-glowbreathe absolute z-0 w-[34rem] h-[34rem] rounded-full bg-accent/10 blur-[130px] -bottom-56 -left-48 pointer-events-none" style={{ animationDelay: '4s', animationDirection: 'reverse' }} />
```

- [ ] **Step 3: Apply grid pan animation to the background grid div**

Find the grid background div (around line 92):

```tsx
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(var(--border-subtle) 1px,transparent 1px),linear-gradient(90deg,var(--border-subtle) 1px,transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 75% 60% at 50% 0%,#000 25%,transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 60% at 50% 0%,#000 25%,transparent 78%)',
        }}
      />
```

Replace with:

```tsx
      <div
        className="sx-gridpan absolute inset-0 z-0 pointer-events-none opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(var(--border-subtle) 1px,transparent 1px),linear-gradient(90deg,var(--border-subtle) 1px,transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 75% 60% at 50% 0%,#000 25%,transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 60% at 50% 0%,#000 25%,transparent 78%)',
        }}
      />
```

- [ ] **Step 4: Update the badge**

Find (around line 105):

```tsx
          <span className="sx-rise inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-muted px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text">
            <Sparkles className="w-3.5 h-3.5" /> Past questions · Mock exams · Scheduling
          </span>
```

Replace with:

```tsx
          <span className="sx-rise sx-badgepulse inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-muted px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text">
            <Sparkles className="w-3.5 h-3.5" /> Past questions · Reference books · Jude AI
          </span>
```

- [ ] **Step 5: Update the headline**

Find (around line 108):

```tsx
          <h1 className="sx-rise mt-5 font-display italic font-bold leading-[1.05] tracking-tight text-4xl md:text-6xl" style={{ animationDelay: '.08s' }}>
            The biggest{' '}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(120deg,var(--accent-text),var(--accent))' }}>
              question hub
            </span>{' '}
            for KNUST students.
          </h1>
```

Replace with:

```tsx
          <h1 className="sx-rise mt-5 font-display italic font-bold leading-[1.05] tracking-tight text-4xl md:text-6xl" style={{ animationDelay: '.08s' }}>
            The complete KNUST question bank —{' '}
            <span
              className="sx-gradshift bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(120deg,var(--accent-text),var(--accent),var(--accent-text))',
                backgroundSize: '300% 300%',
              }}
            >
              with a tutor built in.
            </span>
          </h1>
```

- [ ] **Step 6: Update the body copy**

Find (around line 118):

```tsx
          <p className="sx-rise mt-4 text-sm md:text-base text-text-secondary leading-relaxed max-w-md" style={{ animationDelay: '.24s' }}>
            Practice past questions, sit full mock exams, and let SolveX bring the next set to you.
          </p>
```

Replace with:

```tsx
          <p className="sx-rise mt-4 text-sm md:text-base text-text-secondary leading-relaxed max-w-md" style={{ animationDelay: '.24s' }}>
            Every past exam paper and reference book question, in one place.{' '}
            <strong className="text-text-primary font-semibold">Jude</strong> — our AI tutor — grades your answers,
            explains every question, and shows exactly where you're weak.
            Then schedules the next session before you forget.
          </p>
```

- [ ] **Step 7: Replace the social proof bar with 5 staggered items**

Find (around line 135):

```tsx
          <div className="sx-rise mt-9 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary" style={{ animationDelay: '.4s' }}>
            <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-accent-text" /> Live exam timer</span>
            <span className="inline-flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-accent-text" /> AI-graded answers</span>
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-accent-text" /> Scheduled practice</span>
          </div>
```

Replace with:

```tsx
          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            {([
              { Icon: FileText,     label: 'Past exam papers',    delay: '.40s' },
              { Icon: BookOpen,     label: 'Reference book Qs',   delay: '.53s' },
              { Icon: Bot,          label: 'Jude AI tutor',       delay: '.66s' },
              { Icon: Sparkles,     label: 'AI-graded answers',   delay: '.79s' },
              { Icon: CalendarClock,label: 'Scheduled practice',  delay: '.92s' },
            ] as const).map(({ Icon, label, delay }) => (
              <span
                key={label}
                className="sx-proofslide inline-flex items-center gap-1.5"
                style={{ animationDelay: delay }}
              >
                <Icon className="w-3.5 h-3.5 text-accent-text" /> {label}
              </span>
            ))}
          </div>
```

- [ ] **Step 8: Verify lint passes**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```powershell
git add src/components/landing/LandingScreen.tsx
git commit -m "feat: update hero copy and animations — Jude AI, reference books, animated headline"
```

---

### Task 3: Add Jude chip to HeroPreview

**Files:**
- Modify: `src/components/landing/LandingScreen.tsx` — `HeroPreview` function (around line 157)

- [ ] **Step 1: Add the Jude chip inside the `.sx-float` wrapper**

Find the `.sx-float` wrapper div in `HeroPreview` (around line 161). It currently contains the depth card, the main arena card, and two chips. Add the Jude chip as the first child inside `.sx-float`:

Find:

```tsx
        <div className="sx-float relative z-10">
          {/* card peeking behind for depth */}
          <div className="absolute inset-0 -right-5 -top-5 rounded-3xl border border-border-subtle bg-bg-surface/50 rotate-3 -z-10 hidden sm:block" />

          {/* main arena card */}
```

Replace with:

```tsx
        <div className="sx-float relative z-10">
          {/* Jude chip — top right, shows AI tutor explaining a question */}
          <div className="sx-chipC absolute -top-8 right-4 z-20 hidden sm:flex flex-col gap-1 rounded-xl border border-accent/30 bg-bg-page/95 px-3 py-2 shadow-xl backdrop-blur-sm">
            <span className="text-[9px] font-black uppercase tracking-widest text-accent-text">✦ Jude</span>
            <span className="text-[10px] text-text-secondary leading-snug">
              <span className="font-semibold text-text-primary">1st-order CSTR:</span> X&nbsp;=&nbsp;kτ/(1+kτ) ≈ 0.375 ✓
            </span>
          </div>

          {/* card peeking behind for depth */}
          <div className="absolute inset-0 -right-5 -top-5 rounded-3xl border border-border-subtle bg-bg-surface/50 rotate-3 -z-10 hidden sm:block" />

          {/* main arena card */}
```

- [ ] **Step 2: Verify lint passes**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/components/landing/LandingScreen.tsx
git commit -m "feat: add Jude AI tutor chip to hero visual"
```

---

## Visual Verification

After all tasks are committed, start the dev server and open the landing page:

```powershell
# Kill any existing process on port 3000 first (if needed)
npm run dev
```

Open **http://localhost:3000** and confirm:

1. Badge reads `Past questions · Reference books · Jude AI` with a subtle pulse glow
2. Headline reads `"The complete KNUST question bank — with a tutor built in."` — the gradient text slowly shifts colour
3. Body copy mentions Jude by name
4. Social proof bar has 5 items that slide in one by one (staggered)
5. Background grid slowly pans
6. Accent glows slowly breathe in/out
7. The floating Jude chip (`✦ Jude / 1st-order CSTR: X = kτ/(1+kτ) ≈ 0.375 ✓`) appears top-right of the arena card on desktop
8. Hovering the arena card straightens the 3D tilt
9. All animations are absent when `prefers-reduced-motion: reduce` is set in the OS
