import { Router } from 'express';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import {
  SessionAnswerSubmit,
  SessionCreate,
  SessionFinish,
  SessionListQuery,
} from '../schemas/session';
import {
  createSession,
  finishSession,
  getSessionById,
  listSessions,
  submitAnswer,
} from '../services/sessionService';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const body = parse(SessionCreate, req.body);
    const result = await createSession(uid, body);
    res.status(201).json(result);
  })
);

router.post(
  '/:id/answer',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    const body = parse(SessionAnswerSubmit, req.body);
    const result = await submitAnswer(uid, id, body);
    res.json(result);
  })
);

router.post(
  '/:id/finish',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    const body = parse(SessionFinish, req.body ?? {});
    const result = await finishSession(uid, id, body);
    res.json(result);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const query = parse(SessionListQuery, req.query);
    const data = await listSessions(uid, query.limit ?? 20, query.offset ?? 0);
    res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    const data = await getSessionById(uid, id);
    res.json(data);
  })
);

export default router;
