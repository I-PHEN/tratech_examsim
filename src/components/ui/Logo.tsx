import { cn } from '../../lib/utils';

/**
 * SolveX logo mark — the ∫X brand image (a slim integral reading as "S" beside a
 * bold "X"). Transparent PNG served from /public. Size it via `className`
 * (e.g. "w-8 h-8"); it scales with object-contain.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/solvex-logo.png"
      alt="SolveX"
      className={cn('object-contain select-none', className)}
      draggable={false}
    />
  );
}
