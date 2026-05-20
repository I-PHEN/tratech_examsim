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

/** Optional academic-period scope. Both fields are independently optional — when
 * present we narrow by `program_courses.year_level`/`semester`, so a student
 * who just moved up to Year 2 sees a fresh dashboard automatically. */
export interface PeriodScope {
  yearLevel?: number;
  semester?: number;
}

export async function overview(uid: string, scope?: PeriodScope): Promise<OverviewStats> {
  // Always inner-join program_courses so the filter columns exist whenever a
  // scope is passed; the join cost is negligible and keeping the select string
  // literal lets Supabase's type inference work.
  let aq = supabase
    .from('session_answers')
    .select('is_correct, time_ms, sessions!inner(user_uid, program_courses!inner(year_level, semester))')
    .eq('sessions.user_uid', uid);
  if (scope?.yearLevel != null) aq = aq.eq('sessions.program_courses.year_level', scope.yearLevel);
  if (scope?.semester != null) aq = aq.eq('sessions.program_courses.semester', scope.semester);

  const { data: answers, error: aErr } = await aq;
  if (aErr) throw aErr;

  const rows = (answers ?? []) as Array<{ is_correct: boolean | null; time_ms: number | null }>;
  const totalAttempted = rows.length;
  const totalCorrect = rows.filter((r) => r.is_correct === true).length;
  const totalTime = rows.reduce((s, r) => s + (r.time_ms ?? 0), 0);

  let sq = supabase
    .from('sessions')
    .select('id, program_courses!inner(year_level, semester)', { count: 'exact', head: true })
    .eq('user_uid', uid)
    .not('finished_at', 'is', null);
  if (scope?.yearLevel != null) sq = sq.eq('program_courses.year_level', scope.yearLevel);
  if (scope?.semester != null) sq = sq.eq('program_courses.semester', scope.semester);

  const { count: sessionsCompleted, error: sErr } = await sq;
  if (sErr) throw sErr;

  return {
    total_attempted: totalAttempted,
    total_correct: totalCorrect,
    accuracy: totalAttempted > 0 ? totalCorrect / totalAttempted : 0,
    total_time_ms: totalTime,
    sessions_completed: sessionsCompleted ?? 0,
  };
}

export async function byTopic(
  uid: string,
  programCourseId?: string,
  scope?: PeriodScope
): Promise<TopicStat[]> {
  let q = supabase
    .from('session_answers')
    .select(
      'is_correct, questions!inner(topic_id, program_course_id, topics(name)), sessions!inner(user_uid, program_courses!inner(year_level, semester))'
    )
    .eq('sessions.user_uid', uid);
  if (programCourseId) q = q.eq('questions.program_course_id', programCourseId);
  if (scope?.yearLevel != null) q = q.eq('sessions.program_courses.year_level', scope.yearLevel);
  if (scope?.semester != null) q = q.eq('sessions.program_courses.semester', scope.semester);

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

export async function accuracyTrend(
  uid: string,
  limit = 10,
  scope?: PeriodScope
): Promise<TrendPoint[]> {
  let q = supabase
    .from('sessions')
    .select('id, mode, score, total_questions, finished_at, program_courses!inner(year_level, semester)')
    .eq('user_uid', uid)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(limit);
  if (scope?.yearLevel != null) q = q.eq('program_courses.year_level', scope.yearLevel);
  if (scope?.semester != null) q = q.eq('program_courses.semester', scope.semester);

  const { data, error } = await q;
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

export async function byDifficulty(uid: string, scope?: PeriodScope): Promise<DifficultyBreakdown> {
  let q = supabase
    .from('session_answers')
    .select('is_correct, questions!inner(difficulty), sessions!inner(user_uid, program_courses!inner(year_level, semester))')
    .eq('sessions.user_uid', uid);
  if (scope?.yearLevel != null) q = q.eq('sessions.program_courses.year_level', scope.yearLevel);
  if (scope?.semester != null) q = q.eq('sessions.program_courses.semester', scope.semester);

  const { data, error } = await q;
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
