import { cn } from '../../lib/utils';

/**
 * SolveX logo mark — a slim integral sign (∫, which also reads as an "S")
 * beside a bold "X": "∫X". Size it via `className` (e.g. "w-8 h-8").
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg bg-accent-muted flex items-center justify-center', className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="w-[64%] h-[64%] text-accent"
        aria-hidden="true"
      >
        <path
          d="M12 8.5C12 5.5 7.5 5.5 7.5 9.5C7.5 13.5 8.5 18 8.5 22.5C8.5 26.5 4 26.5 4 23"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M13 9L27 23M27 9L13 23"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
