# Hero Section Redesign

**Date:** 2026-06-09

## Goal

Redesign the landing page hero to sell SolveX's three core differentiators — complete KNUST content (past papers + reference book questions), Jude the AI tutor, and scheduled practice — while adding polished, performance-safe animations.

## Context

The current hero headline ("The biggest question hub for KNUST students") only addresses content scarcity. It misses the AI tutoring and scheduling angles, and doesn't mention reference book questions at all. The redesign brings all three differentiators into the copy and the visual simultaneously.

## Target Visitors

Both warm leads (sent a link by a friend) and cold visitors (from socials/search). The copy must orient cold visitors immediately while giving warm visitors the "it does MORE than a PDF" signal.

## Core Pain Points Addressed

1. **Content gap** — can't find past papers + reference questions in one place
2. **Confidence gap** — don't know if they're actually ready
3. **Consistency gap** — know what to study but don't sit down and do it

## Copy Changes

### Badge
- **Before:** `Past questions · Mock exams · Scheduling`
- **After:** `Past questions · Reference books · Jude AI`
- Leads with content breadth, then names the AI tutor

### Headline
- **Before:** `"The biggest question hub for KNUST students."`
- **After:** `"The complete KNUST question bank — with a tutor built in."`
- Animated gradient sweep on `"with a tutor built in."`

### Tagline
- Keep: `"Solve more. Stress less."` — still fits

### Body copy
- **Before:** `"Practice past questions, sit full mock exams, and let SolveX bring the next set to you."`
- **After:** `"Every past exam paper and reference book question, in one place. Jude — our AI tutor — grades your answers, explains every question, and shows exactly where you're weak. Then schedules the next session before you forget."`

### Social proof bar
- **Before:** 3 items — `Live exam timer · AI-graded answers · Scheduled practice`
- **After:** 5 items with staggered entrance animation — `Past exam papers · Reference book Qs · Jude AI tutor · AI-graded answers · Scheduled practice`

### Quote
- Keep as-is — `"Example is not another way to learn — it is the only way to learn."`

## Visual Changes (HeroPreview)

Add a third floating chip — the **Jude chip** — at the top-right of the card:

```
┌─ ✦ Jude ──────────────────────┐
│ For a 1st-order CSTR:         │
│ X = kτ / (1 + kτ) ≈ 0.375 ✓  │
└───────────────────────────────┘
```

Keep the existing two chips:
- `+1 correct` (left, accent icon) — shows grading
- `82% · Mastery this topic` (bottom-right) — shows tracking

Add a faint depth card (rotated slightly behind the main arena card) for layering.

## Animations

All CSS-only. All respect `prefers-reduced-motion` (animations disabled, elements visible immediately).

| Animation | Target | Detail |
|-----------|--------|--------|
| Gradient sweep | Headline gradient text | `background-position` 0%→100%→0%, 6s loop |
| Badge glow pulse | Badge border/shadow | `box-shadow` accent glow, 4s loop |
| Grid slow pan | Background grid | `background-position` drift, 20s linear loop |
| Glow breathe | Accent blobs | `opacity` + `scale`, 8–10s loop |
| Rise on load | All copy elements | Staggered `translateY + opacity`, existing pattern |
| Spring entrance | Each floating chip | `scale(0.8)+translateY` → normal, delayed per chip |
| Proof bar stagger | Each proof bar item | Slide-in from left, 5 items × 150ms apart |
| Float | Card + chips | Existing `sxfloat` / `sxchipA/B` pattern, add `sxchipC` |
| Hover straighten | Arena card | Perspective transform on hover, existing pattern |

## Files to Change

| File | Change |
|------|--------|
| `src/components/landing/LandingScreen.tsx` | Update `Hero` copy (badge, h1, body, proof bar); update `HeroPreview` (add Jude chip, depth card, new chip animation class); add new CSS keyframes to the `<style>` block |

No backend changes. No new files needed.

## Out of Scope

- Changes to `FlowDemo`, `Features`, `FinalCta`, or `LandingFooter` sections
- Actual question count stats (don't show "3,000+ questions" without a real number)
- Any JS animation library (framer-motion etc.) — CSS only
