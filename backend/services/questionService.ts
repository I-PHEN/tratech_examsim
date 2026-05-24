import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';
import { shuffle } from '../lib/shuffle';
import { uploadFile, removeFile } from './storage';
import type {
  QuestionCreateInput,
  QuestionUpdateInput,
  QuestionGroupUpdateInput,
} from '../schemas/question';

const STORAGE_BUCKET = 'ingestion-uploads';

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

export interface QuestionListFilters {
  program_course_id?: string;
  topic_id?: string;
  type?: 'mcq' | 'calc';
  difficulty?: 'easy' | 'medium' | 'hard';
  exam_scope?: 'midsem' | 'final' | 'both';
  limit?: number;
  offset?: number;
}

export interface QuestionContent {
  prompt: string;
  explanation: string | null;
  correct_answer: string;
  answer_tolerance: number | null;
  unit: string | null;
  shared_stem: string | null;
}

export interface McqOption {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface QuestionAsset {
  id: string;
  storage_path: string;
  mime_type: string;
  position: number;
  url: string;
  kind?: 'prompt' | 'solution';
}

export interface QuestionWithContent {
  id: string;
  program_course_id: string;
  topic_id: string;
  type: 'mcq' | 'calc';
  difficulty: 'easy' | 'medium' | 'hard';
  exam_scope: 'midsem' | 'final' | 'both';
  answer_type: 'exact' | 'range' | 'written' | null;
  question_group_id: string | null;
  part_label: string | null;
  part_index: number | null;
  content: QuestionContent;
  options?: McqOption[];
  assets: QuestionAsset[];
}

function unwrapContent(raw: unknown): QuestionContent {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (arr.length === 0) {
    throw new ApiError(500, 'DATA_INTEGRITY', 'Question is missing content');
  }
  return arr[0] as QuestionContent;
}

export function shuffleOptionsIfMcq(q: QuestionWithContent): QuestionWithContent {
  if (q.type === 'mcq' && q.options) {
    return { ...q, options: shuffle(q.options) };
  }
  return q;
}

export async function listQuestions(filters: QuestionListFilters) {
  let q = supabase
    .from('questions')
    .select(
      'id, program_course_id, topic_id, type, difficulty, exam_scope, answer_type, created_at, ' +
        'question_group_id, part_label, part_index, ' +
        'question_content(prompt)'
    )
    .order('created_at', { ascending: false });

  if (filters.program_course_id) q = q.eq('program_course_id', filters.program_course_id);
  if (filters.topic_id) q = q.eq('topic_id', filters.topic_id);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
  if (filters.exam_scope) q = q.eq('exam_scope', filters.exam_scope);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown> & {
      question_content?: { prompt: string } | { prompt: string }[] | null;
    };
    const { question_content, ...rest } = r;
    const contentArr = Array.isArray(question_content)
      ? question_content
      : question_content
      ? [question_content]
      : [];
    return { ...rest, prompt: contentArr[0]?.prompt ?? '' };
  });
}

interface AssetRow {
  id: string;
  storage_path: string;
  mime_type: string;
  position: number;
  kind?: 'prompt' | 'solution';
}

interface QuestionJoinRow {
  id: string;
  program_course_id: string;
  topic_id: string;
  type: 'mcq' | 'calc';
  difficulty: 'easy' | 'medium' | 'hard';
  exam_scope: 'midsem' | 'final' | 'both';
  answer_type: 'exact' | 'range' | 'written' | null;
  question_group_id: string | null;
  part_label: string | null;
  part_index: number | null;
  question_content: QuestionContent | QuestionContent[] | null;
  mcq_options: McqOption[] | null;
  question_assets: AssetRow[] | null;
}

export function mapAssets(rows: AssetRow[] | null | undefined): QuestionAsset[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((a) => ({ ...a, url: publicUrlFor(a.storage_path) }));
}

