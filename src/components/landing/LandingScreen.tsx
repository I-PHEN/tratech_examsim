import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Target, FileText, Stethoscope, CalendarClock, BarChart3, Bot, BookOpen, Bell, MousePointer2, Microscope, Sigma, Thermometer, FlaskConical, Activity, Check, PauseCircle } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { cn } from '../../lib/utils';

export function LandingScreen({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-bg-page text-text-primary font-sans">
      <LandingNav onStart={onStart} onSignIn={onSignIn} />
      <Hero onStart={onStart} onSignIn={onSignIn} />
      <Features />
      <FinalCta onStart={onStart} />
      <LandingFooter />
    </div>
  );
}

function LandingNav({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <header className="sticky top-0 z-50 h-16 flex items-center justify-between px-5 md:px-10 border-b border-border-subtle bg-bg-page/90 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <Logo className="w-8 h-8 shrink-0" />
        <span className="text-base font-bold tracking-tight">SolveX</span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={onSignIn}
          className="px-4 py-2 rounded-xl border border-border-medium text-xs font-bold uppercase tracking-wide text-text-primary hover:bg-bg-raised transition-colors"
        >
          Sign in
        </button>
        <button
          onClick={onStart}
          className="px-4 py-2 rounded-xl bg-accent text-bg-page text-xs font-bold uppercase tracking-wide hover:bg-accent-hover transition-colors"
        >
          Start for free
        </button>
      </div>
    </header>
  );
}

