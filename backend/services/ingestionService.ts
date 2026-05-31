import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';
import {
  runPipeline,
  loadJob,
  loadTopics,
  performOcr,
  performClassify,
  toDraftData,
  type JobRow,
} from './extraction/pipeline';
import type { OcrPage } from '../lib/mistralOcr';
import { ocrImage, ocrPdf, decodeOcrImage } from '../lib/mistralOcr';
import { parallelMap } from '../lib/concurrency';
import { verifyQuestion } from './extraction/verifier';
import { classifyPage, classifyPageWithRetry } from './extraction/classifier';
import { matchAnswers } from './extraction/answerMatcher';
import {
  splitMultipartQuestion,
  expandMultipartRows,
  partsToRows,
} from './extraction/questionSplitter';
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
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) {
      // Supabase / Postgres errors are plain objects, not Error instances —
      // String(err) would mangle them to "[object Object]". Surface the real
      // message plus any details / hint / code.
      const extra = [o.details, o.hint, o.code]
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .join(' · ');
      return extra ? `${o.message} (${extra})` : o.message;
    }
  }
  return String(err);
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

/** OCR-and-cache a job's marking scheme, returning its text ('' when none). */
async function resolveMarkschemeText(job: JobRow): Promise<string> {
  if (!job.markscheme_path) return '';
  if (job.markscheme_text && job.markscheme_text.trim()) return job.markscheme_text;
  try {
    const text = await ocrMarkscheme(job.markscheme_path);
    if (text.trim()) {
      await updateJob(job.id, { markscheme_text: text });
      job.markscheme_text = text; // keep the in-memory job consistent
    }
    return text;
  } catch (err) {
    console.warn(`[ingestion] markscheme OCR failed for job ${job.id}: ${errMsg(err)}`);
    return '';
  }
}

