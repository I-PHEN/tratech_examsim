import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';
import { pickSessionQuestions } from './routingService';
import { mapAssets, type QuestionAsset, type QuestionContent, type McqOption } from './questionService';
import { shuffle } from '../lib/shuffle';
import { parallelMap } from '../lib/concurrency';
import { gradeWrittenAnswer } from './gradingService';
import type {
  SessionAnswerSubmitInput,
  SessionCreateInput,
  SessionFinishInput,
} from '../schemas/session';

export interface SessionRow {
  id: string;
  user_uid: string;
  program_course_id: string;
  mode: 'practice' | 'diagnostic' | 'midsem' | 'full_exam';
  topic_id: string | null;
  total_questions: number;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  duration_ms: number | null;
  paused_at: string | null;
  total_paused_ms: number;
}

const SESSION_COLUMNS =
  'id, user_uid, program_course_id, mode, topic_id, total_questions, started_at, finished_at, score, duration_ms, paused_at, total_paused_ms';

export interface SessionListItem extends SessionRow {
  course_name: string | null;
  topic_name: string | null;
  accuracy: number | null;
}

export interface SessionAnswerRow {
  id: string;
  session_id: string;
  question_id: string;
  position: number;
  picked_option_id: string | null;
  picked_text: string | null;
  is_correct: boolean | null;
  points: number | null;
  ai_feedback: string | null;
  time_ms: number | null;
  answered_at: string;
}

interface ReviewQuestion {
  id: string;
  type: 'mcq' | 'calc';
  difficulty: 'easy' | 'medium' | 'hard';
  exam_scope: 'midsem' | 'final' | 'both';
  topic_id: string;
  answer_type: 'exact' | 'range' | 'written' | null;
  question_group_id: string | null;
  part_label: string | null;
  part_index: number | null;
  content: QuestionContent;
  options: McqOption[];
  assets: QuestionAsset[];
}

export async function createSession(uid: string, input: SessionCreateInput) {
  const picked = await pickSessionQuestions({
    program_course_id: input.program_course_id,
    mode: input.mode,
    count: input.count,
    topic_id: input.topic_id,
    difficulty: input.difficulty,
  });

  if (picked.picked.length === 0) {
    throw new ApiError(
      404,
      'NO_QUESTIONS',
      'No questions found for that course / mode / filters. Add some via Admin → Manual Entry.'
    );
  }

  const { data: row, error } = await supabase
    .from('sessions')
    .insert({
      user_uid: uid,
      program_course_id: input.program_course_id,
      mode: input.mode,
      topic_id: input.topic_id ?? null,
      total_questions: picked.picked.length,
      // Persist the picked question ids in original order so any device can
      // resume the same exam with the same questions in the same positions.
      question_ids: picked.picked.map((q) => q.id),
    })
    .select('*')
    .single();
  if (error) throw error;

  return { session_id: row.id, picked: picked.picked };
}

async function evaluateAnswer(
  questionId: string,
  pickedOptionId: string | undefined,
  pickedText: string | undefined
): Promise<boolean | null> {
  const { data: question, error: qErr } = await supabase
    .from('questions')
    .select('id, type, answer_type')
    .eq('id', questionId)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!question) throw new ApiError(404, 'NOT_FOUND', 'Question not found');

  if (question.type === 'mcq') {
    if (!pickedOptionId) return null;
    const { data: opt, error: oErr } = await supabase
      .from('mcq_options')
      .select('id, is_correct, question_id')
      .eq('id', pickedOptionId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!opt) return null;
    if (opt.question_id !== questionId) return false;
    return opt.is_correct;
  }

  // Written answers are AI-graded later, at finishSession — not at submit time.
  if (question.answer_type === 'written') return null;

  if (!pickedText || pickedText.trim().length === 0) return null;
  const { data: content, error: cErr } = await supabase
    .from('question_content')
    .select('correct_answer, answer_tolerance')
    .eq('question_id', questionId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!content) return null;

  const expected = content.correct_answer ?? '';
  const got = pickedText.trim();

  if (question.answer_type === 'range') {
    const expectedNum = Number(expected);
    const gotNum = Number(got);
    const tol = Number(content.answer_tolerance ?? 0);
    if (Number.isFinite(expectedNum) && Number.isFinite(gotNum)) {
      return Math.abs(expectedNum - gotNum) <= tol;
    }
  }

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(expected) === norm(got);
}

