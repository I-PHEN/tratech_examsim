import { Router } from 'express';
import { ApiError, asyncHandler } from '../lib/errors';
import { runDueReminders } from '../services/scheduleService';

const router = Router();

router.post(
  '/run-due-reminders',
  asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const provided = req.header('x-cron-secret');
    // Fail closed: if no secret is configured, or it doesn't match, reject.
    if (!secret || provided !== secret) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid cron secret');
    }
    const result = await runDueReminders();
    res.json(result);
  })
);

export default router;
