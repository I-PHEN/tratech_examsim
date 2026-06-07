import type { SessionPickInput } from '../schemas/session';

/** Default number of questions per study mode (when the caller omits `count`). */
export const DEFAULT_COUNT: Record<SessionPickInput['mode'], number> = {
  practice: 10,
  diagnostic: 20,
  midsem: 30,
  full_exam: 60,
};

/** Which `exam_scope` values a mode draws from. */
export function scopesForMode(
  mode: SessionPickInput['mode']
): Array<'midsem' | 'final' | 'both'> {
  if (mode === 'midsem') return ['midsem', 'both'];
  return ['midsem', 'final', 'both'];
}
