import { supabase } from '../lib/supabase';
import { mapAssets, type QuestionAsset } from './questionService';

export async function addBookmark(uid: string, questionId: string): Promise<void> {
  const { error } = await supabase
    .from('bookmarked_questions')
    .upsert({ user_uid: uid, question_id: questionId }, { onConflict: 'user_uid,question_id' });
  if (error) throw error;
}

export async function removeBookmark(uid: string, questionId: string): Promise<void> {
  const { error } = await supabase
    .from('bookmarked_questions')
    .delete()
    .eq('user_uid', uid)
    .eq('question_id', questionId);
  if (error) throw error;
}

/** Question ids the user has bookmarked among the given ids (for review flags). */
export async function bookmarkedIdsAmong(uid: string, questionIds: string[]): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('bookmarked_questions')
    .select('question_id')
    .eq('user_uid', uid)
    .in('question_id', questionIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.question_id as string));
}

export interface SavedQuestion {
  id: string;
  topic_id: string;
  topic_name: string | null;
  program_course_id: string;
  course_name: string | null;
  type: 'mcq' | 'calc';
  prompt: string;
  explanation: string | null;
  created_at: string;
  /** Most recent finished session containing this question, so review can open it. */
  session_id: string | null;
  assets: QuestionAsset[];
}

/**
 * Saved questions, newest-bookmark-first, with content. Scoped to one course
 * when `programCourseId` is given, otherwise across every course. Each item
 * carries the latest session that contained it so review can jump to it.
 */
export async function listBookmarks(
  uid: string,
  programCourseId?: string
): Promise<SavedQuestion[]> {
  let query = supabase
    .from('bookmarked_questions')
    .select(
      'created_at, question_id, questions!inner(id, type, topic_id, program_course_id, ' +
        'question_content(prompt, explanation), topics(name), program_courses(courses(name)), ' +
        'question_assets(id, storage_path, mime_type, position, kind))'
    )
    .eq('user_uid', uid)
    .order('created_at', { ascending: false });
  if (programCourseId) query = query.eq('questions.program_course_id', programCourseId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    created_at: string;
    questions: {
      id: string;
      type: 'mcq' | 'calc';
      topic_id: string;
      program_course_id: string;
      question_content: { prompt: string; explanation: string | null } | { prompt: string; explanation: string | null }[] | null;
      topics: { name: string } | { name: string }[] | null;
      program_courses: { courses: { name: string } | { name: string }[] | null } | { courses: { name: string } | { name: string }[] | null }[] | null;
      question_assets: Array<{ id: string; storage_path: string; mime_type: string; position: number }> | null;
    };
  }>;

  // Map each bookmarked question to the most recent finished session that
  // included it (sessions persist their picked question_ids).
  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('id, question_ids, started_at')
    .eq('user_uid', uid)
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false });
  const sessionForQuestion = (questionId: string): string | null =>
    (sessionRows ?? []).find(
      (s) => Array.isArray((s as { question_ids: string[] | null }).question_ids) &&
        (s as { question_ids: string[] }).question_ids.includes(questionId)
    )?.id ?? null;

  return Promise.all(
    rows.map(async (r) => {
      const q = r.questions;
      const content = Array.isArray(q.question_content) ? q.question_content[0] : q.question_content;
      const topic = Array.isArray(q.topics) ? q.topics[0] : q.topics;
      const pc = Array.isArray(q.program_courses) ? q.program_courses[0] : q.program_courses;
      const course = pc ? (Array.isArray(pc.courses) ? pc.courses[0] : pc.courses) : null;
      return {
        id: q.id,
        topic_id: q.topic_id,
        topic_name: topic?.name ?? null,
        program_course_id: q.program_course_id,
        course_name: course?.name ?? null,
        type: q.type,
        prompt: content?.prompt ?? '',
        explanation: content?.explanation ?? null,
        created_at: r.created_at,
        session_id: sessionForQuestion(q.id),
        assets: await mapAssets(q.question_assets),
      };
    })
  );
}
