import { supabase } from '../../lib/supabase';
import { ApiError } from '../../lib/errors';
import { parallelMap } from '../../lib/concurrency';
import { ocrPdf, ocrImage, type OcrPage } from '../../lib/mistralOcr';
import { classifyPage, classifyPageWithRetry, type ExtractedDraft, type TopicHint } from './classifier';
import { matchTopics } from './topicMatcher';
import { verifyQuestion } from './verifier';
import { downloadFile, listFiles } from '../storage';
import type { DraftDataInput } from '../../schemas/ingestion';

const TOPIC_CONFIDENCE_THRESHOLD = 0.7;
const CLASSIFY_CONCURRENCY_PAID = 3;
const CLASSIFY_CONCURRENCY_FREE = 1;
const VERIFY_CONCURRENCY = 5;

function classifyConcurrencyFor(model: string | null): number {
  const effective = model ?? process.env.OPENROUTER_DEFAULT_MODEL ?? '';
  return effective.endsWith(':free') ? CLASSIFY_CONCURRENCY_FREE : CLASSIFY_CONCURRENCY_PAID;
}

interface JobRow {
  id: string;
  source_type: 'pdf' | 'image' | 'text';
  source_path: string | null;
  source_text: string | null;
  default_exam_scope: 'midsem' | 'final' | 'both' | null;
  program_course_id: string | null;
  status: string;
  model: string | null;
  doc_type: string | null;
}

