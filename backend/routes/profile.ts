import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { getDb } from '../lib/firebase-admin';

const router = Router();

// Notification preferences live on the user profile, but the client-side
// Firestore rules intentionally whitelist only a fixed set of profile fields
// (department/year/semester/preferredName/themeAccent). Writing `notifications`
// from the browser is rejected, so the write goes through the Admin SDK here
// instead. The client still reads the value back via its profile onSnapshot.
const NOTIF_KEYS = ['weeklyReport', 'studyReminders', 'newContent'] as const;

router.patch(
  '/notifications',
  asyncHandler(async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required.');

    const { key, value } = parse(
      z.object({
        key: z.enum(NOTIF_KEYS),
        value: z.boolean(),
      }),
      req.body
    );

    // merge:true deep-merges the nested map, so sibling keys are preserved and
    // the write succeeds even if the doc has no `notifications` field yet.
    await getDb()
      .collection('users')
      .doc(uid)
      .set({ notifications: { [key]: value } }, { merge: true });

    res.json({ key, value });
  })
);

export default router;
