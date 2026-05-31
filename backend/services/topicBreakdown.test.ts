import { describe, it, expect } from 'vitest';
import { summarizeByTopic } from './topicBreakdown';

describe('summarizeByTopic', () => {
  it('returns empty for no rows', () => {
    expect(summarizeByTopic([])).toEqual([]);
  });

  it('groups by topic and computes accuracy', () => {
    const out = summarizeByTopic([
      { topic_id: 't1', topic_name: 'Kinetics', is_correct: true },
      { topic_id: 't1', topic_name: 'Kinetics', is_correct: false },
      { topic_id: 't2', topic_name: 'Reactors', is_correct: true },
    ]);
    const t1 = out.find((e) => e.topic_id === 't1')!;
    const t2 = out.find((e) => e.topic_id === 't2')!;
    expect(t1).toMatchObject({ topic_name: 'Kinetics', correct: 1, total: 2, accuracy: 0.5 });
    expect(t2).toMatchObject({ correct: 1, total: 1, accuracy: 1 });
  });

  it('sorts weakest-first', () => {
    const out = summarizeByTopic([
      { topic_id: 'strong', topic_name: 'A', is_correct: true },
      { topic_id: 'weak', topic_name: 'B', is_correct: false },
    ]);
    expect(out[0].topic_id).toBe('weak');
    expect(out[1].topic_id).toBe('strong');
  });

  it('treats null is_correct as not correct', () => {
    const out = summarizeByTopic([
      { topic_id: 't1', topic_name: 'X', is_correct: null },
      { topic_id: 't1', topic_name: 'X', is_correct: true },
    ]);
    expect(out[0]).toMatchObject({ correct: 1, total: 2, accuracy: 0.5 });
  });
});