async function updateJob(jobId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('ingestion_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw error;
}

async function loadStorageFile(path: string): Promise<Buffer> {
  return downloadFile(path);
}

async function loadStoragePages(prefix: string): Promise<{ name: string; buffer: Buffer; mime: string }[]> {
  const cleaned = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const files = await listFiles(cleaned);

  // PDF stored as single document.pdf
  const pdfFile = files.find((f) => f.name === 'document.pdf');
  if (pdfFile) {
    const buf = await loadStorageFile(`${cleaned}/${pdfFile.name}`);
    return [{ name: pdfFile.name, buffer: buf, mime: 'application/pdf' }];
  }

  // Legacy: PNG pages from old pipeline
  const sorted = files.filter((f) => /^page-\d+/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length === 0) throw new Error(`No page files found at ${prefix}`);
  const pages = [];
  for (const f of sorted) {
    const buf = await loadStorageFile(`${cleaned}/${f.name}`);
    pages.push({ name: f.name, buffer: buf, mime: f.name.endsWith('.png') ? 'image/png' : 'image/jpeg' });
  }
  return pages;
}

function toDraftData(
  d: ExtractedDraft,
  defaultScope: string | null,
  validTopicIds: Set<string>
): DraftDataInput {
  const draft: DraftDataInput = { type: d.type, prompt: d.prompt };
  if (d.difficulty) draft.difficulty = d.difficulty;
  if (defaultScope) draft.exam_scope = defaultScope as 'midsem' | 'final' | 'both';
  const confidence = d.confidence ?? 0;
  if (d.topic_id && validTopicIds.has(d.topic_id) && confidence >= TOPIC_CONFIDENCE_THRESHOLD) {
    draft.topic_id = d.topic_id;
  }
  if (d.type === 'mcq' && Array.isArray(d.options) && d.options.length >= 2) {
    draft.options = d.options;
  }
  if (d.type === 'calc') {
    if (d.correct_answer) draft.correct_answer = d.correct_answer;
    if (d.answer_type) draft.answer_type = d.answer_type;
    if (d.answer_tolerance) draft.answer_tolerance = d.answer_tolerance;
    if (d.unit) draft.unit = d.unit;
  }
  if (d.explanation) draft.explanation = d.explanation;
  return draft;
}

export async function runPipeline(jobId: string): Promise<void> {
  const { data: rawJob, error: jobErr } = await supabase
    .from('ingestion_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!rawJob) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  const job = rawJob as JobRow;

  await updateJob(jobId, { status: 'extracting', stage: 'ocr', error_message: null });

  try {
    // Load topics
    let topics: TopicHint[] = [];
    if (job.program_course_id) {
      const { data: tRows, error: tErr } = await supabase
        .from('topics')
        .select('id, name, description')
        .eq('program_course_id', job.program_course_id);
      if (tErr) throw tErr;
      topics = tRows ?? [];
    }
    const validTopicIds = new Set(topics.map((t) => t.id));
    const docType = job.doc_type ?? 'past_paper';

    // === STAGE 1: OCR ===
    let transcripts: OcrPage[];

    if (job.source_type === 'text') {
      if (!job.source_text) throw new Error('Text source has no content');
      transcripts = [{ page_number: 1, text: job.source_text }];
    } else {
      if (!job.source_path) throw new Error('File source has no storage path');
      const storageFiles = await loadStoragePages(job.source_path);

      if (storageFiles.length === 1 && storageFiles[0].mime === 'application/pdf') {
        transcripts = await ocrPdf(storageFiles[0].buffer);
      } else {
        // Image(s) — send each to Mistral OCR and flatten
        const pageResults = await Promise.all(
          storageFiles.map(async (f, idx) => {
            const base64 = f.buffer.toString('base64');
            const pages = await ocrImage(base64, f.mime);
            // Override page numbers to sequential
            return pages.map((p) => ({ ...p, page_number: idx + 1 }));
          })
        );
        transcripts = pageResults.flat();
      }
    }

    // Persist transcripts and advance stage
    await updateJob(jobId, {
      transcripts: transcripts.map((p) => ({ page_number: p.page_number, text: p.text })),
      stage: 'classifying',
    });

    // === STAGE 2: CLASSIFY (per page) ===
    const classifyConcurrency = classifyConcurrencyFor(job.model);
    const pageGroups = await parallelMap(transcripts, classifyConcurrency, (page) =>
      classifyPage(page.text, page.page_number, docType, topics, job.model ?? undefined)
    );
    const allDrafts: ExtractedDraft[] = pageGroups.flat();

    await updateJob(jobId, { stage: 'matching' });

    // === STAGE 3: TOPIC MATCH ===
    if (topics.length > 0 && allDrafts.length > 0) {
      const matches = await matchTopics(allDrafts, topics, job.model ?? undefined);
      for (const m of matches) {
        const draft = allDrafts[m.question_index];
        if (draft && m.topic_id && m.confidence >= TOPIC_CONFIDENCE_THRESHOLD) {
          draft.topic_id = m.topic_id;
          draft.confidence = m.confidence;
        }
      }
    }

    await updateJob(jobId, { stage: 'verifying' });

    // === STAGE 4: VERIFY + RETRY (per question, concurrency 5) ===
    const verificationWarnings: (string[] | null)[] = new Array(allDrafts.length).fill(null);

    await parallelMap(allDrafts, VERIFY_CONCURRENCY, async (draft, i) => {
      const sourcePage = transcripts.find((p) => p.page_number === draft.source_page);
      if (!sourcePage) return;

      const { complete, missing } = await verifyQuestion(
        draft.prompt,
        sourcePage.text,
        job.model ?? undefined
      );

      if (!complete && missing.length > 0) {
        // One retry
        const retried = await classifyPageWithRetry(
          sourcePage.text,
          sourcePage.page_number,
          docType,
          topics,
          missing,
          job.model ?? undefined
        );
        const match = retried.find((r) => r.source_page === draft.source_page);
        if (match) {
          // Verify the retry
          const { complete: retryComplete, missing: retryMissing } = await verifyQuestion(
            match.prompt,
            sourcePage.text,
            job.model ?? undefined
          );
          if (retryComplete || retryMissing.length < missing.length) {
            allDrafts[i] = { ...draft, prompt: match.prompt };
            if (!retryComplete) verificationWarnings[i] = retryMissing;
          } else {
            verificationWarnings[i] = missing;
          }
        } else {
          verificationWarnings[i] = missing;
        }
      }
    });

    // === PERSIST ===
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
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: 'failed', error_message: msg });
  }
}
