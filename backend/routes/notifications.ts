import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { IdParam, uuid } from '../schemas/common';
import {
  listNotifications,
  markAllRead,
  markRead,
  deleteNotification,
  clearNotifications,
} from '../services/notificationService';

const router = Router();

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ClearQuery = z.object({
  schedule_id: uuid.optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { limit } = parse(ListQuery, req.query);
    res.json(await listNotifications(uid, limit ?? 30));
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    res.json(await markAllRead(uid));
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    await markRead(uid, id);
    res.json({ ok: true });
  })
);

// Clear all notifications, or just those for one schedule (?schedule_id=...).
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { schedule_id } = parse(ClearQuery, req.query);
    res.json(await clearNotifications(uid, schedule_id));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHORIZED', 'Missing user');
    const { id } = parse(IdParam, req.params);
    await deleteNotification(uid, id);
    res.status(204).end();
  })
);

export default router;
