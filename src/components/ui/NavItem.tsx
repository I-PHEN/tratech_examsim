import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export function NavItem({
  icon: Icon,
  label,
  active = false,
  expanded = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  expanded: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        'w-full flex items-center h-10 px-2.5 rounded-xl transition-colors group overflow-hidden relative',
        active
          ? 'bg-accent-muted text-accent-text border-l-2 border-accent'
          : 'text-text-tertiary hover:text-text-primary hover:bg-bg-raised',
      )}
    >
      <Icon className={cn('w-5 h-5 shrink-0', active && 'fill-accent/20')} />
      <span
        className={cn(
          'ml-4 text-xs font-semibold uppercase tracking-[0.14em] whitespace-nowrap transition-opacity duration-100',
          expanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        {label}
      </span>
    </button>
  );
}
