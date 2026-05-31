import { supabase } from '../lib/supabase';

export type MasteryState = 'not_started' | 'in_progress' | 'scored';

export interface MasteryResult {
  state: MasteryState;
  mastery: number; // 0-100, rounded
  answered_count: number;
}

const HALF_LIFE = 15; // weight halves every ~15 answers
const SCORED_THRESHOLD = 4;

/**
 * Recency-weighted mastery. `orderedPoints` is newest-first; each entry is a
 * 0..1 per-answer score. Recent answers dominate via an attempt-order half-life.
 */
export function computeMastery(orderedPoints: number[]): MasteryResult {
  const answered_count = orderedPoints.length;
  if (answered_count === 0) return { state: 'not_started', mastery: 0, answered_count: 0 };

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < orderedPoints.length; i++) {
    const w = Math.pow(0.5, i / HALF_LIFE);
    weightedSum += w * orderedPoints[i];
    weightTotal += w;
  }
  const mastery = Math.round((weightedSum / weightTotal) * 100);
  const state: MasteryState = answered_count >= SCORED_THRESHOLD ? 'scored' : 'in_progress';
  return { state, mastery, answered_count };
}

export interface TopicMastery {
  topic_id: string;
  state: MasteryState;
  mastery: number;
  answered_count: number;
}

/**
 * Per-topic recency-weighted mastery for one user within a course. Pulls the
 * user's graded answers (points not null) for that course, newest-first, groups
 * by topic, and runs computeMastery on each group.
 */
export async function getCourseMastery(
  uid: string,
  programCourseId: string
): Promise<TopicMastery[]> {
  const { data, error } = await supabase
    .from('session_answers')
    .select(
      'points, answered_at, questions!inner(topic_id, program_course_id), sessions!inner(user_uid)'
    )
    .eq('sessions.user_uid', uid)
    .eq('questions.program_course_id', programCourseId)
    .not('points', 'is', null)
    .order('answered_at', { ascending: false });
  if (error) throw error;

  const byTopic = new Map<string, number[]>();
  for (const row of (data ?? []) as unknown as Array<{
    points: number | null;
    questions: { topic_id: string } | { topic_id: string }[] | null;
  }>) {
    const q = Array.isArray(row.questions) ? row.questions[0] : row.questions;
    const tid = q?.topic_id;
    if (!tid || row.points == null) continue;
    const arr = byTopic.get(tid) ?? [];
    arr.push(row.points); // already newest-first from the ORDER BY
    byTopic.set(tid, arr);
  }

  return Array.from(byTopic.entries()).map(([topic_id, points]) => ({
    topic_id,
    ...computeMastery(points),
  }));
}
