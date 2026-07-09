import { ArrowRight, Target, FileText, Stethoscope, CalendarClock, BarChart3, Bot, BookOpen } from 'lucide-react';
import { Logo } from '../ui/Logo';

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
    <section className="px-5 md:px-10 py-20 md:py-32">
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

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          {([
            { Icon: FileText,      label: 'Past exam papers' },
            { Icon: BookOpen,      label: 'Reference book Qs' },
            { Icon: Bot,           label: 'Tutor explanations' },
            { Icon: CalendarClock, label: 'Scheduled practice' },
          ] as const).map(({ Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-text-tertiary" /> {label}
            </span>
          ))}
        </div>
      </div>
    </section>
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
