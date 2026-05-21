import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';
import {
  runPipeline,
  loadJob,
  loadTopics,
  performOcr,
  performClassify,
  toDraftData,
} from './extraction/pipeline';
import type { OcrPage } from '../lib/mistralOcr';
import { ocrImage, decodeOcrImage } from '../lib/mistralOcr';
import { parallelMap } from '../lib/concurrency';
import { verifyQuestion } from './extraction/verifier';
import { classifyPage, classifyPageWithRetry } from './extraction/classifier';
import { splitIntoQuestions, normalizeFormatting } from './extraction/textFormatter';
import { createQuestion, addQuestionAsset } from './questionService';
import { downloadFile, uploadFile } from './storage';
import { randomUUID } from 'crypto';
import { QuestionCreate } from '../schemas/question';
import type { DraftDataInput, SegmentGlobalInput } from '../schemas/ingestion';

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

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface OcrAssetRef {
  page_number: number;
  img_id: string;
  storage_path: string;
  mime: string;
}

/**
 * Persist the diagrams Mistral extracts per page to storage and return a
 * manifest. The markdown keeps its `![](img-id)` placeholders, so at publish
 * time we can match each diagram back to the question it belongs to.
 */
async function persistOcrImages(
  jobId: string,
  pages: OcrPage[]
): Promise<OcrAssetRef[]> {
  const manifest: OcrAssetRef[] = [];
  for (const page of pages) {
    for (const img of page.images ?? []) {
      try {
        const { buffer, mime } = decodeOcrImage(img.base64, img.id);
        if (buffer.length === 0) continue;
        const safeId = img.id.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${jobId}/ocr-images/p${page.page_number}-${safeId}`;
        await uploadFile(storagePath, buffer, mime);
        manifest.push({
          page_number: page.page_number,
          img_id: img.id,
          storage_path: storagePath,
          mime,
        });
      } catch {
        // A single bad image must not fail the whole extraction.
      }
    }
  }
  return manifest;
}

/** STAGE: extraction only (OCR). Lands at `text_review`. Idempotent. */
export async function extractJob(jobId: string): Promise<void> {
  const job = await loadJob(jobId);
  await updateJob(jobId, { status: 'extracting', stage: 'ocr', error_message: null });
  try {
    const transcripts = await performOcr(job);
    const ocrAssets = await persistOcrImages(jobId, transcripts);
    await updateJob(jobId, {
      transcripts: transcripts.map((p) => ({ page_number: p.page_number, text: p.text })),
      ocr_assets: ocrAssets.length > 0 ? ocrAssets : null,
      status: 'text_review',
      stage: 'ocr_done',
    });
  } catch (err) {
    const msg = errMsg(err);
    await updateJob(jobId, { status: 'failed', error_message: msg });
    throw new ApiError(502, 'EXTRACTION_FAILED', msg);
  }
}

/** STAGE: classify + topic-match (+verify unless human-edited). Lands at `ready_for_review`. Idempotent. */
export async function classifyJob(jobId: string): Promise<void> {
  const job = await loadJob(jobId);
  const { topics, validTopicIds } = await loadTopics(job.program_course_id);
  const docType = job.doc_type ?? 'past_paper';
  await updateJob(jobId, { status: 'extracting', stage: 'classifying', error_message: null });
  try {
    const edited = job.reviewed_text != null && job.reviewed_text.trim().length > 0;
    let transcripts: OcrPage[];
    if (edited) {
      transcripts = [{ page_number: 1, text: job.reviewed_text! }];
    } else if (job.transcripts && job.transcripts.length > 0) {
      transcripts = job.transcripts.map((t) => ({ page_number: t.page_number, text: t.text }));
    } else {
      // Not extracted yet (e.g. autonomous straight-to-classify) — OCR first.
      transcripts = await performOcr(job);
      const ocrAssets = await persistOcrImages(jobId, transcripts);
      await updateJob(jobId, {
        transcripts: transcripts.map((p) => ({ page_number: p.page_number, text: p.text })),
        ocr_assets: ocrAssets.length > 0 ? ocrAssets : null,
      });
    }

    const { allDrafts, verificationWarnings } = await performClassify(
      job,
      transcripts,
      topics,
      docType,
      edited // skip verify for human-edited single-blob text
    );

    // Re-classify replaces any prior drafts for this job (idempotent retry).
    await supabase.from('ingestion_drafts').delete().eq('job_id', jobId);

    const rows = allDrafts.map((d, i) => ({
      job_id: jobId,
      draft_data: toDraftData(d, job.default_exam_scope, validTopicIds),
      source_page: d.source_page ?? null,
      ai_confidence: d.confidence ?? null,
      verification_warnings: verificationWarnings[i] ?? null,
    }));
    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('ingestion_drafts').insert(rows);
      if (insertErr) throw insertErr;
    }

    await updateJob(jobId, {
      status: 'ready_for_review',
      stage: 'done',
      total_drafts: rows.length,
    });
  } catch (err) {
    const msg = errMsg(err);
    await updateJob(jobId, { status: 'failed', error_message: msg });
    throw new ApiError(502, 'CLASSIFY_FAILED', msg);
  }
}

/** STAGE (optional): AI "fill details" assist over existing pending drafts. */
export async function verifyJob(jobId: string): Promise<void> {
  const job = await loadJob(jobId);
  const { topics } = await loadTopics(job.program_course_id);
  const docType = job.doc_type ?? 'past_paper';

  const sourceText =
    job.reviewed_text && job.reviewed_text.trim().length > 0
      ? job.reviewed_text
      : (job.transcripts ?? []).map((t) => t.text).join('\n\n');
  if (!sourceText.trim()) return;

  const { data: drafts, error } = await supabase
    .from('ingestion_drafts')
    .select('id, draft_data')
    .eq('job_id', jobId)
    .eq('status', 'pending');
  if (error) throw error;

  await parallelMap(drafts ?? [], 3, async (draft) => {
    const d = draft.draft_data as DraftDataInput;
    const { complete, missing } = await verifyQuestion(d.prompt, sourceText, job.model ?? undefined);
    if (complete || missing.length === 0) return;

    let nextPrompt = d.prompt;
    const retried = await classifyPageWithRetry(
      sourceText,
      1,
      docType,
      topics,
      missing,
      job.model ?? undefined
    );
    const best = retried.find((r) => r.prompt && r.prompt.length >= d.prompt.length);
    if (best) {
      const recheck = await verifyQuestion(best.prompt, sourceText, job.model ?? undefined);
      if (recheck.complete || recheck.missing.length < missing.length) {
        nextPrompt = best.prompt;
      }
    }
    await supabase
      .from('ingestion_drafts')
      .update({
        draft_data: { ...d, prompt: nextPrompt },
        verification_warnings: missing,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draft.id);
  });
}

/** Joined source text for a job: human-corrected text wins, else OCR transcripts. */
function jobSourceText(job: {
  reviewed_text: string | null;
  transcripts: { page_number: number; text: string }[] | null;
}): string {
  if (job.reviewed_text && job.reviewed_text.trim().length > 0) return job.reviewed_text;
  return (job.transcripts ?? []).map((t) => t.text).join('\n\n');
}

/** Move a job into the manual "Structure" step. Idempotent. */
export async function structureJob(jobId: string): Promise<void> {
  const job = await loadJob(jobId);
  if (!jobSourceText(job).trim()) {
    throw new ApiError(400, 'NO_TEXT', 'Extract text before structuring.');
  }
  await updateJob(jobId, { status: 'structuring', stage: 'structuring', error_message: null });
}

/** AI-suggested question boundaries for the Structure step. No DB writes, no classification. */
export async function suggestBoundaries(jobId: string): Promise<{ segments: string[] }> {
  const job = await loadJob(jobId);
  const text = jobSourceText(job);
  if (!text.trim()) throw new ApiError(400, 'NO_TEXT', 'Nothing to split — extract text first.');
  const segments = await splitIntoQuestions(text, job.model ?? undefined);
  return { segments };
}

/**
 * Create pending drafts straight from manually-structured segments + applied
 * global metadata. No AI classification — type defaults to 'calc' and is
 * corrected per-draft in the review table. Replaces prior drafts (idempotent).
 */
export async function createSegmentDrafts(
  jobId: string,
  segments: string[],
  global: SegmentGlobalInput | undefined
): Promise<{ created: number }> {
  await loadJob(jobId);

  await supabase.from('ingestion_drafts').delete().eq('job_id', jobId);

  const rows = segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((segment) => {
      const draft_data: DraftDataInput = { type: 'calc', prompt: segment, raw_text: segment };
      if (global?.topic_id) draft_data.topic_id = global.topic_id;
      if (global?.exam_scope) draft_data.exam_scope = global.exam_scope;
      if (global?.difficulty) draft_data.difficulty = global.difficulty;
      if (global?.source_reference) draft_data.source_reference = global.source_reference;
      return { job_id: jobId, draft_data, source_page: null, ai_confidence: null };
    });

  if (rows.length === 0) throw new ApiError(400, 'NO_SEGMENTS', 'No non-empty segments provided.');

  const { error: insertErr } = await supabase.from('ingestion_drafts').insert(rows);
  if (insertErr) throw insertErr;

  await updateJob(jobId, {
    status: 'ready_for_review',
    stage: 'done',
    total_drafts: rows.length,
  });
  return { created: rows.length };
}

/**
 * Classify the admin's MANUAL split — one AI call per segment, so the
 * boundaries the admin chose are preserved exactly (one draft per question,
 * never re-blobbed). AI only enriches each block (type/options/answer/topic);
 * global fill is applied wherever the AI left a field empty. A segment the AI
 * can't read still becomes its own draft. Replaces prior drafts (idempotent).
 */
export async function classifySegmentsJob(
  jobId: string,
  segments: string[],
  global: SegmentGlobalInput | undefined
): Promise<{ created: number }> {
  const job = await loadJob(jobId);
  const { topics, validTopicIds } = await loadTopics(job.program_course_id);
  const docType = job.doc_type ?? 'past_paper';
  const clean = segments.map((s) => s.trim()).filter((s) => s.length > 0);
  if (clean.length === 0) {
    throw new ApiError(400, 'NO_SEGMENTS', 'No non-empty segments provided.');
  }

  await updateJob(jobId, { status: 'extracting', stage: 'classifying', error_message: null });

  try {
    const concurrency =
      (job.model ?? process.env.GROQ_DEFAULT_MODEL ?? '').endsWith(':free') ? 1 : 3;

    const perSegment = await parallelMap(clean, concurrency, async (segment) => {
      let extracted: Awaited<ReturnType<typeof classifyPage>> = [];
      try {
        extracted = await classifyPage(segment, 1, docType, topics, job.model ?? undefined);
      } catch {
        extracted = [];
      }
      // Guarantee one-draft-per-segment even when the AI returns nothing.
      const drafts =
        extracted.length > 0
          ? extracted.map((d) => toDraftData(d, job.default_exam_scope, validTopicIds))
          : [{ type: 'calc', prompt: segment } as DraftDataInput];

      return drafts.map((draft_data) => {
        // Global fill only fills gaps — never overrides what the AI found.
        if (!draft_data.topic_id && global?.topic_id) draft_data.topic_id = global.topic_id;
        if (!draft_data.exam_scope && global?.exam_scope)
          draft_data.exam_scope = global.exam_scope;
        if (!draft_data.difficulty && global?.difficulty)
          draft_data.difficulty = global.difficulty;
        if (!draft_data.source_reference && global?.source_reference)
          draft_data.source_reference = global.source_reference;
        if (!draft_data.raw_text) draft_data.raw_text = segment;
        return { job_id: jobId, draft_data, source_page: 1, ai_confidence: null };
      });
    });

    const rows = perSegment.flat();

    await supabase.from('ingestion_drafts').delete().eq('job_id', jobId);
    const { error: insertErr } = await supabase.from('ingestion_drafts').insert(rows);
    if (insertErr) throw insertErr;

    await updateJob(jobId, {
      status: 'ready_for_review',
      stage: 'done',
      total_drafts: rows.length,
    });
    return { created: rows.length };
  } catch (err) {
    const msg = errMsg(err);
    await updateJob(jobId, { status: 'failed', error_message: msg });
    throw new ApiError(502, 'CLASSIFY_FAILED', msg);
  }
}

/** Content-preserving formatter for raw pasted/OCR text → Markdown + LaTeX. */
export async function formatText(text: string): Promise<{ formatted: string }> {
  const formatted = await normalizeFormatting(text);
  return { formatted };
}

export interface OcrImageResult {
  text: string;
  storage_path: string;
  mime_type: string;
}

/** Standalone OCR for a handwritten solution image; stores it under the job prefix. */
export async function ocrSolutionImage(
  jobId: string,
  buffer: Buffer,
  mimeType: string
): Promise<OcrImageResult> {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `${jobId}/solutions/${randomUUID()}.${ext}`;
  await uploadFile(storagePath, buffer, mimeType);
  const pages = await ocrImage(buffer.toString('base64'), mimeType);
  const text = pages
    .map((p) => p.text)
    .join('\n\n')
    .trim();
  return { text, storage_path: storagePath, mime_type: mimeType };
}

const MD_IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^)>\s]+)[^)]*>?\s*\)/g;

/**
 * Pull OCR diagram references out of a draft's text: strips the markdown image
 * tags (students get the diagram as an attached asset, not broken markdown) and
 * returns the matching manifest entries. Falls back to all diagrams on the
 * draft's source page when nothing is inlined.
 */
function extractDiagrams(
  text: string,
  manifest: OcrAssetRef[],
  sourcePage: number | null
): { cleaned: string; refs: OcrAssetRef[] } {
  if (manifest.length === 0) return { cleaned: text, refs: [] };

  const refs: OcrAssetRef[] = [];
  const matched = new Set<string>();

  const cleaned = text.replace(MD_IMAGE_RE, (whole, target: string) => {
    const base = String(target).split('/').pop() ?? target;
    const hit = manifest.find(
      (a) => a.img_id === target || a.img_id === base || a.storage_path.endsWith(base)
    );
    if (hit) {
      if (!matched.has(hit.storage_path)) {
        matched.add(hit.storage_path);
        refs.push(hit);
      }
      return ''; // drop the placeholder; it becomes an attached asset
    }
    return whole; // unknown ref — leave it (RichText renders a safe placeholder)
  });

  // Nothing inlined but this draft came from a page that has diagrams — attach
  // them so a figure is never silently lost.
  if (refs.length === 0 && sourcePage != null) {
    for (const a of manifest) {
      if (a.page_number === sourcePage && !matched.has(a.storage_path)) {
        matched.add(a.storage_path);
        refs.push(a);
      }
    }
  }

  return { cleaned: cleaned.replace(/\n{3,}/g, '\n\n').trim(), refs };
}

export interface PublishResult {
  published_count: number;
  skipped: Array<{ draft_id: string; reason: string }>;
}

export async function publishJob(jobId: string): Promise<PublishResult> {
  const { data: job, error: jobErr } = await supabase
    .from('ingestion_jobs')
    .select('id, program_course_id, status, ocr_assets')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  if (!job.program_course_id) {
    throw new ApiError(400, 'INVALID_JOB', 'Job has no program_course_id set');
  }
  const ocrAssets: OcrAssetRef[] = Array.isArray(job.ocr_assets) ? job.ocr_assets : [];

  const { data: drafts, error: draftsErr } = await supabase
    .from('ingestion_drafts')
    .select('id, draft_data, source_page')
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

    // Pull OCR diagrams out of the text → attach as assets, store clean text.
    const promptDiag = extractDiagrams(data.prompt, ocrAssets, draft.source_page);
    const explDiag = data.explanation
      ? extractDiagrams(data.explanation, ocrAssets, null)
      : { cleaned: data.explanation, refs: [] as OcrAssetRef[] };
    const diagramRefs = [...promptDiag.refs, ...explDiag.refs];

    const createInput = {
      program_course_id: job.program_course_id,
      topic_id: data.topic_id,
      type: data.type,
      difficulty: data.difficulty,
      exam_scope: data.exam_scope,
      content: {
        prompt:
          promptDiag.cleaned ||
          (promptDiag.refs.length > 0 ? 'See the diagram below.' : data.prompt),
        explanation: explDiag.cleaned,
        ...(data.source_reference ? { source_reference: data.source_reference } : {}),
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

      // Attach extracted OCR diagrams (non-fatal): the question is already
      // published; a storage hiccup must not orphan it.
      for (const ref of diagramRefs) {
        try {
          const buf = await downloadFile(ref.storage_path);
          await addQuestionAsset(created.id, buf, ref.mime, 'prompt');
        } catch (assetErr) {
          skipped.push({
            draft_id: draft.id,
            reason: `published, but a diagram failed to attach: ${errMsg(assetErr)}`,
          });
        }
      }

      // Attach the optional handwritten solution image (non-fatal): the
      // question is already published; a storage failure must not orphan it.
      if (data.solution_image_path) {
        try {
          const buf = await downloadFile(data.solution_image_path);
          await addQuestionAsset(
            created.id,
            buf,
            data.solution_image_mime ?? 'image/png',
            'solution'
          );
        } catch (assetErr) {
          skipped.push({
            draft_id: draft.id,
            reason: `published, but solution image failed to attach: ${errMsg(assetErr)}`,
          });
        }
      }

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