export async function submitAnswer(
  uid: string,
  sessionId: string,
  input: SessionAnswerSubmitInput
): Promise<{ is_correct: boolean | null }> {
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, user_uid, finished_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  if (session.user_uid !== uid) throw new ApiError(403, 'FORBIDDEN', 'Not your session');
  if (session.finished_at) throw new ApiError(400, 'SESSION_FINISHED', 'Session already finished');

  const isCorrect = await evaluateAnswer(input.question_id, input.picked_option_id, input.picked_text);

  const { error: upsertErr } = await supabase
    .from('session_answers')
    .upsert(
      {
        session_id: sessionId,
        question_id: input.question_id,
        position: input.position,
        picked_option_id: input.picked_option_id ?? null,
        picked_text: input.picked_text ?? null,
        is_correct: isCorrect,
        time_ms: input.time_ms ?? null,
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,question_id' }
    );
  if (upsertErr) throw upsertErr;

  return { is_correct: isCorrect };
}

export async function finishSession(uid: string, sessionId: string, input: SessionFinishInput) {
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, user_uid, started_at, finished_at, score, total_questions, duration_ms')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  if (session.user_uid !== uid) throw new ApiError(403, 'FORBIDDEN', 'Not your session');

  if (session.finished_at) {
    return {
      score: session.score ?? 0,
      total: session.total_questions,
      accuracy: session.total_questions > 0 ? (session.score ?? 0) / session.total_questions : 0,
      finished_at: session.finished_at,
      duration_ms: session.duration_ms ?? 0,
    };
  }

  const { data: answers, error: aErr } = await supabase
    .from('session_answers')
    .select('id, question_id, picked_text, is_correct')
    .eq('session_id', sessionId);
  if (aErr) throw aErr;
  const answerRows = (answers ?? []) as Array<{
    id: string;
    question_id: string;
    picked_text: string | null;
    is_correct: boolean | null;
  }>;

  // Grading metadata for each answered question (model answer + solution).
  const gradedQuestionIds = Array.from(new Set(answerRows.map((a) => a.question_id)));
  const qMeta = new Map<
    string,
    { answer_type: string | null; prompt: string; correct_answer: string; explanation: string | null }
  >();
  if (gradedQuestionIds.length > 0) {
    const { data: qRows, error: qErr } = await supabase
      .from('questions')
      .select('id, answer_type, question_content(prompt, correct_answer, explanation)')
      .in('id', gradedQuestionIds);
    if (qErr) throw qErr;
    for (const row of qRows ?? []) {
      const r = row as unknown as {
        id: string;
        answer_type: string | null;
        question_content:
          | { prompt: string; correct_answer: string; explanation: string | null }
          | { prompt: string; correct_answer: string; explanation: string | null }[]
          | null;
      };
      const c = Array.isArray(r.question_content) ? r.question_content[0] : r.question_content;
      qMeta.set(r.id, {
        answer_type: r.answer_type,
        prompt: c?.prompt ?? '',
        correct_answer: c?.correct_answer ?? '',
        explanation: c?.explanation ?? null,
      });
    }
  }

  // Written answers are AI-graded now (concurrently); mcq/calc mirror is_correct.
  // `points` is 0–1 per answer and the session score is their sum (fractional).
  let scoreSum = 0;
  await parallelMap(answerRows, 4, async (a) => {
    const meta = qMeta.get(a.question_id);
    let pts = 0;
    if (meta?.answer_type === 'written') {
      const studentText = (a.picked_text ?? '').trim();
      if (!studentText) {
        await supabase
          .from('session_answers')
          .update({ points: 0, is_correct: false })
          .eq('id', a.id);
      } else {
        try {
          const grade = await gradeWrittenAnswer(
            meta.prompt,
            meta.correct_answer,
            meta.explanation,
            studentText
          );
          pts = grade.points;
          await supabase
            .from('session_answers')
            .update({ points: pts, ai_feedback: grade.feedback, is_correct: pts >= 0.5 })
            .eq('id', a.id);
        } catch {
          await supabase
            .from('session_answers')
            .update({
              points: 0,
              ai_feedback:
                'Automatic grading was unavailable — please review this answer manually.',
            })
            .eq('id', a.id);
        }
      }
    } else {
      pts = a.is_correct === true ? 1 : 0;
      await supabase.from('session_answers').update({ points: pts }).eq('id', a.id);
    }
    scoreSum += pts;
  });

  const score = Math.round(scoreSum * 100) / 100;
  const finishedAt = new Date();
  const durationMs =
    input.duration_ms ?? finishedAt.getTime() - new Date(session.started_at).getTime();

  const { error: updErr } = await supabase
    .from('sessions')
    .update({
      finished_at: finishedAt.toISOString(),
      score,
      duration_ms: durationMs,
    })
    .eq('id', sessionId);
  if (updErr) throw updErr;

  return {
    score,
    total: session.total_questions,
    accuracy: session.total_questions > 0 ? score / session.total_questions : 0,
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
  };
}

export async function listSessions(uid: string, limit = 20, offset = 0): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `${SESSION_COLUMNS}, program_courses!inner(courses(name)), topics(name)`
    )
    .eq('user_uid', uid)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as SessionRow & {
      program_courses: { courses: { name: string } | null } | null;
      topics: { name: string } | null;
    };
    const courseName = r.program_courses?.courses?.name ?? null;
    const topicName = r.topics?.name ?? null;
    const accuracy =
      r.score != null && r.total_questions > 0 ? r.score / r.total_questions : null;
    return {
      id: r.id,
      user_uid: r.user_uid,
      program_course_id: r.program_course_id,
      mode: r.mode,
      topic_id: r.topic_id,
      total_questions: r.total_questions,
      started_at: r.started_at,
      finished_at: r.finished_at,
      score: r.score,
      duration_ms: r.duration_ms,
      paused_at: r.paused_at,
      total_paused_ms: r.total_paused_ms,
      course_name: courseName,
      topic_name: topicName,
      accuracy,
    };
  });
}

