export type MasteryState = 'not_started' | 'in_progress' | 'scored';

export interface MasteryResult {
  state: MasteryState;
  mastery: number; // 0-100, rounded
  answered_count: number;
}

const HALF_LIFE = 15; // weight halves every ~15 answers
const SCORED_THRESHOLD = 4;

/**
 * Recency-weighted mastery. `orderedPoints` is newest-first; each entry is a
 * 0..1 per-answer score. Recent answers dominate via an attempt-order half-life.
 */
export function computeMastery(orderedPoints: number[]): MasteryResult {
  const answered_count = orderedPoints.length;
  if (answered_count === 0) return { state: 'not_started', mastery: 0, answered_count: 0 };

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < orderedPoints.length; i++) {
    const w = Math.pow(0.5, i / HALF_LIFE);
    weightedSum += w * orderedPoints[i];
    weightTotal += w;
  }
  const mastery = Math.round((weightedSum / weightTotal) * 100);
  const state: MasteryState = answered_count >= SCORED_THRESHOLD ? 'scored' : 'in_progress';
  return { state, mastery, answered_count };
}
