import { describe, it, expect } from 'vitest';
import { summarizeResults } from './resultsSummary';

describe('summarizeResults', () => {
  it('counts standalone items individually', () => {
    const out = summarizeResults([
      { groupId: null, isCorrect: true, isUnanswered: false },
      { groupId: null, isCorrect: false, isUnanswered: false },
      { groupId: null, isCorrect: null, isUnanswered: true },
    ]);
    expect(out).toEqual({ total: 3, correct: 1, incorrect: 1, unanswered: 1 });
  });

  it('collapses a group into one question (all parts correct => correct)', () => {
    const out = summarizeResults([
      { groupId: 'g', isCorrect: true, isUnanswered: false },
      { groupId: 'g', isCorrect: true, isUnanswered: false },
    ]);
    expect(out).toEqual({ total: 1, correct: 1, incorrect: 0, unanswered: 0 });
  });

  it('a group with any wrong part counts as one incorrect', () => {
    const out = summarizeResults([
      { groupId: 'g', isCorrect: true, isUnanswered: false },
      { groupId: 'g', isCorrect: false, isUnanswered: false },
    ]);
    expect(out).toEqual({ total: 1, correct: 0, incorrect: 1, unanswered: 0 });
  });

  it('a group is unanswered only when every part is unanswered', () => {
    const out = summarizeResults([
      { groupId: 'g', isCorrect: null, isUnanswered: true },
      { groupId: 'g', isCorrect: null, isUnanswered: true },
    ]);
    expect(out).toEqual({ total: 1, correct: 0, incorrect: 0, unanswered: 1 });
  });
});
