import { Router } from 'express';
import multer from 'multer';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import {
  DraftUpdate,
  FileJobMeta,
  JobListQuery,
  TextJobCreate,
} from '../schemas/ingestion';
import { uploadFile } from '../services/storage';
import { publishJob, runExtraction } from '../services/ingestionService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
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
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
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
  upload.array('files', 60),
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
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;
      void runExtraction(data.id).catch((e) => console.error('extraction failed', e));
      res.status(201).json({ job_id: data.id, status: data.status });
      return;
    }

    const meta = parse(FileJobMeta, {
      source_type: sourceType,
      program_course_id: req.body.program_course_id,
      default_exam_scope: req.body.default_exam_scope,
      model: req.body.model,
      doc_type: req.body.doc_type,
    });

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length !== 1) throw new ApiError(400, 'NO_FILE', 'Exactly one file is required');

    const f = files[0];
    if (meta.source_type === 'pdf' && f.mimetype !== 'application/pdf') {
      throw new ApiError(400, 'BAD_MIME', `Expected a PDF file (got ${f.mimetype})`);
    }
    if (meta.source_type === 'image' && !f.mimetype.startsWith('image/')) {
      throw new ApiError(400, 'BAD_MIME', `Expected an image file (got ${f.mimetype})`);
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
        status: 'pending',
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    try {
      let filePath: string;
      if (meta.source_type === 'pdf') {
        filePath = `${jobRow.id}/document.pdf`;
      } else {
        const ext = f.mimetype === 'image/png' ? 'png' : 'jpg';
        filePath = `${jobRow.id}/page-001.${ext}`;
      }
      await uploadFile(filePath, f.buffer, f.mimetype);
    } catch (err) {
      await supabase.from('ingestion_jobs').delete().eq('id', jobRow.id);
      throw err;
    }

    await supabase
      .from('ingestion_jobs')
      .update({ source_path: `${jobRow.id}/` })
      .eq('id', jobRow.id);

    void runExtraction(jobRow.id).catch((e) => console.error('extraction failed', e));

    res.status(201).json({ job_id: jobRow.id, status: 'pending' });
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
  '/jobs/:id/publish',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const result = await publishJob(id);
    res.json(result);
  })
);

export default router;
