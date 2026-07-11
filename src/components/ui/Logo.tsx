import { cn } from '../../lib/utils';

/**
 * SolveX logo mark — a custom "X" where one stroke is straight (the problem)
 * and the other is a subtle curve (the solution path). Inline SVG so it
 * inherits the accent color via currentColor and renders crisp at any size.
 *
 * Pass `text-primary` (default), `bg-page`, or any color utility via className
 * to set the badge color — the inner mark stays white.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('select-none text-accent', className)}
      role="img"
      aria-label="SolveX"
      fill="none"
    >
      {/* Badge background — inherits text color (accent when used in chrome) */}
      <rect width="40" height="40" rx="10" fill="currentColor" />
      {/* White mark — straight stroke + curved stroke = problem meets solution */}
      <g stroke="white" strokeWidth="3" strokeLinecap="round" fill="none">
        <line x1="11.5" y1="11.5" x2="28.5" y2="28.5" />
        <path d="M 28.5 11.5 Q 22 18 19 20 Q 16 22 11.5 28.5" />
      </g>
    </svg>
  );
}