/** OCR an uploaded marking scheme (PDF or image) into a single text blob. */
async function ocrMarkscheme(markschemePath: string): Promise<string> {
  const buffer = await downloadFile(markschemePath);
  const lower = markschemePath.toLowerCase();
  let pages: OcrPage[];
  if (lower.endsWith('.pdf')) {
    pages = await ocrPdf(buffer);
  } else {
    const mime = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    pages = await ocrImage(buffer.toString('base64'), mime);
  }
  return pages
    .map((p) => p.text)
    .join('\n\n')
    .trim();
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
    // Cache the markscheme OCR early so answer-matching is fast later.
    // Non-fatal: a markscheme hiccup must not fail the questions extraction.
    if (job.markscheme_path && !job.markscheme_text) {
      try {
        const markschemeText = await ocrMarkscheme(job.markscheme_path);
        await updateJob(jobId, { markscheme_text: markschemeText });
      } catch (msErr) {
        console.warn(`[ingestion] markscheme OCR failed for job ${jobId}: ${errMsg(msErr)}`);
      }
    }
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

    const rawRows = allDrafts.map((d, i) => ({
      job_id: jobId,
      draft_data: toDraftData(d, job.default_exam_scope, validTopicIds),
      source_page: d.source_page ?? null,
      ai_confidence: d.confidence ?? null,
      verification_warnings: verificationWarnings[i] ?? null,
    }));

    // Split multi-part questions into one draft per sub-part. With a markscheme
    // uploaded, the split pass places each part's answer + worked solution.
    const markschemeText = await resolveMarkschemeText(job);
    const rows = await expandMultipartRows(rawRows, {
      markschemeText,
      model: job.model ?? undefined,
    });

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('ingestion_drafts').insert(rows);
      if (insertErr) throw insertErr;
    }

    await updateJob(jobId, {
      status: 'ready_for_review',
      stage: 'done',
      total_drafts: rows.length,
    });

    // Pre-fill answers from an uploaded markscheme. Non-fatal: a matching
    // failure must not fail a job whose questions extracted fine.
    if (job.markscheme_path) {
      try {
        await matchMarkschemeAnswers(jobId);
      } catch (matchErr) {
        console.warn(
          `[ingestion] markscheme matching failed for job ${jobId}: ${errMsg(matchErr)}`
        );
      }
    }
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

  // Grouped (multi-part) drafts have split-pass-generated prompts — verifying
  // them against the full source text is meaningless, so skip them.
  const verifiable = (drafts ?? []).filter(
    (dr) => !(dr.draft_data as DraftDataInput).group_key
  );

  await parallelMap(verifiable, 3, async (draft) => {
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

/**
 * OCR the uploaded marking scheme (if not cached) and pre-fill each pending
 * draft's correct answer + worked solution with the matched content. Filled
 * fields are flagged `ai_matched` so the reviewer verifies them rather than
 * trusting blindly. A field a reviewer has already edited (flag cleared) is
 * never clobbered. No-op when the job has no markscheme.
 */
export async function matchMarkschemeAnswers(jobId: string): Promise<{ matched: number }> {
  const job = await loadJob(jobId);
  if (!job.markscheme_path) return { matched: 0 };

  let markschemeText = job.markscheme_text ?? '';
  if (!markschemeText.trim()) {
    markschemeText = await ocrMarkscheme(job.markscheme_path);
    await updateJob(jobId, { markscheme_text: markschemeText });
  }
  if (!markschemeText.trim()) return { matched: 0 };

  const { data: drafts, error } = await supabase
    .from('ingestion_drafts')
    .select('id, draft_data')
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .order('source_page', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!drafts || drafts.length === 0) return { matched: 0 };

  // Grouped (multi-part) drafts get their answers from the split pass — the
  // per-question matcher can't tell which markscheme slice belongs to which
  // part. Match only standalone drafts here.
  const matchable = drafts.filter((dr) => !(dr.draft_data as DraftDataInput).group_key);
  if (matchable.length === 0) return { matched: 0 };

  const matches = await matchAnswers(
    matchable.map((dr) => {
      const d = dr.draft_data as DraftDataInput;
      return { prompt: d.prompt, type: d.type };
    }),
    markschemeText,
    job.model ?? undefined
  );

  let matched = 0;
  for (const m of matches) {
    if (!m.found || m.question_index == null) continue;
    const draftRow = matchable[m.question_index];
    if (!draftRow) continue;

    const d = { ...(draftRow.draft_data as DraftDataInput) };
    const aiMatched = { ...(d.ai_matched ?? {}) };
    const answer = m.final_answer?.trim();
    const solution = m.worked_solution?.trim();
    let touched = false;

    // Worked solution → explanation (both question types).
    if (solution && (!d.explanation?.trim() || aiMatched.explanation)) {
      d.explanation = solution;
      aiMatched.explanation = true;
      touched = true;
    }

    if (d.type === 'calc') {
      if (answer && (!d.correct_answer?.trim() || aiMatched.correct_answer)) {
        d.correct_answer = answer;
        aiMatched.correct_answer = true;
        touched = true;
      }
      const unitFromMatch = m.final_unit?.trim();
      if (unitFromMatch && (!d.unit?.trim() || aiMatched.correct_answer)) {
        d.unit = unitFromMatch;
        touched = true;
      }
      // Safety net: if the LLM ignored the "no units in answer" instruction and
      // glued a unit onto `correct_answer` (e.g. "12.4 dm^3"), split it apart.
      if (d.correct_answer && !d.unit) {
        const m2 = /^([+-]?\d[\d.eE+\-]*)\s+(\S.*)$/.exec(d.correct_answer.trim());
        if (m2) {
          d.correct_answer = m2[1];
          d.unit = m2[2].trim();
          touched = true;
        }
      }
    } else if (d.type === 'mcq' && m.correct_option && Array.isArray(d.options)) {
      // Best-effort: mark the option whose text matches the markscheme answer,
      // but only when the reviewer/classifier hasn't already chosen one.
      const target = m.correct_option.trim().toLowerCase();
      const idx = d.options.findIndex((o) => {
        const t = o.text.trim().toLowerCase();
        return t === target || (target.length > 0 && (t.includes(target) || target.includes(t)));
      });
      if (idx >= 0 && !d.options.some((o) => o.is_correct)) {
        d.options = d.options.map((o, i) => ({ ...o, is_correct: i === idx }));
        touched = true;
      }
    }

    if (!touched) continue;
    d.ai_matched = aiMatched;
    const { error: updErr } = await supabase
      .from('ingestion_drafts')
      .update({ draft_data: d, updated_at: new Date().toISOString() })
      .eq('id', draftRow.id);
    if (updErr) throw updErr;
    matched += 1;
  }

  return { matched };
}

/**
 * Manually split one pending draft into its sub-parts — for a multi-part
 * question the auto-split missed, or one a reviewer merged and wants to retry.
 * Hard-replaces the draft with one row per sub-part sharing a question group.
 */
export async function splitDraft(draftId: string): Promise<{ parts: number }> {
  const { data: draft, error } = await supabase
    .from('ingestion_drafts')
    .select('id, job_id, draft_data, source_page, ai_confidence, status')
    .eq('id', draftId)
    .maybeSingle();
  if (error) throw error;
  if (!draft) throw new ApiError(404, 'NOT_FOUND', 'Draft not found');
  if (draft.status !== 'pending') {
    throw new ApiError(409, 'NOT_PENDING', 'Only a pending draft can be split.');
  }

  const d = draft.draft_data as DraftDataInput;
  const job = await loadJob(draft.job_id);
  const solutionSource = (await resolveMarkschemeText(job)) || d.explanation;

  const { parts, shared_stem } = await splitMultipartQuestion(
    d.prompt,
    solutionSource,
    job.model ?? undefined
  );
  if (parts.length < 2) {
    throw new ApiError(
      422,
      'SPLIT_FAILED',
      'Could not split this question into multiple parts. Check the prompt lists each sub-part clearly, then try again.'
    );
  }

  const newRows = partsToRows(
    {
      job_id: draft.job_id,
      draft_data: d,
      source_page: draft.source_page,
      ai_confidence: draft.ai_confidence,
    },
    parts,
    shared_stem
  );

  const { error: delErr } = await supabase
    .from('ingestion_drafts')
    .delete()
    .eq('id', draftId);
  if (delErr) throw delErr;

  const { error: insErr } = await supabase.from('ingestion_drafts').insert(newRows);
  if (insErr) throw insErr;

  return { parts: newRows.length };
}

/**
 * Merge a multi-part draft group back into a single draft. Restores the
 * original whole-question prompt (from any part's `raw_text`); per-part answers
 * are dropped — they belong to the parts. The merged draft keeps `part_labels`
 * so the review UI still offers a re-split.
 */
export async function mergeGroup(
  jobId: string,
  groupKey: string
): Promise<{ ok: true }> {
  const { data: drafts, error } = await supabase
    .from('ingestion_drafts')
    .select('id, draft_data, source_page, ai_confidence')
    .eq('job_id', jobId)
    .eq('status', 'pending');
  if (error) throw error;

  const parts = (drafts ?? [])
    .filter((dr) => (dr.draft_data as DraftDataInput).group_key === groupKey)
    .sort(
      (a, b) =>
        ((a.draft_data as DraftDataInput).part_index ?? 0) -
        ((b.draft_data as DraftDataInput).part_index ?? 0)
    );
  if (parts.length === 0) throw new ApiError(404, 'NOT_FOUND', 'Question group not found.');

  const first = parts[0];
  const partDatas = parts.map((p) => p.draft_data as DraftDataInput);
  const firstData = partDatas[0];

  const mergedPrompt =
    firstData.raw_text?.trim() ||
    partDatas.map((d) => `(${d.part_label ?? '?'}) ${d.prompt}`).join('\n\n');

  const mergedData: DraftDataInput = {
    type: firstData.type,
    prompt: mergedPrompt,
    part_labels: partDatas.map((d) => d.part_label ?? '').filter((l) => l.length > 0),
  };
  if (firstData.difficulty) mergedData.difficulty = firstData.difficulty;
  if (firstData.topic_id) mergedData.topic_id = firstData.topic_id;
  if (firstData.exam_scope) mergedData.exam_scope = firstData.exam_scope;
  if (firstData.source_reference) mergedData.source_reference = firstData.source_reference;

  const { error: delErr } = await supabase
    .from('ingestion_drafts')
    .delete()
    .in(
      'id',
      parts.map((p) => p.id)
    );
  if (delErr) throw delErr;

  const { error: insErr } = await supabase.from('ingestion_drafts').insert({
    job_id: jobId,
    draft_data: mergedData,
    source_page: first.source_page,
    ai_confidence: first.ai_confidence,
  });
  if (insErr) throw insErr;

  return { ok: true };
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

    const rawRows = perSegment.flat();

    // Split multi-part questions into one draft per sub-part.
    const markschemeText = await resolveMarkschemeText(job);
    const rows = await expandMultipartRows(rawRows, {
      markschemeText,
      model: job.model ?? undefined,
    });

    await supabase.from('ingestion_drafts').delete().eq('job_id', jobId);
    const { error: insertErr } = await supabase.from('ingestion_drafts').insert(rows);
    if (insertErr) throw insertErr;

    await updateJob(jobId, {
      status: 'ready_for_review',
      stage: 'done',
      total_drafts: rows.length,
    });

    // Pre-fill answers from an uploaded markscheme. Non-fatal.
    if (job.markscheme_path) {
      try {
        await matchMarkschemeAnswers(jobId);
      } catch (matchErr) {
        console.warn(
          `[ingestion] markscheme matching failed for job ${jobId}: ${errMsg(matchErr)}`
        );
      }
    }

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
 * Pull OCR diagram references out of a draft's text: strips every markdown
 * image placeholder (matched or orphaned — students get the diagram as an
 * attached asset, not broken markdown) and returns the matching manifest
 * entries. Falls back to all diagrams on the draft's source page when nothing
 * inlined matched, OR when at least one placeholder was an orphan, so a real
 * figure is never silently lost.
 */
export function extractDiagrams(
  text: string,
  manifest: OcrAssetRef[],
  sourcePage: number | null
): { cleaned: string; refs: OcrAssetRef[] } {
  if (manifest.length === 0) return { cleaned: text, refs: [] };

  const refs: OcrAssetRef[] = [];
  const matched = new Set<string>();
  let hadUnmatched = false;

  const cleaned = text.replace(MD_IMAGE_RE, (_whole, target: string) => {
    const base = String(target).split('/').pop() ?? target;
    const hit = manifest.find(
      (a) => a.img_id === target || a.img_id === base || a.storage_path.endsWith(base)
    );
    if (hit) {
      if (!matched.has(hit.storage_path)) {
        matched.add(hit.storage_path);
        refs.push(hit);
      }
    } else {
      hadUnmatched = true;
    }
    // Always drop the placeholder — an unmatched ref would otherwise render as
    // a broken-image "diagram" pill in production.
    return '';
  });

  // Attach page-level diagrams when nothing inlined OR some refs were orphans,
  // so a figure is never silently lost.
  if ((hadUnmatched || refs.length === 0) && sourcePage != null) {
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

/**
 * Publish a job's pending drafts as real questions. With `draftIds` only those
 * drafts are published (publish one question at a time); without it, all
 * pending drafts publish together. Sub-parts of a multi-part group should
 * always be passed together so they share one `question_group_id`.
 */
export async function publishJob(
  jobId: string,
  draftIds?: string[]
): Promise<PublishResult> {
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

  let draftsQuery = supabase
    .from('ingestion_drafts')
    .select('id, draft_data, source_page')
    .eq('job_id', jobId)
    .eq('status', 'pending');
  if (draftIds && draftIds.length > 0) {
    draftsQuery = draftsQuery.in('id', draftIds);
  }
  const { data: drafts, error: draftsErr } = await draftsQuery;
  if (draftsErr) throw draftsErr;

  const skipped: Array<{ draft_id: string; reason: string }> = [];
  let publishedCount = 0;

  // Sub-parts of one source question share a draft_data.group_key — give each
  // distinct group_key one freshly-generated question_group_id.
  const groupIdByKey = new Map<string, string>();
  for (const draft of drafts ?? []) {
    const gk = (draft.draft_data as DraftDataInput).group_key;
    if (gk && !groupIdByKey.has(gk)) groupIdByKey.set(gk, randomUUID());
  }

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
        ...(data.shared_stem?.trim() ? { shared_stem: data.shared_stem.trim() } : {}),
        ...(data.source_reference ? { source_reference: data.source_reference } : {}),
        ...(data.type === 'calc' && data.answer_type !== 'multi'
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
      ...(data.type === 'calc' && data.answer_type === 'multi'
        ? { answer_fields: data.answer_fields ?? [] }
        : {}),
      ...(data.group_key
        ? {
            question_group_id: groupIdByKey.get(data.group_key),
            part_label: data.part_label,
            part_index: data.part_index,
          }
        : {}),
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
      skipped.push({ draft_id: draft.id, reason: errMsg(err) });
    }
  }

  // Mark the job published only once no pending drafts remain — supports
  // publishing one question at a time without prematurely closing the job.
  const { count: remaining } = await supabase
    .from('ingestion_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('status', 'pending');
  if ((remaining ?? 0) === 0 && publishedCount > 0) {
    await updateJob(jobId, { status: 'published' });
  }

  return { published_count: publishedCount, skipped };
}
