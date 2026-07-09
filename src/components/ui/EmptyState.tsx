import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const compact = size === 'sm';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border-subtle bg-bg-surface/40',
        compact ? 'py-10 px-6' : 'py-16 px-8',
        className,
      )}
    >
      <div
        className={cn(
          'rounded-2xl bg-bg-raised flex items-center justify-center mb-5',
          compact ? 'w-10 h-10' : 'w-12 h-12',
        )}
      >
        <Icon className={cn(compact ? 'w-5 h-5' : 'w-6 h-6', 'text-text-tertiary')} />
      </div>
      <h3 className="font-display text-text-primary text-lg md:text-xl mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
