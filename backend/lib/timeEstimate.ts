// backend/lib/timeEstimate.ts

export type QuestionType = 'mcq' | 'calc';
type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Default solve-time (minutes) when a question has no explicit estimate. Keyed
 * by type then difficulty. Tunable.
 */
const FALLBACK: Record<QuestionType, Record<Difficulty, number>> = {
  mcq: { easy: 1, medium: 2, hard: 3 },
  calc: { easy: 5, medium: 12, hard: 25 },
};

/** Fallback minutes for a type+difficulty; a null/unknown difficulty is treated as medium. */
export function fallbackMinutes(type: QuestionType, difficulty: string | null): number {
  const d: Difficulty =
    difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
      ? difficulty
      : 'medium';
  return FALLBACK[type][d];
}

/** Minutes for one logical question: the explicit estimate, else the fallback. */
export function questionMinutes(q: {
  type: QuestionType;
  difficulty: string | null;
  estimated_minutes: number | null;
}): number {
  return q.estimated_minutes != null ? q.estimated_minutes : fallbackMinutes(q.type, q.difficulty);
}

/** Add a 15% cushion and round UP to the next 5 minutes; never below 5. */
export function bufferAndRound(minutes: number): number {
  const buffered = minutes * 1.15;
  const rounded = Math.ceil(buffered / 5) * 5;
  return Math.max(5, rounded);
}

/**
 * Recommended practice duration for `count` questions drawn from a pool whose
 * per-logical-question minutes are `perQuestionMinutes`. If the pool is no larger
 * than `count`, the student will get all of them, so sum directly; otherwise use
 * the pool average scaled to `count`. Then apply the buffer. Empty pool → 0.
 */
export function recommendMinutes(perQuestionMinutes: number[], count: number): number {
  const n = perQuestionMinutes.length;
  if (n === 0) return 0;
  const sum = perQuestionMinutes.reduce((s, m) => s + m, 0);
  const base = n <= count ? sum : (sum / n) * count;
  return bufferAndRound(base);
}
