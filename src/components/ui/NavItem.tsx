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
    <div className="relative group">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className={cn(
          'w-full flex items-center h-10 px-2.5 rounded-xl transition-colors overflow-hidden relative cursor-pointer',
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

      {/* Collapsed-state hover tooltip */}
      {!expanded && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 rounded-lg bg-bg-raised border border-border-subtle text-text-primary text-xs font-semibold tracking-wide whitespace-nowrap shadow-lg opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-100 z-50"
        >
          {label}
        </span>
      )}
    </div>
  );
}