export async function getQuestionById(id: string): Promise<QuestionWithContent> {
  const { data, error } = await supabase
    .from('questions')
    .select(
      'id, program_course_id, topic_id, type, difficulty, exam_scope, answer_type, ' +
        'question_group_id, part_label, part_index, ' +
        'question_content(prompt, explanation, correct_answer, answer_tolerance, unit, shared_stem), ' +
        'mcq_options(id, text, is_correct), ' +
        'question_assets(id, storage_path, mime_type, position, kind)'
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Question not found');

  const row = data as unknown as QuestionJoinRow;

  const result: QuestionWithContent = {
    id: row.id,
    program_course_id: row.program_course_id,
    topic_id: row.topic_id,
    type: row.type,
    difficulty: row.difficulty,
    exam_scope: row.exam_scope,
    answer_type: row.answer_type,
    question_group_id: row.question_group_id,
    part_label: row.part_label,
    part_index: row.part_index,
    content: unwrapContent(row.question_content),
    options: row.type === 'mcq' ? row.mcq_options ?? [] : undefined,
    assets: mapAssets(row.question_assets),
  };

  return shuffleOptionsIfMcq(result);
}

export type { QuestionJoinRow };

export async function createQuestion(input: QuestionCreateInput): Promise<QuestionWithContent> {
  if (input.type === 'mcq') {
    const correctCount = input.options.filter((o) => o.is_correct).length;
    if (correctCount !== 1) {
      throw new ApiError(
        400,
        'INVALID_MCQ',
        `MCQ questions must have exactly one correct option (got ${correctCount})`
      );
    }
  } else {
    if (input.answer_type === 'range' && !input.content.answer_tolerance) {
      throw new ApiError(
        400,
        'INVALID_CALC',
        'Calc questions with answer_type=range require answer_tolerance'
      );
    }
  }

  const questionRow = {
    program_course_id: input.program_course_id,
    topic_id: input.topic_id,
    type: input.type,
    difficulty: input.difficulty,
    exam_scope: input.exam_scope,
    answer_type: input.type === 'calc' ? input.answer_type : 'exact',
    question_group_id: input.question_group_id ?? null,
    part_label: input.part_label ?? null,
    part_index: input.part_index ?? null,
  };

  const { data: created, error: insertErr } = await supabase
    .from('questions')
    .insert(questionRow)
    .select('id')
    .single();
  if (insertErr) throw insertErr;

  const questionId = created.id;

  try {
    const contentRow =
      input.type === 'mcq'
        ? {
            question_id: questionId,
            prompt: input.content.prompt,
            explanation: input.content.explanation ?? null,
            correct_answer: input.options.find((o) => o.is_correct)!.text,
            answer_tolerance: null,
            unit: null,
            source_reference: input.content.source_reference ?? null,
            shared_stem: input.content.shared_stem ?? null,
          }
        : {
            question_id: questionId,
            prompt: input.content.prompt,
            explanation: input.content.explanation ?? null,
            correct_answer: input.content.correct_answer,
            answer_tolerance: input.content.answer_tolerance ?? null,
            unit: input.content.unit ?? null,
            source_reference: input.content.source_reference ?? null,
            shared_stem: input.content.shared_stem ?? null,
          };

    const { error: contentErr } = await supabase.from('question_content').insert(contentRow);
    if (contentErr) throw contentErr;

    if (input.type === 'mcq') {
      const optionRows = input.options.map((o) => ({
        question_id: questionId,
        text: o.text,
        is_correct: o.is_correct,
      }));
      const { error: optionsErr } = await supabase.from('mcq_options').insert(optionRows);
      if (optionsErr) throw optionsErr;
    }

    return await getQuestionById(questionId);
  } catch (err) {
    await supabase.from('questions').delete().eq('id', questionId);
    throw err;
  }
}

export async function updateQuestion(
  id: string,
  input: QuestionUpdateInput
): Promise<QuestionWithContent> {
  const existing = await getQuestionById(id);
  if (existing.type !== input.type) {
    throw new ApiError(
      400,
      'TYPE_CHANGE_NOT_ALLOWED',
      `Cannot change question type from ${existing.type} to ${input.type}`
    );
  }

  if (input.type === 'mcq') {
    const correctCount = input.options.filter((o) => o.is_correct).length;
    if (correctCount !== 1) {
      throw new ApiError(
        400,
        'INVALID_MCQ',
        `MCQ questions must have exactly one correct option (got ${correctCount})`
      );
    }
  } else if (input.answer_type === 'range' && !input.content.answer_tolerance) {
    throw new ApiError(
      400,
      'INVALID_CALC',
      'Calc questions with answer_type=range require answer_tolerance'
    );
  }

  const questionPatch = {
    topic_id: input.topic_id,
    difficulty: input.difficulty,
    exam_scope: input.exam_scope,
    answer_type: input.type === 'calc' ? input.answer_type : 'exact',
  };
  const { error: qErr } = await supabase.from('questions').update(questionPatch).eq('id', id);
  if (qErr) throw qErr;

  const { error: delContentErr } = await supabase
    .from('question_content')
    .delete()
    .eq('question_id', id);
  if (delContentErr) throw delContentErr;

  const contentRow =
    input.type === 'mcq'
      ? {
          question_id: id,
          prompt: input.content.prompt,
          explanation: input.content.explanation ?? null,
          correct_answer: input.options.find((o) => o.is_correct)!.text,
          answer_tolerance: null,
          unit: null,
          source_reference: input.content.source_reference ?? null,
          shared_stem: input.content.shared_stem ?? null,
        }
      : {
          question_id: id,
          prompt: input.content.prompt,
          explanation: input.content.explanation ?? null,
          correct_answer: input.content.correct_answer,
          answer_tolerance: input.content.answer_tolerance ?? null,
          unit: input.content.unit ?? null,
          source_reference: input.content.source_reference ?? null,
          shared_stem: input.content.shared_stem ?? null,
        };

  const { error: contentErr } = await supabase.from('question_content').insert(contentRow);
  if (contentErr) throw contentErr;

  if (input.type === 'mcq') {
    const { error: delOptsErr } = await supabase
      .from('mcq_options')
      .delete()
      .eq('question_id', id);
    if (delOptsErr) throw delOptsErr;

    const optionRows = input.options.map((o) => ({
      question_id: id,
      text: o.text,
      is_correct: o.is_correct,
    }));
    const { error: optsErr } = await supabase.from('mcq_options').insert(optionRows);
    if (optsErr) throw optsErr;
  }

  return await getQuestionById(id);
}

export async function deleteQuestion(id: string): Promise<void> {
  const { data: assets } = await supabase
    .from('question_assets')
    .select('storage_path')
    .eq('question_id', id);

  for (const a of assets ?? []) {
    await removeFile(a.storage_path).catch(() => {});
  }

  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw error;
}

export async function addQuestionAsset(
  questionId: string,
  buffer: Buffer,
  mimeType: string,
  kind: 'prompt' | 'solution' = 'prompt'
): Promise<QuestionAsset> {
  const { data: existing } = await supabase
    .from('question_assets')
    .select('position')
    .eq('question_id', questionId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (existing?.position ?? -1) + 1;

  const ext = extensionFor(mimeType);
  const storagePath = `questions/${questionId}/${randomUUID()}.${ext}`;

  await uploadFile(storagePath, buffer, mimeType);

  const { data, error } = await supabase
    .from('question_assets')
    .insert({
      question_id: questionId,
      storage_path: storagePath,
      mime_type: mimeType,
      position: nextPosition,
      kind,
    })
    .select('id, storage_path, mime_type, position')
    .single();

  if (error) {
    await removeFile(storagePath).catch(() => {});
    throw error;
  }

  return { ...(data as AssetRow), url: publicUrlFor(data.storage_path) };
}

/**
 * Load every sibling part of a multi-part question in `part_index` order. Throws
 * 404 when no rows carry the given group id.
 */
export async function getQuestionsByGroup(
  groupId: string
): Promise<QuestionWithContent[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('id, part_index')
    .eq('question_group_id', groupId)
    .order('part_index', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Question group not found');
  }
  const parts = await Promise.all(data.map((r) => getQuestionById(r.id)));
  return parts;
}

/**
 * Patch every sibling in a multi-part group atomically (best-effort: we issue
 * the writes sequentially, and rely on Postgres + the shared-stem invariant to
 * keep them consistent). `shared` fields write the same value to every part;
 * `parts[]` carries the per-part edits (each must include `id`).
 */
export async function updateQuestionGroup(
  groupId: string,
  input: QuestionGroupUpdateInput
): Promise<QuestionWithContent[]> {
  const existing = await getQuestionsByGroup(groupId);
  const byId = new Map(existing.map((q) => [q.id, q]));

  const sharedStem = input.shared?.shared_stem;
  for (const part of input.parts) {
    const current = byId.get(part.id);
    if (!current) {
      throw new ApiError(
        400,
        'INVALID_GROUP',
        `Part ${part.id} does not belong to group ${groupId}`
      );
    }
    const merged: QuestionUpdateInput = {
      ...part,
      topic_id: input.shared?.topic_id ?? part.topic_id,
      difficulty: input.shared?.difficulty ?? part.difficulty,
      exam_scope: input.shared?.exam_scope ?? part.exam_scope,
      content: {
        ...part.content,
        ...(sharedStem !== undefined ? { shared_stem: sharedStem } : {}),
      },
    } as QuestionUpdateInput;
    await updateQuestion(part.id, merged);
  }

  return await getQuestionsByGroup(groupId);
}

export async function removeQuestionAsset(questionId: string, assetId: string): Promise<void> {
  const { data: row, error: fetchErr } = await supabase
    .from('question_assets')
    .select('storage_path')
    .eq('id', assetId)
    .eq('question_id', questionId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Asset not found');

  await removeFile(row.storage_path).catch(() => {});

  const { error: delErr } = await supabase.from('question_assets').delete().eq('id', assetId);
  if (delErr) throw delErr;
}
