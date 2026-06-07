import { supabase } from '../lib/supabase';
import { groupIntoLogical } from '../lib/logicalQuestions';
import { questionMinutes, recommendMinutes, type QuestionType } from '../lib/timeEstimate';
import type { SessionPickInput } from '../schemas/session';

const DEFAULT_COUNT: Record<SessionPickInput['mode'], number> = {
  practice: 10,
  diagnostic: 20,
  midsem: 30,
  full_exam: 60,
};

function scopesForMode(mode: SessionPickInput['mode']): Array<'midsem' | 'final' | 'both'> {
  if (mode === 'midsem') return ['midsem', 'both'];
  return ['midsem', 'final', 'both'];
}

interface EstimateRow {
  id: string;
  type: QuestionType;
  difficulty: string | null;
  estimated_minutes: number | null;
  question_group_id: string | null;
  part_index: number | null;
}

/**
 * Recommended practice duration (minutes) for the given course/mode/topic/
 * difficulty and question count. Counts a multi-part group as ONE logical
 * question (estimate taken from its lead part), falls back to a type+difficulty
 * table for un-estimated questions, and applies the standard buffer. Returns 0
 * when the pool is empty (caller leaves the existing default in place).
 */
export async function recommendedPracticeMinutes(input: SessionPickInput): Promise<number> {
  const count = input.count ?? DEFAULT_COUNT[input.mode];
  const scopes = scopesForMode(input.mode);

  let q = supabase
    .from('questions')
    .select('id, type, difficulty, estimated_minutes, question_group_id, part_index')
    .eq('program_course_id', input.program_course_id)
    .in('exam_scope', scopes);
  if (input.mode === 'practice' && input.topic_id) q = q.eq('topic_id', input.topic_id);
  if (input.difficulty && input.mode !== 'diagnostic') q = q.eq('difficulty', input.difficulty);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as EstimateRow[];
  // Collapse multi-part groups to one logical question (the lead part carries the
  // estimate), then map each to its minutes (explicit estimate or fallback).
  const perQuestion = groupIntoLogical(rows).map((u) =>
    questionMinutes({
      type: u.lead.type,
      difficulty: u.lead.difficulty,
      estimated_minutes: u.lead.estimated_minutes,
    })
  );
  return recommendMinutes(perQuestion, count);
}
