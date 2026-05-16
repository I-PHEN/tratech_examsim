import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { uuid } from '../schemas/common';
import {
  accuracyTrend,
  byDifficulty,
  byTopic,
  overview,
} from '../services/analyticsService';

const router = Router();

const ByTopicQuery = z.object({ program_course_id: uuid.optional() });
const TrendQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() });

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const data = await overview(uid);
    res.json(data);
  })
);

router.get(
  '/by-topic',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(ByTopicQuery, req.query);
    const data = await byTopic(uid, query.program_course_id);
    res.json(data);
  })
);

router.get(
  '/accuracy-trend',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(TrendQuery, req.query);
    const data = await accuracyTrend(uid, query.limit ?? 10);
    res.json(data);
  })
);

router.get(
  '/by-difficulty',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const data = await byDifficulty(uid);
    res.json(data);
  })
);

export default router;
