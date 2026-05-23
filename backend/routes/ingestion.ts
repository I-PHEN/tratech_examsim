import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam, uuid } from '../schemas/common';
import {
  DraftUpdate,
  FileJobMeta,
  FormatTextInput,
  JobListQuery,
  PublishInput,
  ReviewedTextUpdate,
  SegmentsCreate,
  TextJobCreate,
} from '../schemas/ingestion';
import { uploadFile } from '../services/storage';
import {
  publishJob,
  extractJob,
  classifyJob,
  verifyJob,
  ocrSolutionImage,
  structureJob,
  suggestBoundaries,
  createSegmentDrafts,
  classifySegmentsJob,
  formatText,
  matchMarkschemeAnswers,
  splitDraft,
  mergeGroup,
} from '../services/ingestionService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 2 },
});

router.use(requireAdmin);

router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const query = parse(JobListQuery, req.query);
    const limit = query.limit ?? 30;
    let q = supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('created_by_uid', req.user!.uid)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (query.status) q = q.eq('status', query.status);
    if (query.archived === 'true') q = q.not('archived_at', 'is', null);
    else if (query.archived !== 'all') q = q.is('archived_at', null);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  })
);

router.post(
  '/jobs/:id/archive',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data, error } = await supabase
      .from('ingestion_jobs')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('created_by_uid', req.user!.uid)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
    res.json({ ok: true });
  })
);

router.post(
  '/jobs/:id/unarchive',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data, error } = await supabase
      .from('ingestion_jobs')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('created_by_uid', req.user!.uid)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
    res.json({ ok: true });
  })
);

router.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data: job, error: jobErr } = await supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('id', id)
      .eq('created_by_uid', req.user!.uid)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) throw new ApiError(404, 'NOT_FOUND', 'Job not found');

    const { data: drafts, error: draftsErr } = await supabase
      .from('ingestion_drafts')
      .select('*')
      .eq('job_id', id)
      .order('source_page', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (draftsErr) throw draftsErr;

    res.json({ job, drafts: drafts ?? [] });
  })
);

router.post(
  '/jobs',
  upload.fields([
    { name: 'files', maxCount: 1 },
    { name: 'markscheme', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const sourceType = req.body.source_type;

    if (sourceType === 'text') {
      const body = parse(TextJobCreate, req.body);
      const { data, error } = await supabase
        .from('ingestion_jobs')
        .insert({
          created_by_uid: req.user!.uid,
          source_type: 'text',
          source_text: body.text,
          program_course_id: body.program_course_id,
          default_exam_scope: body.default_exam_scope ?? null,
          model: body.model ?? null,
          doc_type: body.doc_type ?? 'past_paper',
          mode: body.mode ?? 'autonomous',
          status: 'uploaded',
        })
        .select()
        .single();
      if (error) throw error;
      res.status(201).json({ job_id: data.id, status: data.status });
      return;
    }

    const meta = parse(FileJobMeta, {
      source_type: sourceType,
      program_course_id: req.body.program_course_id,
      default_exam_scope: req.body.default_exam_scope,
      model: req.body.model,
      doc_type: req.body.doc_type,
      mode: req.body.mode,
    });

    const fileMap = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const files = fileMap.files ?? [];
    if (files.length !== 1) throw new ApiError(400, 'NO_FILE', 'Exactly one file is required');

    const f = files[0];
    if (meta.source_type === 'pdf' && f.mimetype !== 'application/pdf') {
      throw new ApiError(400, 'BAD_MIME', `Expected a PDF file (got ${f.mimetype})`);
    }
    if (meta.source_type === 'image' && !f.mimetype.startsWith('image/')) {
      throw new ApiError(400, 'BAD_MIME', `Expected an image file (got ${f.mimetype})`);
    }

    // Optional second upload: marking scheme / answer key (PDF or image).
    const markschemeFile = fileMap.markscheme?.[0];
    if (markschemeFile) {
      const ok =
        markschemeFile.mimetype === 'application/pdf' ||
        markschemeFile.mimetype.startsWith('image/');
      if (!ok) {
        throw new ApiError(
          400,
          'BAD_MIME',
          `Markscheme must be a PDF or image (got ${markschemeFile.mimetype})`
        );
      }
    }

    const { data: jobRow, error: insertErr } = await supabase
      .from('ingestion_jobs')
      .insert({
        created_by_uid: req.user!.uid,
        source_type: meta.source_type,
        program_course_id: meta.program_course_id,
        default_exam_scope: meta.default_exam_scope ?? null,
        model: meta.model ?? null,
        doc_type: meta.doc_type ?? 'past_paper',
        mode: meta.mode ?? 'autonomous',
        status: 'uploaded',
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    let markschemePath: string | null = null;
    try {
      let filePath: string;
      if (meta.source_type === 'pdf') {
        filePath = `${jobRow.id}/document.pdf`;
      } else {
        const ext = f.mimetype === 'image/png' ? 'png' : 'jpg';
        filePath = `${jobRow.id}/page-001.${ext}`;
      }
      await uploadFile(filePath, f.buffer, f.mimetype);

      if (markschemeFile) {
        const msExt =
          markschemeFile.mimetype === 'application/pdf'
            ? 'pdf'
            : markschemeFile.mimetype === 'image/png'
              ? 'png'
              : markschemeFile.mimetype === 'image/webp'
                ? 'webp'
                : 'jpg';
        markschemePath = `${jobRow.id}/markscheme.${msExt}`;
        await uploadFile(markschemePath, markschemeFile.buffer, markschemeFile.mimetype);
      }
    } catch (err) {
      await supabase.from('ingestion_jobs').delete().eq('id', jobRow.id);
      throw err;
    }

    await supabase
      .from('ingestion_jobs')
      .update({ source_path: `${jobRow.id}/`, markscheme_path: markschemePath })
      .eq('id', jobRow.id);

    res.status(201).json({ job_id: jobRow.id, status: 'uploaded' });
  })
);

router.patch(
  '/drafts/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(DraftUpdate, req.body);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.draft_data) update.draft_data = body.draft_data;
    if (body.status) update.status = body.status;

    const { data, error } = await supabase
      .from('ingestion_drafts')
      .update(update)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Draft not found');
    res.json(data);
  })
);

router.delete(
  '/drafts/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { error } = await supabase
      .from('ingestion_drafts')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    res.status(204).end();
  })
);

