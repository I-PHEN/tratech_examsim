import { describe, it, expect } from 'vitest';
import { parseModelOutput } from './scheduleAiParse';

describe('parseModelOutput', () => {
  it('parses clean JSON with message + proposals', () => {
    const out = parseModelOutput('{"message":"Here you go","proposals":[{"a":1}]}');
    expect(out.message).toBe('Here you go');
    expect(out.proposals).toEqual([{ a: 1 }]);
  });

  it('strips a ```json fenced block', () => {
    const out = parseModelOutput('```json\n{"message":"hi","proposals":[]}\n```');
    expect(out.message).toBe('hi');
    expect(out.proposals).toEqual([]);
  });

  it('defaults proposals to [] when key is missing', () => {
    const out = parseModelOutput('{"message":"none"}');
    expect(out.proposals).toEqual([]);
    expect(out.message).toBe('none');
  });

  it('defaults message to empty string when missing', () => {
    const out = parseModelOutput('{"proposals":[]}');
    expect(out.message).toBe('');
  });

  it('drops non-array proposals to []', () => {
    const out = parseModelOutput('{"message":"x","proposals":"nope"}');
    expect(out.proposals).toEqual([]);
  });

  it('throws on unparseable content', () => {
    expect(() => parseModelOutput('not json at all')).toThrow();
  });
});
