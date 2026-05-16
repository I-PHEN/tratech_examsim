import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';
import { runPipeline } from './extraction/pipeline';
import { createQuestion } from './questionService';
import { QuestionCreate } from '../schemas/question';
import type { DraftDataInput } from '../schemas/ingestion';

async function updateJob(jobId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('ingestion_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw error;
}

export async function runExtraction(jobId: string): Promise<void> {
  return runPipeline(jobId);
}

export interface PublishResult {
  published_count: number;
  skipped: Array<{ draft_id: string; reason: string }>;
}

export async function publishJob(jobId: string): Promise<PublishResult> {
  const { data: job, error: jobErr } = await supabase
    .from('ingestion_jobs')
    .select('id, program_course_id, status')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  if (!job.program_course_id) {
    throw new ApiError(400, 'INVALID_JOB', 'Job has no program_course_id set');
  }

  const { data: drafts, error: draftsErr } = await supabase
    .from('ingestion_drafts')
    .select('id, draft_data')
    .eq('job_id', jobId)
    .eq('status', 'pending');
  if (draftsErr) throw draftsErr;

  const skipped: Array<{ draft_id: string; reason: string }> = [];
  let publishedCount = 0;

  for (const draft of drafts ?? []) {
    const data = draft.draft_data as DraftDataInput;

    if (!data.topic_id) {
      skipped.push({ draft_id: draft.id, reason: 'topic_id missing' });
      continue;
    }
    if (!data.exam_scope) {
      skipped.push({ draft_id: draft.id, reason: 'exam_scope missing' });
      continue;
    }
    if (!data.difficulty) {
      skipped.push({ draft_id: draft.id, reason: 'difficulty missing' });
      continue;
    }

    const createInput = {
      program_course_id: job.program_course_id,
      topic_id: data.topic_id,
      type: data.type,
      difficulty: data.difficulty,
      exam_scope: data.exam_scope,
      content: {
        prompt: data.prompt,
        explanation: data.explanation,
        ...(data.type === 'calc'
          ? {
              correct_answer: data.correct_answer ?? '',
              answer_tolerance: data.answer_tolerance,
              unit: data.unit,
            }
          : {}),
      },
      ...(data.type === 'mcq'
        ? { options: data.options ?? [] }
        : { answer_type: data.answer_type ?? 'exact' }),
    };

    const parsed = QuestionCreate.safeParse(createInput);
    if (!parsed.success) {
      skipped.push({
        draft_id: draft.id,
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
      continue;
    }

    try {
      const created = await createQuestion(parsed.data);
      const { error: updErr } = await supabase
        .from('ingestion_drafts')
        .update({
          status: 'published',
          published_question_id: created.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
      if (updErr) throw updErr;
      publishedCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push({ draft_id: draft.id, reason: msg });
    }
  }

  if (publishedCount > 0 && skipped.length === 0) {
    await updateJob(jobId, { status: 'published' });
  }

  return { published_count: publishedCount, skipped };
}
