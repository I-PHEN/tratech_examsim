import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Target, FileText, Stethoscope, Bot, CalendarClock, BarChart3, Bell,
  Sparkles, Check, Clock, BookOpen,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { cn } from '../../lib/utils';

/** Reveal-on-scroll: adds the visible class once the element scrolls into view.
 *  Respects prefers-reduced-motion (shows immediately, no transition). */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !ref.current) {
      setShown(true);
      return;
    }
    const el = ref.current;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

export function LandingScreen({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-bg-page text-text-primary font-sans overflow-x-hidden">
      <LandingNav onStart={onStart} onSignIn={onSignIn} />
      <Hero onStart={onStart} onSignIn={onSignIn} />
      <FlowDemo />
      <Features />
      <FinalCta onStart={onStart} />
      <LandingFooter />
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
    <section className="relative overflow-hidden px-5 md:px-10 py-16 md:py-28">
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

      {/* layered glows + faint masked grid */}
      <div className="sx-glowbreathe absolute z-0 w-[40rem] h-[40rem] rounded-full bg-accent/15 blur-[130px] -top-48 -right-40 pointer-events-none" />
      <div className="sx-glowbreathe absolute z-0 w-[34rem] h-[34rem] rounded-full bg-accent/10 blur-[130px] -bottom-56 -left-48 pointer-events-none" style={{ animationDelay: '4s', animationDirection: 'reverse' }} />
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

      <div className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-14 items-center">
        <div>
          <span className="sx-rise sx-badgepulse inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-muted px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text">
            <Sparkles className="w-3.5 h-3.5" /> Past questions · Reference books · Jude AI
          </span>
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
          <p className="sx-rise mt-3 font-display italic text-lg md:text-xl text-accent-text" style={{ animationDelay: '.16s' }}>
            Solve more. Stress less.
          </p>
          <p className="sx-rise mt-4 text-sm md:text-base text-text-secondary leading-relaxed max-w-md" style={{ animationDelay: '.24s' }}>
            Every past exam paper and reference book question, in one place.{' '}
            <strong className="text-text-primary font-semibold">Jude</strong> — our AI tutor — grades your answers,
            explains every question, and shows exactly where you're weak.
            Then schedules the next session before you forget.
          </p>
          <div className="sx-rise mt-7 flex flex-wrap gap-3" style={{ animationDelay: '.32s' }}>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent text-bg-page text-sm font-bold uppercase tracking-wide hover:bg-accent-hover transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-accent/25"
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
          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            {([
              { Icon: FileText,      label: 'Past exam papers',   delay: '.40s' },
              { Icon: BookOpen,      label: 'Reference book Qs',  delay: '.53s' },
              { Icon: Bot,           label: 'Jude AI tutor',      delay: '.66s' },
              { Icon: Sparkles,      label: 'AI-graded answers',  delay: '.79s' },
              { Icon: CalendarClock, label: 'Scheduled practice', delay: '.92s' },
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
          <figure className="sx-rise mt-9 border-l-2 border-accent/50 pl-4 max-w-md" style={{ animationDelay: '.48s' }}>
            <blockquote className="font-display italic text-base md:text-lg text-text-primary leading-snug">
              “Example is not another way to learn — it is the only way to learn.”
            </blockquote>
            <figcaption className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              The idea behind SolveX
            </figcaption>
          </figure>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

/** Floating exam-arena mockup with depth + floating chips — built from UI
 *  primitives, NOT real question data. Tilt straightens on hover. */
function HeroPreview() {
  return (
    <div className="sx-rise relative mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: '.3s' }}>
      <div className="absolute -inset-6 z-0 rounded-[2.5rem] bg-accent/20 blur-3xl pointer-events-none" />
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
        <div className="rounded-3xl border border-border-medium bg-bg-surface p-5 md:p-6 shadow-2xl transition-transform duration-500 ease-out [transform:perspective(1400px)_rotateY(-7deg)_rotateX(3deg)] hover:[transform:perspective(1400px)_rotateY(0deg)_rotateX(0deg)]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] uppercase tracking-[0.16em] text-text-tertiary">Reactor Design · Practice</span>
            <span className="text-[10px] font-bold text-accent-text tabular-nums">19:54</span>
          </div>
          <p className="text-xs md:text-sm text-text-primary leading-snug mb-4">
            A CSTR runs at steady state with k = 0.12 s⁻¹. Find the conversion X.
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="h-9 rounded-lg bg-accent/15 border border-accent/50 flex items-center gap-2 px-3 text-xs text-text-primary">
              <span className="font-black">B</span><span>0.68</span>
            </div>
            <div className="h-9 rounded-lg bg-bg-raised border border-border-subtle" />
            <div className="h-9 rounded-lg bg-bg-raised border border-border-subtle" />
          </div>
          <div className="flex items-center justify-between mt-5">
            <span className="text-[9px] uppercase tracking-[0.16em] text-text-tertiary">Q3 / 10</span>
            <div className="flex gap-1">
              {[1, 1, 1, 0, 0, 0, 0, 0, 0, 0].map((on, i) => (
                <span key={i} className={cn('h-1 w-3 rounded-full', on ? 'bg-accent' : 'bg-bg-raised')} />
              ))}
            </div>
          </div>
        </div>

        {/* floating chips */}
        <div className="sx-chipA absolute -left-3 sm:-left-6 top-14 z-20 flex items-center gap-2 rounded-xl border border-accent/40 bg-bg-raised/95 px-3 py-2 shadow-xl backdrop-blur">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-bg-page"><Check className="w-3 h-3" /></span>
          <span className="text-[11px] font-bold text-text-primary">+1 correct</span>
        </div>
        <div className="sx-chipB absolute -right-2 sm:-right-5 bottom-12 z-20 flex items-center gap-2 rounded-xl border border-border-medium bg-bg-raised/95 px-3 py-2 shadow-xl backdrop-blur">
          <span className="font-display italic font-bold text-lg text-accent-text leading-none">80%</span>
          <span className="text-[9px] uppercase tracking-[0.12em] text-text-tertiary leading-tight">score<br />so far</span>
        </div>
      </div>
    </div>
  );
}

/**
 * "See how it works" — a PowerPoint-style slideshow of recognisable app screens:
 * pick a mode → solve in the arena → review your score → schedule the next set.
 * Pure-CSS slide/fade loop (no JS, no library); pauses to a single frame under
 * prefers-reduced-motion.
 */
function FlowDemo() {
  const slides = [
    { caption: 'Pick how you practice', body: <SlidePick /> },
    { caption: 'Answer under a live timer', body: <SlideSolve /> },
    { caption: 'See your score & weak topics', body: <SlideReview /> },
    { caption: 'SolveX brings the next set to you', body: <SlideSchedule /> },
  ];
  return (
    <section className="px-5 md:px-10 py-14 border-t border-border-subtle">
      <style>{`
        @keyframes sxslide { 0%{opacity:0;transform:translateX(26px)} 3%,21%{opacity:1;transform:translateX(0)} 24%,100%{opacity:0;transform:translateX(-26px)} }
        .sx-slide{opacity:0;animation:sxslide 12s infinite}
        .sx-slide:nth-child(1){animation-delay:0s}
        .sx-slide:nth-child(2){animation-delay:3s}
        .sx-slide:nth-child(3){animation-delay:6s}
        .sx-slide:nth-child(4){animation-delay:9s}
        @media (prefers-reduced-motion: reduce){ .sx-slide{animation:none;opacity:0} .sx-slide:nth-child(1){opacity:1} }
      `}</style>
      <div className="max-w-6xl mx-auto">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary">See how it works ↺</span>
        <h2 className="mt-1.5 font-display italic font-bold text-2xl md:text-3xl">A typical flow, start to finish.</h2>
        <div className="relative mt-6 h-64 rounded-2xl border border-border-subtle bg-bg-page/40 overflow-hidden">
          {slides.map((s, i) => (
            <div key={i} className="sx-slide absolute inset-0 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-accent-text bg-accent-muted border border-accent/40 rounded-lg px-2.5 py-1">{i + 1}</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{s.caption}</span>
              </div>
              <div className="flex-1 min-h-0">{s.body}</div>
              <div className="flex gap-1.5 mt-3">
                {slides.map((_, d) => (
                  <span key={d} className={cn('h-1 flex-1 rounded-full', d === i ? 'bg-accent' : 'bg-bg-raised')} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlidePick() {
  const cards = [
    { Icon: Target, label: 'Practice', hint: 'Drill a topic', on: true },
    { Icon: Stethoscope, label: 'Diagnostic', hint: 'Find weak spots', on: false },
    { Icon: FileText, label: 'Mock Exam', hint: 'Timed paper', on: false },
  ];
  return (
    <div className="grid grid-cols-3 gap-2.5 h-full">
      {cards.map(({ Icon, label, hint, on }) => (
        <div key={label} className={cn('rounded-xl border p-3 flex flex-col gap-2', on ? 'border-accent/50 bg-accent/10' : 'border-border-subtle bg-bg-surface')}>
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', on ? 'bg-accent text-bg-page' : 'bg-bg-raised text-text-tertiary')}>
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
  const opts: Array<[string, string, boolean]> = [['A', '0.42', false], ['B', '0.68', true], ['C', '0.75', false]];
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-text-tertiary mb-2.5">
        <span>Q3 / 10</span><span className="text-accent-text font-bold">19:54</span>
      </div>
      <p className="text-xs md:text-sm text-text-primary mb-3 leading-snug">A CSTR runs at steady state with k = 0.12 s⁻¹. Find the conversion X.</p>
      <div className="space-y-2">
        {opts.map(([l, v, on]) => (
          <div key={l} className={cn('h-8 rounded-lg border flex items-center gap-2 px-3 text-xs', on ? 'border-accent/60 bg-accent/10 text-text-primary' : 'border-border-subtle bg-bg-surface text-text-secondary')}>
            <span className="font-black">{l}</span><span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideReview() {
  const topics: Array<[string, number]> = [['Reactor Design', 0.9], ['Mass Balance', 0.6], ['Thermodynamics', 0.4]];
  return (
    <div className="flex items-center gap-5 h-full">
      <div className="text-center shrink-0">
        <div className="font-display italic font-bold text-4xl text-text-primary leading-none">
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
      <div className="w-full rounded-xl border border-accent/40 bg-bg-surface p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent-muted border border-accent/40 flex items-center justify-center text-accent shrink-0">
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
  { icon: Target, title: 'Topic practice', desc: 'Drill any Reactor Design / ChemEng topic, at your difficulty.' },
  { icon: FileText, title: 'Full mock exams', desc: 'Timed midsem & full papers under real conditions.' },
  { icon: Stethoscope, title: 'Diagnostics', desc: 'A spread across topics that pinpoints your weak spots.' },
  { icon: Bot, title: 'AI-graded answers', desc: 'Written & multi-part questions marked with partial credit + feedback.' },
  { icon: CalendarClock, title: 'Brings questions to you', desc: 'Schedule practice; SolveX reminds you and loads the set — solve later, on time.' },
  { icon: BarChart3, title: 'Progress analytics', desc: 'Accuracy by topic, history, and mastery over time.' },
] as const;

function Features() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <section className="px-5 md:px-10 py-16 border-t border-border-subtle">
      <div
        ref={ref}
        className={cn(
          'max-w-6xl mx-auto transition-all duration-700',
          shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        )}
      >
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
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <section className="relative overflow-hidden px-5 md:px-10 py-20 border-t border-border-subtle text-center">
      <div className="absolute z-0 w-[28rem] h-[28rem] rounded-full bg-accent/15 blur-[120px] -top-40 left-1/2 -translate-x-1/2 pointer-events-none" />
      <div
        ref={ref}
        className={cn(
          'relative z-10 max-w-2xl mx-auto transition-all duration-700',
          shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        )}
      >
        <h2 className="font-display italic font-bold text-3xl md:text-5xl leading-tight">Ready to lock in?</h2>
        <p className="mt-4 text-sm md:text-base text-text-secondary">
          Past questions, mock exams, and a plan that brings the next set to you.
        </p>
        <div className="mt-8">
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-accent text-bg-page text-sm font-bold uppercase tracking-wide hover:bg-accent-hover transition-all hover:scale-[1.02] active:scale-95"
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
