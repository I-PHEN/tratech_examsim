import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';
import { pickSessionQuestions } from './routingService';
import { groupIntoLogical } from '../lib/logicalQuestions';
import { aggregateLogicalScore, type AnswerPoints } from '../lib/logicalScore';
import {
  mapAssets,
  type QuestionAsset,
  type QuestionContent,
  type McqOption,
  type AnswerFieldSpec,
} from './questionService';
import { shuffle } from '../lib/shuffle';
import { parallelMap } from '../lib/concurrency';
import { gradeWrittenAnswer } from './gradingService';
import { summarizeByTopic, type TopicBreakdownEntry } from './topicBreakdown';
import { bookmarkedIdsAmong } from './bookmarkService';
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

/** One field of a multi-input answer in the review payload: student value + model value + result. */
export interface ReviewAnswerField {
  label: string;
  unit: string | null;
  picked_text: string | null;
  correct_answer: string;
  is_correct: boolean | null;
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
  /** Present only for multi-input answers. */
  fields?: ReviewAnswerField[];
}

interface ReviewQuestion {
  id: string;
  type: 'mcq' | 'calc';
  difficulty: 'easy' | 'medium' | 'hard';
  exam_scope: 'midsem' | 'final' | 'both';
  topic_id: string;
  answer_type: 'exact' | 'range' | 'written' | 'multi' | null;
  question_group_id: string | null;
  part_label: string | null;
  part_index: number | null;
  content: QuestionContent;
  options: McqOption[];
  answer_fields?: AnswerFieldSpec[];
  assets: QuestionAsset[];
  bookmarked: boolean;
}

export async function createSession(uid: string, input: SessionCreateInput) {
  const topicId = input.topic_id ?? null;

  const picked = await pickSessionQuestions({
    program_course_id: input.program_course_id,
    mode: input.mode,
    count: input.count,
    topic_id: input.topic_id,
    difficulty: input.difficulty,
  });
  const pickedQuestions = picked.picked;
  const difficultyFallback = picked.difficulty_fallback;

  if (pickedQuestions.length === 0) {
    throw new ApiError(
      404,
      'NO_QUESTIONS',
      'No questions found for that course / mode / filters. Add some via Admin → Manual Entry.'
    );
  }

  // total_questions is the count of LOGICAL questions (a multi-part group counts
  // once), so the student-facing total matches what they picked / see.
  const logicalTotal = groupIntoLogical(
    pickedQuestions.map((q) => ({
      id: q.id,
      question_group_id: q.question_group_id ?? null,
      part_index: q.part_index ?? null,
    }))
  ).length;

  const { data: row, error } = await supabase
    .from('sessions')
    .insert({
      user_uid: uid,
      program_course_id: input.program_course_id,
      mode: input.mode,
      topic_id: topicId,
      total_questions: logicalTotal,
      // Persist the picked question ids in original order so any device can
      // resume the same exam with the same questions in the same positions.
      question_ids: pickedQuestions.map((q) => q.id),
    })
    .select('*')
    .single();
  if (error) throw error;

  return {
    session_id: row.id,
    picked: pickedQuestions,
    difficulty_fallback: difficultyFallback,
  };
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

  return gradeNumeric(
    content.correct_answer ?? '',
    pickedText,
    question.answer_type === 'range' ? 'range' : 'exact',
    content.answer_tolerance ?? null
  );
}

/**
 * Grade a single numeric/short answer. `range` accepts |answer − model| ≤ tol;
 * `exact` requires a normalized (case/whitespace-insensitive) string match.
 * A blank answer is never correct.
 */
function gradeNumeric(
  expected: string,
  got: string,
  type: 'exact' | 'range',
  tolerance: number | null
): boolean {
  const g = got.trim();
  if (g.length === 0) return false;
  if (type === 'range') {
    const e = Number(expected);
    const n = Number(g);
    const tol = Number(tolerance ?? 0);
    if (Number.isFinite(e) && Number.isFinite(n)) return Math.abs(e - n) <= tol;
  }
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(expected) === norm(g);
}