export async function getSessionById(uid: string, sessionId: string) {
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select(
      `${SESSION_COLUMNS}, question_ids, program_courses!inner(courses(name)), topics(name)`
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  const s = session as unknown as SessionRow & {
    question_ids: string[] | null;
    program_courses: { courses: { name: string } | null } | null;
    topics: { name: string } | null;
  };
  if (s.user_uid !== uid) throw new ApiError(403, 'FORBIDDEN', 'Not your session');

  const { data: answers, error: aErr } = await supabase
    .from('session_answers')
    .select(
      'id, session_id, question_id, position, picked_option_id, picked_text, is_correct, points, ai_feedback, time_ms, answered_at'
    )
    .eq('session_id', sessionId)
    .order('position', { ascending: true });
  if (aErr) throw aErr;

  // Review must show EVERY question in the session — answered or not — so an
  // unanswered question (e.g. a skipped multi-part sub-part, or a blank submit)
  // still appears with its solution. Use the session's persisted question order;
  // fall back to answered ids for legacy sessions created before we stored it.
  const answeredIds = Array.from(new Set((answers ?? []).map((a) => a.question_id)));
  const orderedIds =
    Array.isArray(s.question_ids) && s.question_ids.length > 0
      ? s.question_ids
      : answeredIds;

  let questions: ReviewQuestion[] = [];
  if (orderedIds.length > 0) {
    const { data: full, error: qErr } = await supabase
      .from('questions')
      .select(
        'id, type, difficulty, exam_scope, topic_id, answer_type, ' +
          'question_group_id, part_label, part_index, ' +
          'question_content(prompt, explanation, correct_answer, answer_tolerance, unit), ' +
          'mcq_options(id, text, is_correct), ' +
          'question_assets(id, storage_path, mime_type, position)'
      )
      .in('id', orderedIds);
    if (qErr) throw qErr;

    questions = (full ?? []).map((row) => {
      const r = row as unknown as {
        id: string;
        type: 'mcq' | 'calc';
        difficulty: 'easy' | 'medium' | 'hard';
        exam_scope: 'midsem' | 'final' | 'both';
        topic_id: string;
        answer_type: 'exact' | 'range' | 'written' | null;
        question_group_id: string | null;
        part_label: string | null;
        part_index: number | null;
        question_content: QuestionContent | QuestionContent[] | null;
        mcq_options: McqOption[] | null;
        question_assets: Array<{ id: string; storage_path: string; mime_type: string; position: number }> | null;
      };
      const contentArr = Array.isArray(r.question_content)
        ? r.question_content
        : r.question_content
        ? [r.question_content]
        : [];
      const mcqOptions = r.type === 'mcq' ? shuffle(r.mcq_options ?? []) : [];
      return {
        id: r.id,
        type: r.type,
        difficulty: r.difficulty,
        exam_scope: r.exam_scope,
        topic_id: r.topic_id,
        answer_type: r.answer_type,
        question_group_id: r.question_group_id,
        part_label: r.part_label,
        part_index: r.part_index,
        content: contentArr[0],
        options: mcqOptions,
        assets: mapAssets(r.question_assets),
      };
    });

    // `.in()` does not preserve order — restore the exam order so the review
    // (and grouped multi-part numbering) renders questions as they were sat.
    const orderIndex = new Map(orderedIds.map((id, i) => [id, i]));
    questions.sort(
      (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
    );
  }

  const accuracy =
    s.score != null && s.total_questions > 0 ? s.score / s.total_questions : null;

  return {
    session: {
      id: s.id,
      program_course_id: s.program_course_id,
      mode: s.mode,
      topic_id: s.topic_id,
      total_questions: s.total_questions,
      started_at: s.started_at,
      finished_at: s.finished_at,
      score: s.score,
      duration_ms: s.duration_ms,
      paused_at: s.paused_at,
      total_paused_ms: s.total_paused_ms,
      course_name: s.program_courses?.courses?.name ?? null,
      topic_name: s.topics?.name ?? null,
      accuracy,
    },
    answers: (answers ?? []) as SessionAnswerRow[],
    questions,
  };
}

/**
 * Everything needed to rehydrate an in-progress exam on any device:
 *   - the session row (timer state, mode, course/topic names)
 *   - the picked questions in their original order (full content for the UI)
 *   - existing answers (so previously-typed responses are restored)
 *
 * `paused_at` is NOT reset here — that's done by the explicit `/resume` POST
 * the exam screen fires on mount.
 */
export async function getSessionResume(uid: string, sessionId: string) {
  const { data: sRow, error: sErr } = await supabase
    .from('sessions')
    .select(
      `${SESSION_COLUMNS}, question_ids, program_courses!inner(courses(name)), topics(name)`
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!sRow) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  const s = sRow as unknown as SessionRow & {
    question_ids: string[] | null;
    program_courses: { courses: { name: string } | null } | null;
    topics: { name: string } | null;
  };
  if (s.user_uid !== uid) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  if (s.finished_at) throw new ApiError(409, 'ALREADY_FINISHED', 'Session already finished');

  const orderedIds = Array.isArray(s.question_ids) ? s.question_ids : [];
  if (orderedIds.length === 0) {
    // Legacy session created before we persisted picked ids — fall back to
    // whatever the user already answered, in answered order.
    const { data: aRows } = await supabase
      .from('session_answers')
      .select('question_id, position')
      .eq('session_id', sessionId)
      .order('position', { ascending: true });
    for (const r of aRows ?? []) orderedIds.push((r as { question_id: string }).question_id);
  }

  // Hydrate questions in original picked order.
  let picked: Array<{
    id: string;
    type: 'mcq' | 'calc';
    difficulty: 'easy' | 'medium' | 'hard';
    exam_scope: 'midsem' | 'final' | 'both';
    topic_id: string;
    answer_type: 'exact' | 'range' | 'written' | null;
    question_group_id: string | null;
    part_label: string | null;
    part_index: number | null;
    content: QuestionContent;
    options?: McqOption[];
    assets: QuestionAsset[];
  }> = [];

  if (orderedIds.length > 0) {
    const { data: qRows, error: qErr } = await supabase
      .from('questions')
      .select(
        'id, program_course_id, topic_id, type, difficulty, exam_scope, answer_type, ' +
          'question_group_id, part_label, part_index, ' +
          'question_content(prompt, explanation, correct_answer, answer_tolerance, unit), ' +
          'mcq_options(id, text, is_correct), ' +
          'question_assets(id, storage_path, mime_type, position)'
      )
      .in('id', orderedIds);
    if (qErr) throw qErr;

    const byId = new Map<string, unknown>();
    for (const row of qRows ?? []) byId.set((row as unknown as { id: string }).id, row);

    picked = orderedIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => {
        const r = row as unknown as {
          id: string;
          type: 'mcq' | 'calc';
          difficulty: 'easy' | 'medium' | 'hard';
          exam_scope: 'midsem' | 'final' | 'both';
          topic_id: string;
          answer_type: 'exact' | 'range' | 'written' | null;
          question_group_id: string | null;
          part_label: string | null;
          part_index: number | null;
          question_content: QuestionContent | QuestionContent[] | null;
          mcq_options: McqOption[] | null;
          question_assets: Array<{ id: string; storage_path: string; mime_type: string; position: number }> | null;
        };
        const contentArr: QuestionContent[] = Array.isArray(r.question_content)
          ? r.question_content
          : r.question_content
          ? [r.question_content]
          : [];
        return {
          id: r.id,
          type: r.type,
          difficulty: r.difficulty,
          exam_scope: r.exam_scope,
          topic_id: r.topic_id,
          answer_type: r.answer_type,
          question_group_id: r.question_group_id,
          part_label: r.part_label,
          part_index: r.part_index,
          content: contentArr[0],
          options: r.type === 'mcq' ? r.mcq_options ?? [] : undefined,
          assets: mapAssets(r.question_assets),
        };
      });
  }

  const { data: aRows } = await supabase
    .from('session_answers')
    .select('question_id, position, picked_option_id, picked_text')
    .eq('session_id', sessionId);
  const answered = (aRows ?? []) as Array<{
    question_id: string;
    position: number;
    picked_option_id: string | null;
    picked_text: string | null;
  }>;

  return {
    session: {
      id: s.id,
      program_course_id: s.program_course_id,
      mode: s.mode,
      topic_id: s.topic_id,
      total_questions: s.total_questions,
      started_at: s.started_at,
      finished_at: s.finished_at,
      paused_at: s.paused_at,
      total_paused_ms: s.total_paused_ms,
      course_name: s.program_courses?.courses?.name ?? null,
      topic_name: s.topics?.name ?? null,
    },
    picked_questions: picked,
    answered,
  };
}

/** Delete a session permanently. Cascades to session_answers via FK. */
export async function deleteSession(uid: string, sessionId: string): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from('sessions')
    .select('user_uid')
    .eq('id', sessionId)
    .maybeSingle();
  if (selErr) throw selErr;
  // Don't leak whether the id exists — 404 in both "missing" and "not yours".
  if (!row || row.user_uid !== uid) {
    throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  }
  const { error: delErr } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (delErr) throw delErr;
}

