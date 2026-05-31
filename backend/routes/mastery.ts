import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { uuid } from '../schemas/common';
import { getCourseMastery } from '../services/masteryService';

const router = Router();

const MasteryQuery = z.object({ program_course_id: uuid });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(MasteryQuery, req.query);
    const data = await getCourseMastery(uid, query.program_course_id);
    res.json(data);
  })
);

export default router;
