import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

interface PillProps {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'neutral':
      return 'bg-bg-raised border border-border-subtle text-text-secondary';
    case 'accent':
      return 'bg-accent-muted border border-accent/30 text-accent-text';
    case 'success':
      return 'border text-[color:var(--success-text)] bg-[color:var(--success-bg)] border-[color:var(--success-border)]';
    case 'warning':
      return 'border text-[color:var(--warning-text)] bg-[color:var(--warning-bg)] border-[color:var(--warning-border)]';
    case 'danger':
      return 'border text-[color:var(--danger-text)] bg-[color:var(--danger-bg)] border-[color:var(--danger-border)]';
  }
}

export function Pill({ tone = 'neutral', icon, children, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide whitespace-nowrap',
        toneClasses(tone),
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
