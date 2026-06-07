// backend/lib/timeEstimate.test.ts
import { describe, it, expect } from 'vitest';
import { fallbackMinutes, questionMinutes, bufferAndRound, recommendMinutes } from './timeEstimate';

describe('fallbackMinutes', () => {
  it('uses the type+difficulty table', () => {
    expect(fallbackMinutes('mcq', 'easy')).toBe(1);
    expect(fallbackMinutes('mcq', 'hard')).toBe(3);
    expect(fallbackMinutes('calc', 'easy')).toBe(5);
    expect(fallbackMinutes('calc', 'medium')).toBe(12);
    expect(fallbackMinutes('calc', 'hard')).toBe(25);
  });
  it('defaults a null/unknown difficulty to medium', () => {
    expect(fallbackMinutes('calc', null)).toBe(12);
  });
});

describe('questionMinutes', () => {
  it('prefers the explicit estimate', () => {
    expect(questionMinutes({ type: 'calc', difficulty: 'hard', estimated_minutes: 30 })).toBe(30);
  });
  it('falls back when estimate is null', () => {
    expect(questionMinutes({ type: 'calc', difficulty: 'hard', estimated_minutes: null })).toBe(25);
  });
});

describe('bufferAndRound', () => {
  it('adds 15% and rounds UP to the next 5 minutes', () => {
    expect(bufferAndRound(30)).toBe(35);
    expect(bufferAndRound(10)).toBe(15);
  });
  it('never returns less than 5', () => {
    expect(bufferAndRound(0)).toBe(5);
    expect(bufferAndRound(1)).toBe(5);
  });
});

describe('recommendMinutes', () => {
  it('sums all estimates when the pool is no larger than count', () => {
    expect(recommendMinutes([5, 25], 2)).toBe(35);
    expect(recommendMinutes([5, 25], 10)).toBe(35);
  });
  it('scales the average by count when the pool is larger than count', () => {
    expect(recommendMinutes([10, 20, 30], 2)).toBe(50);
  });
  it('returns 0 for an empty pool', () => {
    expect(recommendMinutes([], 5)).toBe(0);
  });
  it('uses the sum path when pool size equals count (boundary)', () => {
    // sum = 60 -> *1.15 = 69 -> 70
    expect(recommendMinutes([10, 20, 30], 3)).toBe(70);
  });
  it('uses the average path when pool is one larger than count (boundary)', () => {
    // avg = 100/4 = 25; *3 = 75; *1.15 = 86.25 -> 90
    expect(recommendMinutes([10, 20, 30, 40], 3)).toBe(90);
  });
});