router.post(
  '/drafts/:id/split',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const result = await splitDraft(id);
    res.json(result);
  })
);

router.post(
  '/jobs/:id/groups/:groupKey/merge',
  asyncHandler(async (req, res) => {
    const { id, groupKey } = parse(
      z.object({ id: uuid, groupKey: uuid }),
      req.params
    );
    const result = await mergeGroup(id, groupKey);
    res.json(result);
  })
);

router.post(
  '/jobs/:id/extract',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    await extractJob(id);
    res.json({ ok: true });
  })
);

router.patch(
  '/jobs/:id/text',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(ReviewedTextUpdate, req.body);
    const { data, error } = await supabase
      .from('ingestion_jobs')
      .update({ reviewed_text: body.reviewed_text, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
    res.json({ ok: true });
  })
);

router.post(
  '/jobs/:id/structure',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    await structureJob(id);
    res.json({ ok: true });
  })
);

router.post(
  '/jobs/:id/suggest-boundaries',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const result = await suggestBoundaries(id);
    res.json(result);
  })
);

router.post(
  '/jobs/:id/segments',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(SegmentsCreate, req.body);
    const result = await createSegmentDrafts(id, body.segments, body.global);
    res.json(result);
  })
);

router.post(
  '/jobs/:id/classify-segments',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(SegmentsCreate, req.body);
    const result = await classifySegmentsJob(id, body.segments, body.global);
    res.json(result);
  })
);

router.post(
  '/format',
  asyncHandler(async (req, res) => {
    const body = parse(FormatTextInput, req.body);
    const result = await formatText(body.text);
    res.json(result);
  })
);

router.post(
  '/jobs/:id/classify',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    await classifyJob(id);
    res.json({ ok: true });
  })
);

router.post(
  '/jobs/:id/verify',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    await verifyJob(id);
    res.json({ ok: true });
  })
);

router.post(
  '/jobs/:id/match-answers',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const result = await matchMarkschemeAnswers(id);
    res.json(result);
  })
);

router.post(
  '/jobs/:id/ocr-image',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const file = req.file;
    if (!file) throw new ApiError(400, 'NO_FILE', 'An image file is required');
    if (!file.mimetype.startsWith('image/')) {
      throw new ApiError(400, 'BAD_MIME', `Expected an image (got ${file.mimetype})`);
    }
    const result = await ocrSolutionImage(id, file.buffer, file.mimetype);
    res.json(result);
  })
);

router.post(
  '/jobs/:id/publish',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(PublishInput, req.body ?? {});
    const result = await publishJob(id, body.draft_ids);
    res.json(result);
  })
);

export default router;
