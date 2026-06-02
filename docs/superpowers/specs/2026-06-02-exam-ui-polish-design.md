# Exam UI polish — buttons, enlarge badge, mode cards

Date: 2026-06-02
Branch: `feat/ui-admin-improvements`

Three focused visual fixes on the student app. No behavior changes, no new
state, no backend. Each is verified locally before moving to the next.

## 1. Compact mode cards (keep 1-line description)

The Home dashboard mode cards (Practice by Topic / Midsem Simulation / Full Exam
Simulation) are too tall, so the list pushes content down on both phone and
laptop. Shrink them while keeping a one-line description.

File: `src/components/ui/ModeCard.tsx` (and the grid wrapper in `src/App.tsx`).

- Padding `p-5` → `p-4`.
- Icon tile `w-10 h-10` → `w-8 h-8`; inner icon `w-5 h-5` → `w-4 h-4`.
- Icon/tag row `mb-3` → `mb-2`.
- Title `text-lg` → `text-base`; `mb-1.5` → `mb-0.5`.
- Description `text-sm leading-relaxed` → `text-xs`, clamped to one line with
  `line-clamp-1`.
- Grid gap in App.tsx `gap-5` → `gap-3`. Grid stays `grid-cols-1 md:grid-cols-3`.

Result: ~140px → ~95px tall, same layout on both breakpoints.

## 2. Grounded-solid action buttons

Three primary buttons read as "AI slop" — too many effects (diffuse glow
shadow, scale-bounce, heavy uppercase + wide tracking). Make them feel solid:
flat confident fill, subtle press instead of bounce, theme tokens.

Shared recipe: remove the `shadow-[0_…px_…]` glow, replace `hover:scale-*` /
`active:scale-95` with `active:translate-y-px`, `font-black` → `font-bold`,
`tracking-widest` / `tracking-[0.2em]` → `tracking-wide`, use theme color tokens.

- **Resume** (`src/App.tsx`, pause overlay): drop the glow shadow and
  `hover:scale-105 active:scale-95` → `shadow-md`, `hover:bg-accent-hover`,
  `active:translate-y-px`; `px-12 py-5` → `px-10 py-4`. Also drop the
  `animate-pulse` on the paused icon tile (part of the slop feel). Keep the
  "PAUSED" heading as-is.
- **Submit Exam** (`src/App.tsx`, navigator): `text-slate-950` → `text-bg-page`
  token; drop `hover:-translate-y-0.5`; `shadow-lg` → `shadow-sm`;
  `font-black` → `font-bold`.
- **Footer Next/Submit** (`src/App.tsx`, question footer): remove the glow
  shadow and `hover:scale-[1.02] active:scale-95` → `shadow-sm` +
  `active:translate-y-px`; `font-black` → `font-bold`, `tracking-widest` →
  `tracking-wide`.

## 3. Enlarge badge → caption below the diagram

The "Tap to enlarge" badge is overlaid `absolute bottom-2 right-2` on the
diagram and covers its corner content. Move the hint below the image.

File: `src/App.tsx` (exam diagram block).

- Keep the whole asset as one clickable `<button>` (still opens the lightbox).
- Remove the absolute-positioned `bg-black/60` overlay span.
- Add a static caption row under the `<img>`:
  `mt-1.5 flex items-center justify-center gap-1 text-[11px] text-text-tertiary`
  containing the `Maximize2` icon + "Tap to enlarge". Never overlaps the image.

## Out of scope

- No changes to the lightbox itself, pause logic, or submit/finish behavior.
- "PAUSED" heading size unchanged unless the user later asks.

## Verification

`npm run lint` clean after each item; visual check in the browser per item
(Home dashboard for cards; an in-progress timed exam for the buttons + pause
overlay; a question with a diagram for the enlarge caption).
