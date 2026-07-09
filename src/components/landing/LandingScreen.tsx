import { useEffect, useState } from 'react';
import { ArrowRight, Target, FileText, Stethoscope, CalendarClock, BarChart3, Bot, BookOpen, Bell } from 'lucide-react';
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
    <section className="px-5 md:px-10 py-16 md:py-24">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="font-display font-bold leading-[1.05] tracking-tight text-4xl md:text-6xl">
          The complete KNUST question bank,
          <br />
          with a tutor built in.
        </h1>
        <p className="mt-5 text-lg md:text-xl text-text-secondary leading-relaxed max-w-xl mx-auto">
          Every past exam paper and reference book question, in one place.
          Get graded, see explanations, and schedule the next set before you forget.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
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
      </div>

      <HeroDemo />
    </section>
  );
}

/** Auto-cycling 4-step demo of the app flow. Pure React state + CSS opacity,
 *  no keyframes. Pauses on first slide under prefers-reduced-motion. */
const DEMO_STEPS = [
  { caption: '1 · Pick how you want to practice', render: () => <SlidePick /> },
  { caption: '2 · Solve under a live timer',       render: () => <SlideSolve /> },
  { caption: '3 · See your score & weak topics',   render: () => <SlideReview /> },
  { caption: '4 · Schedule the next set',          render: () => <SlideSchedule /> },
] as const;

const DEMO_INTERVAL_MS = 3500;

function HeroDemo() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % DEMO_STEPS.length);
    }, DEMO_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-14 md:mt-20 max-w-2xl mx-auto">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-tertiary text-center mb-3 h-4">
        {DEMO_STEPS[idx].caption}
      </div>
      <div className="relative h-72 md:h-80 rounded-2xl border border-border-subtle bg-bg-surface overflow-hidden">
        {DEMO_STEPS.map((s, i) => (
          <div
            key={i}
            className={cn(
              'absolute inset-0 p-5 md:p-6 transition-opacity duration-500 ease-out',
              i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            aria-hidden={i !== idx}
          >
            {s.render()}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {DEMO_STEPS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to step ${i + 1}`}
            onClick={() => setIdx(i)}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === idx ? 'w-6 bg-accent' : 'w-1.5 bg-border-medium hover:bg-border-accent',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function SlidePick() {
  const cards = [
    { Icon: Target,      label: 'Practice',      hint: 'Drill a topic',     on: true },
    { Icon: Stethoscope, label: 'Diagnostic',    hint: 'Find weak spots',   on: false },
    { Icon: FileText,    label: 'Mock Exam',     hint: 'Timed paper',       on: false },
  ];
  return (
    <div className="grid grid-cols-3 gap-2.5 h-full">
      {cards.map(({ Icon, label, hint, on }) => (
        <div
          key={label}
          className={cn(
            'rounded-xl border p-3 flex flex-col gap-2',
            on ? 'border-accent/50 bg-accent/10' : 'border-border-subtle bg-bg-surface',
          )}
        >
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            on ? 'bg-accent text-bg-page' : 'bg-bg-raised text-text-tertiary',
          )}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-text-primary">{label}</span>
          <span className="text-[10px] text-text-tertiary leading-snug">{hint}</span>
        </div>
      ))}
    </div>
  );
}

function SlideSolve() {
  const opts: Array<[string, string, boolean]> = [
    ['A', '0.42', false],
    ['B', '0.68', true],
    ['C', '0.75', false],
  ];
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-text-tertiary mb-3">
        <span>Q3 / 10</span>
        <span className="text-accent-text font-bold tabular-nums">19:54</span>
      </div>
      <p className="text-xs md:text-sm text-text-primary mb-4 leading-snug">
        A CSTR runs at steady state with k = 0.12 s⁻¹. Find the conversion X.
      </p>
      <div className="space-y-2 flex-1">
        {opts.map(([l, v, on]) => (
          <div
            key={l}
            className={cn(
              'h-10 rounded-lg border flex items-center gap-2 px-3 text-xs',
              on
                ? 'border-accent/60 bg-accent/10 text-text-primary'
                : 'border-border-subtle bg-bg-surface text-text-secondary',
            )}
          >
            <span className="font-black">{l}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideReview() {
  const topics: Array<[string, number]> = [
    ['Reactor Design', 0.9],
    ['Mass Balance',   0.6],
    ['Thermodynamics', 0.4],
  ];
  return (
    <div className="flex items-center gap-5 h-full">
      <div className="text-center shrink-0">
        <div className="font-display font-bold text-4xl text-text-primary leading-none">
          8<span className="text-text-tertiary text-2xl">/10</span>
        </div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent-text">80% · Strong</div>
      </div>
      <div className="flex-1 space-y-2.5">
        {topics.map(([t, v]) => (
          <div key={t}>
            <div className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary mb-1">{t}</div>
            <div className="h-2 rounded-full bg-bg-raised overflow-hidden">
              <div className="h-full rounded-full bg-accent" style={{ width: `${v * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideSchedule() {
  return (
    <div className="h-full flex items-center">
      <div className="w-full rounded-xl border border-border-subtle bg-bg-surface p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-bg-raised border border-border-subtle flex items-center justify-center text-text-secondary shrink-0">
          <CalendarClock className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary truncate">Reactor Design · 10 questions</div>
          <div className="text-[11px] text-text-tertiary">Tomorrow · 6:00 PM</div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-text bg-accent-muted border border-accent/30 rounded-full px-2.5 py-1 shrink-0">
          <Bell className="w-3 h-3" /> Reminder set
        </div>
      </div>
    </div>
  );
}

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
