import { describe, it, expect } from 'vitest';
import { aggregateLogicalScore } from './logicalScore';

describe('aggregateLogicalScore', () => {
  it('sums standalone points and counts each once', () => {
    const out = aggregateLogicalScore([
      { question_id: 'a', group_id: null, points: 1 },
      { question_id: 'b', group_id: null, points: 0 },
      { question_id: 'c', group_id: null, points: 0.5 },
    ]);
    expect(out).toEqual({ score: 1.5, logicalCount: 3 });
  });

  it('averages a group into one contribution worth one question', () => {
    const out = aggregateLogicalScore([
      { question_id: 'g-a', group_id: 'g', points: 1 },
      { question_id: 'g-b', group_id: 'g', points: 0 },
      { question_id: 'g-c', group_id: 'g', points: 1 },
    ]);
    // mean(1,0,1) = 0.666... -> rounded to 0.67; one logical question
    expect(out.score).toBeCloseTo(0.67, 2);
    expect(out.logicalCount).toBe(1);
  });

  it('mixes groups and standalones', () => {
    const out = aggregateLogicalScore([
      { question_id: 's', group_id: null, points: 1 },
      { question_id: 'g-a', group_id: 'g', points: 1 },
      { question_id: 'g-b', group_id: 'g', points: 0 },
    ]);
    expect(out.score).toBe(1.5); // 1 (standalone) + 0.5 (group mean)
    expect(out.logicalCount).toBe(2);
  });
});
