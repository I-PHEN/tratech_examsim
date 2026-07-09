import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  size = 'md',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-6 mb-5', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary mb-2">
            {eyebrow}
          </p>
        )}
        <h2
          className={cn(
            'font-display text-text-primary leading-tight',
            size === 'lg' ? 'text-3xl md:text-4xl' : 'text-2xl md:text-[28px]',
          )}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm text-text-secondary max-w-xl leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
