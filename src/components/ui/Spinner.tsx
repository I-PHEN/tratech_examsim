import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type Size = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: Size;
  className?: string;
  label?: string;
}

const SIZE_MAP: Record<Size, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center gap-3', className)} role="status">
      <Loader2 className={cn('animate-spin text-text-secondary', SIZE_MAP[size])} />
      {label && <span className="text-sm text-text-secondary">{label}</span>}
    </div>
  );
}
