import { supabase } from '../lib/supabase';

export interface OverviewStats {
  total_attempted: number;
  total_correct: number;
  accuracy: number;
  total_time_ms: number;
  sessions_completed: number;
}

export interface TopicStat {
  topic_id: string;
  topic_name: string | null;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface TrendPoint {
  session_id: string;
  mode: string;
  accuracy: number;
  finished_at: string;
}

export interface DifficultyBreakdown {
  easy: { attempts: number; correct: number; accuracy: number };
  medium: { attempts: number; correct: number; accuracy: number };
  hard: { attempts: number; correct: number; accuracy: number };
}

export async function overview(uid: string): Promise<OverviewStats> {
  const { data: answers, error: aErr } = await supabase
    .from('session_answers')
    .select('is_correct, time_ms, sessions!inner(user_uid)')
    .eq('sessions.user_uid', uid);
  if (aErr) throw aErr;

  const rows = (answers ?? []) as Array<{ is_correct: boolean | null; time_ms: number | null }>;
  const totalAttempted = rows.length;
  const totalCorrect = rows.filter((r) => r.is_correct === true).length;
  const totalTime = rows.reduce((s, r) => s + (r.time_ms ?? 0), 0);

  const { count: sessionsCompleted, error: sErr } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_uid', uid)
    .not('finished_at', 'is', null);
  if (sErr) throw sErr;

  return {
    total_attempted: totalAttempted,
    total_correct: totalCorrect,
    accuracy: totalAttempted > 0 ? totalCorrect / totalAttempted : 0,
    total_time_ms: totalTime,
    sessions_completed: sessionsCompleted ?? 0,
  };
}

export async function byTopic(uid: string, programCourseId?: string): Promise<TopicStat[]> {
  let q = supabase
    .from('session_answers')
    .select('is_correct, questions!inner(topic_id, program_course_id, topics(name)), sessions!inner(user_uid)')
    .eq('sessions.user_uid', uid);
  if (programCourseId) q = q.eq('questions.program_course_id', programCourseId);

  const { data, error } = await q;
  if (error) throw error;

  const buckets = new Map<string, { topic_name: string | null; attempts: number; correct: number }>();
  for (const row of (data ?? []) as unknown as Array<{
    is_correct: boolean | null;
    questions:
      | { topic_id: string; topics: { name: string } | { name: string }[] | null }
      | { topic_id: string; topics: { name: string } | { name: string }[] | null }[]
      | null;
  }>) {
    const q = Array.isArray(row.questions) ? row.questions[0] : row.questions;
    const tid = q?.topic_id;
    if (!tid) continue;
    const topicRel = Array.isArray(q?.topics) ? q?.topics[0] : q?.topics;
    const bucket = buckets.get(tid) ?? {
      topic_name: topicRel?.name ?? null,
      attempts: 0,
      correct: 0,
    };
    bucket.attempts += 1;
    if (row.is_correct === true) bucket.correct += 1;
    buckets.set(tid, bucket);
  }

  return Array.from(buckets.entries()).map(([topic_id, b]) => ({
    topic_id,
    topic_name: b.topic_name,
    attempts: b.attempts,
    correct: b.correct,
    accuracy: b.attempts > 0 ? b.correct / b.attempts : 0,
  }));
}

export async function accuracyTrend(uid: string, limit = 10): Promise<TrendPoint[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, mode, score, total_questions, finished_at')
    .eq('user_uid', uid)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    mode: string;
    score: number | null;
    total_questions: number;
    finished_at: string;
  }>)
    .reverse()
    .map((r) => ({
      session_id: r.id,
      mode: r.mode,
      accuracy: r.total_questions > 0 ? (r.score ?? 0) / r.total_questions : 0,
      finished_at: r.finished_at,
    }));
}

export async function byDifficulty(uid: string): Promise<DifficultyBreakdown> {
  const { data, error } = await supabase
    .from('session_answers')
    .select('is_correct, questions!inner(difficulty), sessions!inner(user_uid)')
    .eq('sessions.user_uid', uid);
  if (error) throw error;

  const result: DifficultyBreakdown = {
    easy: { attempts: 0, correct: 0, accuracy: 0 },
    medium: { attempts: 0, correct: 0, accuracy: 0 },
    hard: { attempts: 0, correct: 0, accuracy: 0 },
  };

  for (const row of (data ?? []) as unknown as Array<{
    is_correct: boolean | null;
    questions:
      | { difficulty: 'easy' | 'medium' | 'hard' }
      | { difficulty: 'easy' | 'medium' | 'hard' }[]
      | null;
  }>) {
    const q = Array.isArray(row.questions) ? row.questions[0] : row.questions;
    const d = q?.difficulty;
    if (!d) continue;
    result[d].attempts += 1;
    if (row.is_correct === true) result[d].correct += 1;
  }

  for (const k of ['easy', 'medium', 'hard'] as const) {
    result[k].accuracy = result[k].attempts > 0 ? result[k].correct / result[k].attempts : 0;
  }
  return result;
}
