import { describe, it, expect } from 'vitest';
import { computeMastery } from './masteryService';

describe('computeMastery', () => {
  it('returns not_started for no answers', () => {
    expect(computeMastery([])).toEqual({ state: 'not_started', mastery: 0, answered_count: 0 });
  });

  it('returns in_progress for 1-3 answers', () => {
    expect(computeMastery([1]).state).toBe('in_progress');
    expect(computeMastery([1, 0, 1]).state).toBe('in_progress');
    expect(computeMastery([1, 0, 1]).answered_count).toBe(3);
  });

  it('returns scored at 4+ answers', () => {
    expect(computeMastery([1, 1, 1, 1])).toEqual({ state: 'scored', mastery: 100, answered_count: 4 });
    expect(computeMastery([0, 0, 0, 0]).mastery).toBe(0);
  });

  it('weights recent answers more heavily (newest-first input)', () => {
    const recentCorrect = computeMastery([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const recentWrong = computeMastery([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(recentCorrect.mastery).toBeGreaterThan(55);
    expect(recentWrong.mastery).toBeLessThan(45);
    expect(recentCorrect.mastery).toBeGreaterThan(recentWrong.mastery);
  });

  it('honours partial-credit points', () => {
    expect(computeMastery([0.5, 0.5, 0.5, 0.5]).mastery).toBe(50);
  });
});
