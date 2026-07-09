import { ChevronLeft, Compass, Layers, Target, FileText, MessageCircleQuestion, Bookmark, BarChart3, Settings } from 'lucide-react';

const SECTIONS = [
  {
    icon: Compass,
    title: 'Finding your way',
    body: 'The left sidebar is your main menu: Home (choose a study mode), Targeted Practice (drill a single topic), My Sessions (review past attempts and saved questions), and Performance (track your accuracy). The "Year · Semester" chip in the top bar sets which courses you see — tap it to change it in Settings → Academics.',
  },
  {
    icon: Layers,
    title: 'Study modes',
    body: 'From Home you can start: Practice (untimed questions to learn), Diagnostic (a short assessment that finds your weak topics), and the Midsem and Full Exam simulations (timed runs under real exam conditions).',
  },
  {
    icon: Target,
    title: 'Targeted Practice',
    body: 'Pick one topic and drill questions focused on it — the fastest way to shore up a weak area before an exam.',
  },
  {
    icon: FileText,
    title: 'During an exam',
    body: 'Use the Question Navigator to jump between questions — green means answered, yellow means flagged. Flag anything you want to revisit, and pause up to 3 times if you need a break. Tap any diagram to view it full-screen. Questions may be multiple-choice, written, or multi-input.',
  },
  {
    icon: MessageCircleQuestion,
    title: 'Reviewing & Jude',
    body: 'After you submit, open any question to see your answer, the correct answer, and a step-by-step worked solution. Tap "Ask Jude" for the built-in AI tutor — it explains the question and answers your follow-ups.',
  },
  {
    icon: Bookmark,
    title: 'Saving questions',
    body: 'Bookmark a question to save it for later. Find everything you’ve saved under My Sessions → Saved, and re-practice it any time.',
  },
  {
    icon: BarChart3,
    title: 'Performance',
    body: 'Track your accuracy over time, see a breakdown by topic and difficulty, and spot your weakest topics so you know exactly what to study next.',
  },
  {
    icon: Settings,
    title: 'Settings',
    body: 'Set your preferred name (what Jude calls you), pick a theme colour, and set your academic Year and Semester under Settings → Academics. You can also choose which notification updates you want.',
  },
];

const FAQS = [
  {
    q: 'Can I change my year or semester?',
    a: 'Yes — tap the "Year · Semester" chip in the top bar, or open Settings → Academics. Your course list updates to match.',
  },
  {
    q: "What's the difference between Practice and the exam simulations?",
    a: 'Practice is untimed and built for learning. The Midsem and Full Exam simulations are timed and mirror real exam conditions, including the question navigator and limited pauses.',
  },
  {
    q: 'Who is Jude?',
    a: 'Jude is the built-in AI assistant. While reviewing a submitted question, tap "Ask Jude" to get an explanation and ask follow-ups. On the Scheduled screen, "Ask Jude to schedule" turns plain English (e.g. "thermo Mon & Wed 6pm") into ready-to-save practice schedules — there, Jude only helps with scheduling.',
  },
  {
    q: 'How do I review my mistakes?',
    a: 'Open My Sessions, pick a past session, and step through the questions. Each one shows your answer, the correct answer, and a worked solution.',
  },
];

export function HelpScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex-1 w-full flex justify-center py-5 md:py-6 px-4 h-full overflow-y-auto">
      <div className="w-full max-w-3xl space-y-8 animate-fade-in pb-12">
        <div className="flex items-center gap-4 border-b border-border-subtle pb-6">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-container-highest transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-text-primary italic font-display">Help &amp; Guide</h1>
            <p className="text-sm text-text-secondary">How the app works, and how to get the most out of it.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SECTIONS.map((s) => (
            <div key={s.title} className="p-5 rounded-3xl bg-surface-container-high border border-outline-variant/20">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-3">
                <s.icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text-primary mb-1.5">{s.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4 pt-2">
          <h2 className="text-xl font-bold text-text-primary">Quick answers</h2>
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
                <summary className="p-4 font-semibold text-text-primary cursor-pointer hover:bg-surface-container-highest transition-colors flex items-center justify-between gap-3 outline-none">
                  {faq.q}
                  <span className="text-primary group-open:rotate-45 transition-transform text-2xl leading-none shrink-0">+</span>
                </summary>
                <div className="p-4 pt-0 text-sm text-text-secondary leading-relaxed">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