function Hero({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <section className="px-5 md:px-10 py-14 md:py-24">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left column — copy + CTAs */}
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-text-secondary">
            KNUST past questions · reference books · tutor
          </span>
          <h1 className="mt-5 font-display font-bold leading-[1.05] tracking-tight text-4xl md:text-5xl lg:text-6xl">
            The complete question bank,
            <br />
            with a tutor built in.
          </h1>
          <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed lg:max-w-md mx-auto lg:mx-0">
            Every past exam paper and reference book question, in one place.
            Get graded, see explanations, and schedule the next set before you forget.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent text-bg-page text-sm font-bold uppercase tracking-wide hover:bg-accent-hover transition-colors"
            >
              Start for free <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onSignIn}
              className="px-6 py-3 rounded-2xl border border-border-medium text-sm font-bold uppercase tracking-wide text-text-primary hover:bg-bg-raised transition-colors"
            >
              Sign in
            </button>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            {([
              { Icon: FileText,      label: 'Past papers' },
              { Icon: BookOpen,      label: 'Book Qs' },
              { Icon: Bot,           label: 'Tutor' },
              { Icon: CalendarClock, label: 'Scheduled' },
            ] as const).map(({ Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-text-tertiary" /> {label}
              </span>
            ))}
          </div>
        </div>

        {/* Right column — animated run-through in a browser chrome frame */}
        <HeroRunThrough />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  HeroRunThrough — Option A in-code animated walkthrough.                   */
/*  A fake cursor moves between elements, "clicks" them, and the screen       */
/*  transitions through 4 app-flow states that mirror the real app.           */
/* -------------------------------------------------------------------------- */

type StepId = 'pick' | 'topic' | 'solve' | 'review';

const STEP_ORDER: StepId[] = ['pick', 'topic', 'solve', 'review'];

interface Step {
  caption: string;
  /** Cursor target as a position in the 480×300 stage coordinate space. */
  cursor: { x: number; y: number };
  /** Duration of this step before advancing, in ms. */
  duration: number;
}

const STEPS: Record<StepId, Step> = {
  pick:   { caption: 'Pick how you want to practice',   cursor: { x: 90,  y: 195 }, duration: 2800 },
  topic:  { caption: 'Choose a topic to drill',         cursor: { x: 165, y: 140 }, duration: 2600 },
  solve:  { caption: 'Answer under a live timer',       cursor: { x: 95,  y: 230 }, duration: 3200 },
  review: { caption: 'See your score & weak spots',     cursor: { x: 70,  y: 100 }, duration: 3000 },
};

const TOTAL_DURATION = STEP_ORDER.reduce((sum, id) => sum + STEPS[id].duration, 0);

function HeroRunThrough() {
  const [idx, setIdx] = useState(0);
  const [reduce, setReduce] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (reduce) return;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - startRef.current) % TOTAL_DURATION;
      let acc = 0;
      let nextIdx = 0;
      for (let i = 0; i < STEP_ORDER.length; i++) {
        acc += STEPS[STEP_ORDER[i]].duration;
        if (elapsed < acc) {
          nextIdx = i;
          break;
        }
      }
      setIdx(nextIdx);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [reduce]);

  const stepId = STEP_ORDER[idx];
  const step = STEPS[stepId];

  return (
    <div className="relative">
      {/* Soft shadow base */}
      <div className="absolute -inset-4 rounded-3xl bg-bg-sunken/40 blur-2xl -z-10 hidden lg:block" />

      {/* Browser chrome frame */}
      <div className="rounded-2xl border border-border-medium bg-bg-surface shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 h-9 bg-bg-raised border-b border-border-subtle">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-border-medium" />
            <span className="w-2.5 h-2.5 rounded-full bg-border-medium" />
            <span className="w-2.5 h-2.5 rounded-full bg-border-medium" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-3 py-0.5 rounded-md bg-bg-surface border border-border-subtle text-[10px] text-text-tertiary font-mono">
              solvex.app
            </div>
          </div>
        </div>

        {/* Stage — 480×300 (8:5 landscape) so it reads as a browser viewport, not a phone */}
        <div className="relative bg-bg-page" style={{ width: '100%', aspectRatio: '480 / 300' }}>
          <div className="absolute inset-0">
            {/* Slides */}
            <SlidePick   active={stepId === 'pick'} />
            <SlideTopic  active={stepId === 'topic'} />
            <SlideSolve  active={stepId === 'solve'} />
            <SlideReview active={stepId === 'review'} />

            {/* Caption pill — floating top-left of stage */}
            <div className="absolute top-2 left-2 z-40 px-2 py-1 rounded-md bg-bg-surface/95 border border-border-subtle text-[9px] font-bold uppercase tracking-[0.12em] text-text-secondary shadow-sm">
              {step.caption}
            </div>
          </div>

          {/* Fake cursor — hidden under reduced motion */}
          {!reduce && (
            <FakeCursor x={step.cursor.x} y={step.cursor.y} visible={true} />
          )}
        </div>
      </div>

      {/* Progress dots */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {STEP_ORDER.map((id, i) => (
          <span
            key={id}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === idx ? 'w-6 bg-accent' : 'w-1.5 bg-border-medium',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Fake cursor that smoothly tweens to (x, y) whenever those change.
 *  Coordinates are in the 480×300 stage space; converted to % here. */
function FakeCursor({ x, y, visible }: { x: number; y: number; visible: boolean }) {
  return (
    <div
      className="absolute z-50 pointer-events-none transition-all duration-700 ease-in-out"
      style={{
        left: `${(x / 480) * 100}%`,
        top: `${(y / 300) * 100}%`,
        opacity: visible ? 1 : 0,
      }}
    >
      <MousePointer2 className="w-4 h-4 text-text-primary fill-bg-surface" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
    </div>
  );
}

/* Each slide absolutely positioned, fades in/out based on `active`. */
function SlideWrap({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-500 ease-out',
        active ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

/* Slide 1 — mirrors the real dashboard: greeting eyebrow, "What do you want
   to tackle today?" title, three ModeCards (Practice/Midsem/Full). */
function SlidePick({ active }: { active: boolean }) {
  const cards = [
    { Icon: Microscope, label: 'Practice by Topic',  hint: 'Flexible',      on: active },
    { Icon: FileText,   label: 'Midsem Simulation',  hint: 'Timed',         on: false },
    { Icon: FileText,   label: 'Full Exam Simulation', hint: 'Full Paper',  on: false },
  ];
  return (
    <SlideWrap active={active}>
      <div className="h-full flex flex-col p-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Logo className="w-4 h-4" />
            <span className="text-[9px] font-bold">SolveX</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-bg-raised" />
            <span className="w-4 h-4 rounded bg-bg-raised" />
          </div>
        </div>
        {/* Greeting */}
        <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">Good evening, Mike</p>
        <h2 className="font-display font-bold text-[15px] text-text-primary leading-tight mt-0.5">What do you want to tackle today?</h2>
        {/* Mode cards */}
        <div className="grid grid-cols-3 gap-1.5 mt-3 flex-1">
          {cards.map(({ Icon, label, hint, on }) => (
            <div
              key={label}
              className={cn(
                'rounded-lg border p-2 flex flex-col gap-1',
                on ? 'border-accent/50 bg-accent/10' : 'border-border-subtle bg-bg-surface',
              )}
            >
              <div className={cn(
                'w-6 h-6 rounded-md flex items-center justify-center',
                on ? 'bg-accent text-bg-page' : 'bg-bg-raised text-text-tertiary',
              )}>
                <Icon className="w-3 h-3" />
              </div>
              <span className="text-[9px] font-bold text-text-primary leading-tight">{label}</span>
              <span className="text-[7px] font-semibold uppercase tracking-[0.14em] text-text-tertiary mt-auto">{hint}</span>
            </div>
          ))}
        </div>
      </div>
    </SlideWrap>
  );
}

/* Slide 2 — mirrors the real TopicCard grid: icon, name, "X Questions",
   mastery bar. */
function SlideTopic({ active }: { active: boolean }) {
  const topics = [
    { Icon: FlaskConical, name: 'Reactor Design', q: 24, mastery: 60, on: active },
    { Icon: Sigma,        name: 'Mass Balance',   q: 18, mastery: 30, on: false },
    { Icon: Thermometer,  name: 'Thermodynamics', q: 31, mastery: 80, on: false },
    { Icon: Activity,     name: 'Kinetics',       q: 15, mastery: 45, on: false },
  ];
  return (
    <SlideWrap active={active}>
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-2.5">
          <button className="text-text-tertiary text-[9px]">‹ Back</button>
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">Practice by Topic · ChemEng 261</span>
        </div>
        <h2 className="font-display font-bold text-[13px] text-text-primary leading-tight">Pick a topic and begin</h2>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5 flex-1">
          {topics.map(({ Icon, name, q, mastery, on }) => (
            <div
              key={name}
              className={cn(
                'rounded-lg border p-2 flex flex-col gap-1',
                on ? 'border-accent bg-accent-muted' : 'border-border-subtle bg-bg-surface',
              )}
            >
              <div className="flex items-start gap-1.5">
                <div className={cn(
                  'w-5 h-5 rounded flex items-center justify-center shrink-0',
                  on ? 'bg-accent text-bg-page' : 'bg-bg-page text-text-tertiary',
                )}>
                  <Icon className="w-2.5 h-2.5" />
                </div>
                <span className="text-[9px] font-semibold text-text-primary leading-tight line-clamp-2">{name}</span>
              </div>
              <div className="flex justify-between text-[7px] font-semibold uppercase tracking-[0.1em] mt-auto">
                <span className={on ? 'text-accent-text' : 'text-text-tertiary'}>{q} Questions</span>
                <span className={on ? 'text-accent-text' : 'text-text-tertiary'}>{mastery}% Mastery</span>
              </div>
              <div className="h-0.5 rounded-full bg-bg-sunken overflow-hidden">
                <div className={cn('h-full rounded-full', on ? 'bg-accent' : 'bg-text-tertiary/30')} style={{ width: `${mastery}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideWrap>
  );
}

/* Slide 3 — mirrors the real exam screen: top timer bar, "Q3 / 10" position,
   question text, MCQ options (B selected). */
function SlideSolve({ active }: { active: boolean }) {
  const opts: Array<[string, string, boolean]> = [
    ['A', '0.42', false],
    ['B', '0.68', active],
    ['C', '0.75', false],
  ];
  return (
    <SlideWrap active={active}>
      <div className="h-full flex flex-col">
        {/* Top HUD */}
        <div className="flex items-center justify-between px-4 h-7 bg-bg-surface border-b border-border-subtle">
          <span className="text-[9px] uppercase tracking-[0.16em] text-text-tertiary font-semibold">Q3 / 10</span>
          <span className="text-[10px] font-bold text-accent-text tabular-nums">19:54</span>
          <span className="text-[9px] text-text-tertiary">ChemEng 261</span>
        </div>
        <div className="flex-1 p-4 flex flex-col">
          <p className="text-[11px] text-text-primary mb-3 leading-snug">
            A CSTR runs at steady state with k = 0.12 s⁻¹ and τ = 5 s. Find the conversion X.
          </p>
          <div className="space-y-1.5">
            {opts.map(([l, v, on]) => (
              <div
                key={l}
                className={cn(
                  'h-7 rounded-lg border flex items-center gap-2 px-2.5 text-[10px]',
                  on ? 'border-accent/60 bg-accent/10 text-text-primary' : 'border-border-subtle bg-bg-surface text-text-secondary',
                )}
              >
                <span className="font-black w-3">{l}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between text-[8px] text-text-tertiary">
            <span className="flex items-center gap-1"><PauseCircle className="w-2.5 h-2.5" /> Pause (3 left)</span>
            <span>3 answered · 7 left</span>
          </div>
        </div>
      </div>
    </SlideWrap>
  );
}

/* Slide 4 — mirrors the real Review screen: score circle + topic breakdown
   bars. */
function SlideReview({ active }: { active: boolean }) {
  const topics: Array<[string, number]> = [
    ['Reactor Design', 0.9],
    ['Mass Balance',   0.6],
    ['Thermodynamics', 0.4],
  ];
  return (
    <SlideWrap active={active}>
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-2.5">
          <button className="text-text-tertiary text-[9px]">‹ Back</button>
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">Review · ChemEng 261</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          {/* Score ring */}
          <div className="relative w-12 h-12 shrink-0">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="21" fill="transparent" stroke="var(--border-subtle)" strokeWidth="3" />
              <circle cx="24" cy="24" r="21" fill="transparent" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${0.8 * 131.9} 131.9`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-accent-text">80%</span>
            </div>
          </div>
          <div>
            <h2 className="font-display font-bold text-[14px] text-text-primary leading-tight">Strong work</h2>
            <p className="text-[9px] text-text-secondary">8 of 10 correct · 19m 54s</p>
          </div>
        </div>
        <div className="space-y-1.5 flex-1">
          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">Mastery by topic</p>
          {topics.map(([t, v]) => (
            <div key={t}>
              <div className="flex justify-between text-[8px] text-text-secondary mb-0.5">
                <span>{t}</span>
                <span className="font-semibold">{Math.round(v * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-sunken overflow-hidden">
                <div className="h-full rounded-full bg-accent" style={{ width: `${v * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[8px] text-accent-text font-semibold uppercase tracking-[0.12em] bg-accent-muted border border-accent/30 rounded-full px-2 py-1 self-start">
          <Check className="w-2.5 h-2.5" /> 1 weak spot to drill
        </div>
      </div>
    </SlideWrap>
  );
}

/* -------------------------------------------------------------------------- */

const FEATURES = [
  { icon: Target, title: 'Topic practice', desc: 'Drill any topic at your difficulty, at your own pace.' },
  { icon: FileText, title: 'Full mock exams', desc: 'Timed midsem & full papers under real conditions.' },
  { icon: Stethoscope, title: 'Diagnostics', desc: 'A spread across topics that pinpoints your weak spots.' },
  { icon: Bot, title: 'Tutor explanations', desc: 'Written & multi-part questions marked with feedback.' },
  { icon: CalendarClock, title: 'Brings questions to you', desc: 'Schedule practice; SolveX reminds you and loads the set.' },
  { icon: BarChart3, title: 'Progress analytics', desc: 'Accuracy by topic, history, and mastery over time.' },
] as const;

function Features() {
  return (
    <section className="px-5 md:px-10 py-16 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary">Everything in one place</span>
        <h2 className="mt-1.5 font-display font-bold text-2xl md:text-3xl">Not just past questions — a full practice engine.</h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border-subtle bg-bg-surface p-5">
              <div className="w-10 h-10 rounded-xl bg-bg-page text-text-secondary flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5" />
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
    <section className="px-5 md:px-10 py-20 border-t border-border-subtle text-center">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-display font-bold text-3xl md:text-5xl leading-tight">Ready to lock in?</h2>
        <p className="mt-4 text-sm md:text-base text-text-secondary">
          Past questions, mock exams, and a plan that brings the next set to you.
        </p>
        <div className="mt-8">
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-accent text-bg-page text-sm font-bold uppercase tracking-wide hover:bg-accent-hover transition-colors"
          >
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
      <div className="flex items-center gap-2">
        <Logo className="w-6 h-6" />
        <span className="text-sm font-bold">SolveX</span>
      </div>
      <span className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">© 2026 · Built for KNUST</span>
    </footer>
  );
}
