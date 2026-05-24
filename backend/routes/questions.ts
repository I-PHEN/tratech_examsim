import { Router } from 'express';
import multer from 'multer';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam, uuid } from '../schemas/common';
import {
  QuestionCreate,
  QuestionGroupUpdate,
  QuestionListQuery,
  QuestionUpdate,
} from '../schemas/question';
import { z } from 'zod';
import {
  addQuestionAsset,
  createQuestion,
  deleteQuestion,
  deleteQuestionGroup,
  getQuestionById,
  getQuestionsByGroup,
  listQuestions,
  removeQuestionAsset,
  updateQuestion,
  updateQuestionGroup,
} from '../services/questionService';
import { ocrImage } from '../lib/mistralOcr';

const router = Router();

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(QuestionListQuery, req.query);
    const data = await listQuestions(query);
    res.json(data);
  })
);

router.get(
  '/by-group/:groupId',
  asyncHandler(async (req, res) => {
    const { groupId } = parse(z.object({ groupId: z.string().uuid() }), req.params);
    const data = await getQuestionsByGroup(groupId);
    res.json(data);
  })
);

router.patch(
  '/by-group/:groupId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { groupId } = parse(z.object({ groupId: z.string().uuid() }), req.params);
    const body = parse(QuestionGroupUpdate, req.body);
    const data = await updateQuestionGroup(groupId, body);
    res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const data = await getQuestionById(id);
    res.json(data);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(QuestionCreate, req.body);
    const data = await createQuestion(body);
    res.status(201).json(data);
  })
);

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(QuestionUpdate, req.body);
    const data = await updateQuestion(id, body);
    res.json(data);
  })
);

router.post(
  '/ocr-solution',
  requireAdmin,
  assetUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new ApiError(400, 'NO_FILE', 'An image file is required');
    if (!file.mimetype.startsWith('image/')) {
      throw new ApiError(400, 'BAD_MIME', `Expected an image (got ${file.mimetype})`);
    }
    const pages = await ocrImage(file.buffer.toString('base64'), file.mimetype);
    const text = pages
      .map((p) => p.text)
      .join('\n\n')
      .trim();
    res.json({ text });
  })
);

router.delete(
  '/by-group/:groupId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { groupId } = parse(z.object({ groupId: uuid }), req.params);
    await deleteQuestionGroup(groupId);
    res.status(204).end();
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    await deleteQuestion(id);
    res.status(204).end();
  })
);

router.post(
  '/:id/assets',
  requireAdmin,
  assetUpload.single('file'),
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const file = req.file;
    if (!file) throw new ApiError(400, 'NO_FILE', 'A file is required');
    if (!file.mimetype.startsWith('image/')) {
      throw new ApiError(400, 'BAD_MIME', `Expected an image (got ${file.mimetype})`);
    }
    await getQuestionById(id);
    const kind = req.body?.kind === 'solution' ? 'solution' : 'prompt';
    const asset = await addQuestionAsset(id, file.buffer, file.mimetype, kind);
    res.status(201).json(asset);
  })
);

router.delete(
  '/:id/assets/:assetId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const assetId = req.params.assetId;
    if (!assetId) throw new ApiError(400, 'BAD_ID', 'asset id required');
    await removeQuestionAsset(id, assetId);
    res.status(204).end();
  })
);

export default router;
