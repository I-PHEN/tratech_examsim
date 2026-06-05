import { Router } from 'express';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import { ScheduleCreate, ScheduleUpdate } from '../schemas/schedule';
import {
  listSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  pauseSchedule,
  resumeSchedule,
  deleteSchedule,
} from '../services/scheduleService';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    res.json(await listSchedules(uid));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const body = parse(ScheduleCreate, req.body);
    const row = await createSchedule(uid, body);
    res.status(201).json(row);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    res.json(await getScheduleById(uid, id));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    const body = parse(ScheduleUpdate, req.body);
    const row = await updateSchedule(uid, id, body);
    res.json(row);
  })
);

router.post(
  '/:id/pause',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    const row = await pauseSchedule(uid, id);
    res.json(row);
  })
);

router.post(
  '/:id/resume',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    const row = await resumeSchedule(uid, id);
    res.json(row);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    await deleteSchedule(uid, id);
    res.status(204).end();
  })
);

export default router;