async function loadOwnedSession(uid: string, sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  const row = data as SessionRow;
  if (row.user_uid !== uid) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
  return row;
}

/** Pause an in-progress session. No-op if already paused or already finished. */
export async function pauseSession(uid: string, sessionId: string): Promise<SessionRow> {
  const row = await loadOwnedSession(uid, sessionId);
  if (row.finished_at) throw new ApiError(409, 'ALREADY_FINISHED', 'Session already finished');
  if (row.paused_at) return row;
  const { data, error } = await supabase
    .from('sessions')
    .update({ paused_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return data as SessionRow;
}

/** Resume a paused session: rolls the pause duration into total_paused_ms. */
export async function resumeSession(uid: string, sessionId: string): Promise<SessionRow> {
  const row = await loadOwnedSession(uid, sessionId);
  if (row.finished_at) throw new ApiError(409, 'ALREADY_FINISHED', 'Session already finished');
  if (!row.paused_at) return row;
  const pausedMs = Date.now() - new Date(row.paused_at).getTime();
  const nextTotal = (row.total_paused_ms ?? 0) + Math.max(0, pausedMs);
  const { data, error } = await supabase
    .from('sessions')
    .update({ paused_at: null, total_paused_ms: nextTotal })
    .eq('id', sessionId)
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return data as SessionRow;
}
