import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { RichText } from './RichText';

/**
 * Interactive blocks the AI tutor can emit inside chat markdown. Only two
 * custom fenced languages are supported — `jude-step` and `jude-tabs` — and
 * both parse purely from the fenced block's text content (no raw HTML), so
 * there is no XSS surface. Malformed blocks fall back to plain markdown.
 */

function parseStep(raw: string): { title: string; body: string } {
  const lines = raw.replace(/\s+$/, '').split('\n');
  const first = (lines[0] ?? '').trim();
  const m = /^title:\s*(.+)$/i.exec(first);
  if (m) {
    return { title: m[1].trim(), body: lines.slice(1).join('\n').trim() };
  }
  return { title: 'Step', body: raw.trim() };
}

export function JudeStep({ raw, depth }: { raw: string; depth: number }) {
  const { title, body } = parseStep(raw);
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-raised"
      >
        <span className="text-sm font-bold text-text-primary">{title}</span>
        <ChevronDown
          className={cn('w-4 h-4 shrink-0 text-text-tertiary transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="border-t border-border-subtle px-4 py-3 text-sm text-text-secondary">
          <RichText depth={depth + 1}>{body}</RichText>
        </div>
      )}
    </div>
  );
}

function parseTabs(raw: string): { label: string; body: string }[] {
  // Split on lines of the form `== Label ==`.
  const parts = raw.split(/^==\s*(.+?)\s*==\s*$/m);
  const tabs: { label: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    tabs.push({ label: parts[i].trim(), body: (parts[i + 1] ?? '').trim() });
  }
  return tabs;
}

export function JudeTabs({ raw, depth }: { raw: string; depth: number }) {
  const tabs = parseTabs(raw);
  const [active, setActive] = useState(0);

  if (tabs.length === 0) {
    return <RichText depth={depth + 1}>{raw}</RichText>;
  }

  const current = tabs[Math.min(active, tabs.length - 1)];
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border-subtle">
      <div className="no-scrollbar flex overflow-x-auto border-b border-border-subtle bg-bg-sunken">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              'whitespace-nowrap px-4 py-2 text-xs font-bold transition-colors',
              i === active
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-tertiary hover:text-text-primary'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-4 py-3 text-sm text-text-secondary">
        <RichText depth={depth + 1}>{current.body}</RichText>
      </div>
    </div>
  );
}

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
