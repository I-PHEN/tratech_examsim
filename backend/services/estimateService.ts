import { supabase } from '../lib/supabase';
import { groupIntoLogical } from '../lib/logicalQuestions';
import { questionMinutes, recommendMinutes, type QuestionType } from '../lib/timeEstimate';
import { DEFAULT_COUNT, scopesForMode } from '../lib/sessionConfig';
import type { SessionPickInput } from '../schemas/session';

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

  const buildQuery = (withDifficulty: boolean) => {
    let q = supabase
      .from('questions')
      .select('id, type, difficulty, estimated_minutes, question_group_id, part_index')
      .eq('program_course_id', input.program_course_id)
      .in('exam_scope', scopes);
    if (input.mode === 'practice' && input.topic_id) q = q.eq('topic_id', input.topic_id);
    if (withDifficulty && input.difficulty && input.mode !== 'diagnostic') {
      q = q.eq('difficulty', input.difficulty);
    }
    return q;
  };

  const { data, error } = await buildQuery(true);
  if (error) throw error;
  let rows = (data ?? []) as EstimateRow[];

  // Mirror routingService's difficulty fallback: if the requested difficulty has
  // no questions, the picker serves from the full pool — so estimate from it too,
  // rather than returning 0 and leaving the student with the bare default.
  if (rows.length === 0 && input.difficulty && input.mode !== 'diagnostic') {
    const { data: relaxed, error: relaxedErr } = await buildQuery(false);
    if (relaxedErr) throw relaxedErr;
    rows = (relaxed ?? []) as EstimateRow[];
  }
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