interface MultiFieldRow {
  field_position: number;
  picked_text: string;
  is_correct: boolean;
  label: string;
  unit: string | null;
}

/**
 * Grade every answer field of a multi-input question against the student's
 * picked values (keyed by field position; missing/blank fields count wrong).
 */
async function evaluateMultiFields(
  questionId: string,
  pickedFields: { position: number; text: string }[]
): Promise<{ rows: MultiFieldRow[]; allCorrect: boolean; summary: string }> {
  const { data: fields, error } = await supabase
    .from('question_answer_fields')
    .select('position, label, correct_answer, answer_type, answer_tolerance, unit')
    .eq('question_id', questionId)
    .order('position', { ascending: true });
  if (error) throw error;
  if (!fields || fields.length === 0) {
    throw new ApiError(400, 'NOT_MULTI', 'Question has no answer fields');
  }

  const pickedByPos = new Map(pickedFields.map((p) => [p.position, p.text]));
  const rows: MultiFieldRow[] = fields.map((f) => {
    const got = (pickedByPos.get(f.position) ?? '').trim();
    return {
      field_position: f.position,
      picked_text: got,
      is_correct: gradeNumeric(f.correct_answer, got, f.answer_type as 'exact' | 'range', f.answer_tolerance),
      label: f.label,
      unit: f.unit,
    };
  });

  const allCorrect = rows.every((r) => r.is_correct);
  const summary = rows
    .map((r) => `${r.label} = ${r.picked_text || '—'}${r.unit ? ` ${r.unit}` : ''}`)
    .join('; ');
  return { rows, allCorrect, summary };
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

  // Multi-input answer: grade each field, store per-field rows, and mirror an
  // overall result + readable summary on the parent session_answers row.
  if (input.picked_fields !== undefined) {
    const { rows, allCorrect, summary } = await evaluateMultiFields(
      input.question_id,
      input.picked_fields
    );

    const { error: parentErr } = await supabase
      .from('session_answers')
      .upsert(
        {
          session_id: sessionId,
          question_id: input.question_id,
          position: input.position,
          picked_option_id: null,
          picked_text: summary,
          is_correct: allCorrect,
          time_ms: input.time_ms ?? null,
          answered_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,question_id' }
      );
    if (parentErr) throw parentErr;

    const fieldRows = rows.map((r) => ({
      session_id: sessionId,
      question_id: input.question_id,
      field_position: r.field_position,
      picked_text: r.picked_text || null,
      is_correct: r.is_correct,
    }));
    const { error: fieldsErr } = await supabase
      .from('session_answer_fields')
      .upsert(fieldRows, { onConflict: 'session_id,question_id,field_position' });
    if (fieldsErr) throw fieldsErr;

    return { is_correct: allCorrect };
  }

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
    {
      answer_type: string | null;
      question_group_id: string | null;
      prompt: string;
      correct_answer: string;
      explanation: string | null;
    }
  >();
  if (gradedQuestionIds.length > 0) {
    const { data: qRows, error: qErr } = await supabase
      .from('questions')
      .select('id, answer_type, question_group_id, question_content(prompt, correct_answer, explanation)')
      .in('id', gradedQuestionIds);
    if (qErr) throw qErr;
    for (const row of qRows ?? []) {
      const r = row as unknown as {
        id: string;
        answer_type: string | null;
        question_group_id: string | null;
        question_content:
          | { prompt: string; correct_answer: string; explanation: string | null }
          | { prompt: string; correct_answer: string; explanation: string | null }[]
          | null;
      };
      const c = Array.isArray(r.question_content) ? r.question_content[0] : r.question_content;
      qMeta.set(r.id, {
        answer_type: r.answer_type,
        question_group_id: r.question_group_id,
        prompt: c?.prompt ?? '',
        correct_answer: c?.correct_answer ?? '',
        explanation: c?.explanation ?? null,
      });
    }
  }

  // Written answers are AI-graded now (concurrently); mcq/calc mirror is_correct.
  // `points` is 0–1 per answer and the session score is their sum (fractional).
  const perAnswer: AnswerPoints[] = [];
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
    } else if (meta?.answer_type === 'multi') {
      // Partial credit: fraction of answer fields the student got right.
      const { data: fieldRows } = await supabase
        .from('session_answer_fields')
        .select('is_correct')
        .eq('session_id', sessionId)
        .eq('question_id', a.question_id);
      const total = fieldRows?.length ?? 0;
      const correct = (fieldRows ?? []).filter((f) => f.is_correct === true).length;
      pts = total > 0 ? correct / total : 0;
      await supabase
        .from('session_answers')
        .update({ points: pts, is_correct: pts >= 0.5 })
        .eq('id', a.id);
    } else {
      pts = a.is_correct === true ? 1 : 0;
      await supabase.from('session_answers').update({ points: pts }).eq('id', a.id);
    }
    perAnswer.push({
      question_id: a.question_id,
      group_id: meta?.question_group_id ?? null,
      points: pts,
    });
  });

  const score = aggregateLogicalScore(perAnswer).score;
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

  const bookmarkedSet = await bookmarkedIdsAmong(uid, orderedIds);

  let questions: ReviewQuestion[] = [];
  if (orderedIds.length > 0) {
    const { data: full, error: qErr } = await supabase
      .from('questions')
      .select(
        'id, type, difficulty, exam_scope, topic_id, answer_type, ' +
          'question_group_id, part_label, part_index, ' +
          'question_content(prompt, explanation, correct_answer, answer_tolerance, unit, shared_stem), ' +
          'mcq_options(id, text, is_correct), ' +
          'question_answer_fields(position, label, correct_answer, answer_type, answer_tolerance, unit), ' +
          'question_assets(id, storage_path, mime_type, position)'
      )
      .in('id', orderedIds);
    if (qErr) throw qErr;

    questions = await Promise.all((full ?? []).map(async (row) => {
      const r = row as unknown as {
        id: string;
        type: 'mcq' | 'calc';
        difficulty: 'easy' | 'medium' | 'hard';
        exam_scope: 'midsem' | 'final' | 'both';
        topic_id: string;
        answer_type: 'exact' | 'range' | 'written' | 'multi' | null;
        question_group_id: string | null;
        part_label: string | null;
        part_index: number | null;
        question_content: QuestionContent | QuestionContent[] | null;
        mcq_options: McqOption[] | null;
        question_answer_fields: AnswerFieldSpec[] | null;
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
        answer_fields:
          r.answer_type === 'multi'
            ? (r.question_answer_fields ?? []).slice().sort((a, b) => a.position - b.position)
            : undefined,
        assets: await mapAssets(r.question_assets),
        bookmarked: bookmarkedSet.has(r.id),
      };
    }));

    // `.in()` does not preserve order — restore the exam order so the review
    // (and grouped multi-part numbering) renders questions as they were sat.
    const orderIndex = new Map(orderedIds.map((id, i) => [id, i]));
    questions.sort(
      (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
    );
  }

  // Enrich multi-input answers with their per-field breakdown (student value +
  // model value + result), joining session_answer_fields to the question spec.
  const multiQuestionIds = questions.filter((q) => q.answer_type === 'multi').map((q) => q.id);
  let enrichedAnswers = (answers ?? []) as SessionAnswerRow[];
  if (multiQuestionIds.length > 0) {
    const { data: studentFields, error: sfErr } = await supabase
      .from('session_answer_fields')
      .select('question_id, field_position, picked_text, is_correct')
      .eq('session_id', sessionId)
      .in('question_id', multiQuestionIds);
    if (sfErr) throw sfErr;
    const specByQuestion = new Map(
      questions.filter((q) => q.answer_fields).map((q) => [q.id, q.answer_fields!])
    );
    const studentByQuestion = new Map<string, Map<number, { picked_text: string | null; is_correct: boolean | null }>>();
    for (const sf of studentFields ?? []) {
      const m = studentByQuestion.get(sf.question_id) ?? new Map();
      m.set(sf.field_position, { picked_text: sf.picked_text, is_correct: sf.is_correct });
      studentByQuestion.set(sf.question_id, m);
    }
    enrichedAnswers = enrichedAnswers.map((a) => {
      const spec = specByQuestion.get(a.question_id);
      if (!spec) return a;
      const studentMap = studentByQuestion.get(a.question_id);
      const fields: ReviewAnswerField[] = spec.map((f) => {
        const picked = studentMap?.get(f.position);
        return {
          label: f.label,
          unit: f.unit,
          picked_text: picked?.picked_text ?? null,
          correct_answer: f.correct_answer,
          is_correct: picked?.is_correct ?? null,
        };
      });
      return { ...a, fields };
    });
  }

  let topic_breakdown: TopicBreakdownEntry[] | null = null;
  if (s.mode === 'diagnostic' && questions.length > 0) {
    const topicById = new Map(questions.map((q) => [q.id, q.topic_id]));
    const topicIds = Array.from(new Set(questions.map((q) => q.topic_id)));
    const { data: topicRows } = await supabase
      .from('topics')
      .select('id, name')
      .in('id', topicIds);
    const nameById = new Map((topicRows ?? []).map((t) => [t.id as string, t.name as string]));
    const rows = (answers ?? [])
      .map((a) => {
        const tid = topicById.get(a.question_id) ?? '';
        return { topic_id: tid, topic_name: nameById.get(tid) ?? null, is_correct: a.is_correct };
      })
      .filter((r) => r.topic_id !== '');
    topic_breakdown = summarizeByTopic(rows);
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
    answers: enrichedAnswers,
    questions,
    topic_breakdown,
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
    answer_type: 'exact' | 'range' | 'written' | 'multi' | null;
    question_group_id: string | null;
    part_label: string | null;
    part_index: number | null;
    content: QuestionContent;
    options?: McqOption[];
    answer_fields?: AnswerFieldSpec[];
    assets: QuestionAsset[];
  }> = [];

  if (orderedIds.length > 0) {
    const { data: qRows, error: qErr } = await supabase
      .from('questions')
      .select(
        'id, program_course_id, topic_id, type, difficulty, exam_scope, answer_type, ' +
          'question_group_id, part_label, part_index, ' +
          'question_content(prompt, explanation, correct_answer, answer_tolerance, unit, shared_stem), ' +
          'mcq_options(id, text, is_correct), ' +
          'question_answer_fields(position, label, correct_answer, answer_type, answer_tolerance, unit), ' +
          'question_assets(id, storage_path, mime_type, position)'
      )
      .in('id', orderedIds);
    if (qErr) throw qErr;

    const byId = new Map<string, unknown>();
    for (const row of qRows ?? []) byId.set((row as unknown as { id: string }).id, row);

    picked = await Promise.all(
      orderedIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map(async (row) => {
          const r = row as unknown as {
            id: string;
            type: 'mcq' | 'calc';
            difficulty: 'easy' | 'medium' | 'hard';
            exam_scope: 'midsem' | 'final' | 'both';
            topic_id: string;
            answer_type: 'exact' | 'range' | 'written' | 'multi' | null;
            question_group_id: string | null;
            part_label: string | null;
            part_index: number | null;
            question_content: QuestionContent | QuestionContent[] | null;
            mcq_options: McqOption[] | null;
            question_answer_fields: AnswerFieldSpec[] | null;
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
            answer_fields:
              r.answer_type === 'multi'
                ? (r.question_answer_fields ?? []).slice().sort((a, b) => a.position - b.position)
                : undefined,
            assets: await mapAssets(r.question_assets),
          };
        })
    );
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

  // Per-field values for any multi-input answers, so the exam UI can restore
  // each individual input box on resume (not just the summary).
  const multiIds = picked.filter((q) => q.answer_type === 'multi').map((q) => q.id);
  let answeredFields: Array<{ question_id: string; field_position: number; picked_text: string | null }> = [];
  if (multiIds.length > 0) {
    const { data: fRows } = await supabase
      .from('session_answer_fields')
      .select('question_id, field_position, picked_text')
      .eq('session_id', sessionId)
      .in('question_id', multiIds);
    answeredFields = (fRows ?? []) as typeof answeredFields;
  }

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
    answered_fields: answeredFields,
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
