import { cn } from '../../lib/utils';

/**
 * SolveX logo mark — an integral sign (∫, which also reads as an "S") with a
 * small "x": "∫x". Size it via `className` (e.g. "w-8 h-8"); the mark scales.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg bg-accent-muted flex items-center justify-center', className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="w-[60%] h-[60%] text-accent"
        aria-hidden="true"
      >
        <path
          d="M18 8.5C18 5.5 13.5 5.5 13.5 9.5C13.5 13.5 14.5 18 14.5 22.5C14.5 26.5 10 26.5 10 23"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M19.8 14L24.8 19M24.8 14L19.8 19"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
