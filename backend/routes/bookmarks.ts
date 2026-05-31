import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { uuid } from '../schemas/common';
import { addBookmark, listBookmarks, removeBookmark } from '../services/bookmarkService';

const router = Router();

const CreateBody = z.object({ question_id: uuid });
const ListQuery = z.object({ program_course_id: uuid });
const QuestionIdParam = z.object({ question_id: uuid });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(ListQuery, req.query);
    res.json(await listBookmarks(uid, query.program_course_id));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const body = parse(CreateBody, req.body);
    await addBookmark(uid, body.question_id);
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/:question_id',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { question_id } = parse(QuestionIdParam, req.params);
    await removeBookmark(uid, question_id);
    res.status(204).end();
  })
);

export default router;
