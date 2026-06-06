import { describe, it, expect } from 'vitest';
import { toYearLevel, toSemester } from './period';

describe('period normalisers', () => {
  it('parses "Year 3" → 3', () => expect(toYearLevel('Year 3')).toBe(3));
  it('parses bare "3" → 3', () => expect(toYearLevel('3')).toBe(3));
  it('parses "Sem 2" → 2', () => expect(toSemester('Sem 2')).toBe(2));
  it('defaults missing/blank → 1', () => {
    expect(toYearLevel(undefined)).toBe(1);
    expect(toYearLevel('')).toBe(1);
    expect(toSemester(null)).toBe(1);
  });
});
