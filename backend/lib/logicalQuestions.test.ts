import { describe, it, expect } from 'vitest';
import { groupIntoLogical } from './logicalQuestions';

describe('groupIntoLogical', () => {
  it('passes standalone rows through as one unit each', () => {
    const out = groupIntoLogical([
      { id: 'a', question_group_id: null, part_index: null },
      { id: 'b', question_group_id: null, part_index: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((u) => u.lead.id)).toEqual(['a', 'b']);
    expect(out.map((u) => u.memberIds)).toEqual([['a'], ['b']]);
  });

  it('folds a group into ONE unit led by the lowest part_index', () => {
    const out = groupIntoLogical([
      { id: 'p2', question_group_id: 'g1', part_index: 1 },
      { id: 'p1', question_group_id: 'g1', part_index: 0 },
      { id: 'p3', question_group_id: 'g1', part_index: 2 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lead.id).toBe('p1');
    expect(out[0].memberIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('preserves first-seen order of logical units and mixes groups with standalones', () => {
    const out = groupIntoLogical([
      { id: 's1', question_group_id: null, part_index: null },
      { id: 'gA-b', question_group_id: 'gA', part_index: 1 },
      { id: 's2', question_group_id: null, part_index: null },
      { id: 'gA-a', question_group_id: 'gA', part_index: 0 },
    ]);
    expect(out.map((u) => u.lead.id)).toEqual(['s1', 'gA-a', 's2']);
    expect(out.find((u) => u.lead.id === 'gA-a')!.memberIds).toEqual(['gA-a', 'gA-b']);
  });
});
