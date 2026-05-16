import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

function variantClasses(variant: Variant): string {
  switch (variant) {
    case 'primary':
      return 'bg-accent text-slate-950 hover:bg-accent-hover shadow-[0_4px_14px_-4px_var(--accent)]';
    case 'secondary':
      return 'bg-bg-surface text-text-primary border border-border-medium hover:bg-bg-raised';
    case 'ghost':
      return 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-raised';
    case 'danger':
      return 'bg-bg-surface text-text-primary border border-border-subtle hover:border-[color:var(--danger-text)] hover:text-[color:var(--danger-text)]';
  }
}

function sizeClasses(size: Size): string {
  switch (size) {
    case 'sm':
      return 'h-8 px-3 text-xs gap-1.5';
    case 'md':
      return 'h-10 px-4 text-sm gap-2';
    case 'lg':
      return 'h-12 px-6 text-sm gap-2';
  }
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold tracking-wide whitespace-nowrap',
        'transition-[transform,opacity,box-shadow,background-color,color,border-color] duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page',
        'disabled:opacity-50 disabled:pointer-events-none',
        'active:scale-[0.98]',
        variantClasses(variant),
        sizeClasses(size),
        className,
      )}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
