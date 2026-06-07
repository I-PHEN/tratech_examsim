import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Target, FileText, Stethoscope, Bot, CalendarClock, BarChart3,
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
    <section className="relative overflow-hidden px-5 md:px-10 py-16 md:py-24">
      <div className="absolute z-0 w-[36rem] h-[36rem] rounded-full bg-accent/15 blur-[120px] -bottom-60 -left-40 pointer-events-none" />
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
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent text-bg-page text-sm font-bold uppercase tracking-wide hover:bg-accent-hover transition-all hover:scale-[1.02] active:scale-95"
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
        <span>Q3 / 10</span>
        <span className="text-accent-text">19:54</span>
      </div>
    </div>
  );
}

const FLOW = [
  { n: 1, tag: 'Pick', label: 'Chemical Engineering → Reactor Design' },
  { n: 2, tag: 'Solve', label: 'Answer under a live timer' },
  { n: 3, tag: 'Review', label: "See your score & weak topics" },
  { n: 4, tag: 'Schedule', label: 'SolveX brings the next set to you' },
] as const;

function FlowDemo() {
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
          {FLOW.map((f) => (
            <div key={f.n} className="sx-frame absolute inset-0 p-5">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold text-accent-text bg-accent-muted border border-accent/40 rounded-lg px-2.5 py-1">
                  {f.n} · {f.tag}
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{f.label}</span>
              </div>
              <FlowFrameBody n={f.n} />
              <div className="absolute left-5 right-5 bottom-4 flex gap-1.5">
                {FLOW.map((d) => (
                  <span key={d.n} className={cn('h-1 flex-1 rounded-full', d.n === f.n ? 'bg-accent' : 'bg-bg-raised')} />
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
  if (n === 1)
    return (
      <div className="mt-4 space-y-2">
        <div className="h-3.5 w-3/5 rounded bg-bg-raised" />
        <div className="h-3.5 w-2/5 rounded bg-bg-raised" />
      </div>
    );
  if (n === 2)
    return (
      <div className="mt-3 space-y-1.5">
        <div className="h-5 rounded-md bg-success-bg border border-success-border" />
        <div className="h-5 rounded-md bg-bg-raised" />
        <div className="h-5 rounded-md bg-bg-raised" />
      </div>
    );
  if (n === 3)
    return (
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
      <div className="space-y-1.5">
        <div className="h-3 w-32 rounded bg-bg-raised" />
        <div className="h-2.5 w-20 rounded bg-bg-raised" />
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
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent-text bg-accent-muted border border-accent/30 rounded-full px-3 py-1.5">
          ★ #TNBT
        </span>
        <h2 className="mt-5 font-display italic font-bold text-3xl md:text-4xl leading-tight">
          Normalize solving. Start with Chemical Engineering.
        </h2>
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
      <span className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">© 2026 · Built for KNUST · #TNBT</span>
    </footer>
  );
}
