import { cn } from '../../lib/utils';

/**
 * SolveX logo mark — a geometric "X" in a rounded accent tile. Size it via
 * `className` (e.g. "w-8 h-8"); the mark scales to fit.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg bg-accent-muted flex items-center justify-center', className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="w-[56%] h-[56%] text-accent"
        aria-hidden="true"
      >
        <path
          d="M10 10L22 22M22 10L10 22"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
