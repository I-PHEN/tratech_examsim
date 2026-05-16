import { Router } from 'express';
import multer from 'multer';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import { QuestionCreate, QuestionListQuery } from '../schemas/question';
import {
  addQuestionAsset,
  createQuestion,
  deleteQuestion,
  getQuestionById,
  listQuestions,
  removeQuestionAsset,
} from '../services/questionService';

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
    const asset = await addQuestionAsset(id, file.buffer, file.mimetype);
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
