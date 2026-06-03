import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { requireOwner, getAdminRole } from '../lib/auth';
import { getFirebaseAdmin, getDb } from '../lib/firebase-admin';

const router = Router();

// Any authenticated user can ask for their own role — the frontend uses this to
// decide which admin UI (if any) to show. Returns `{ role: null }` for non-admins.
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const role = await getAdminRole(req.user?.uid, req.user?.email ?? null);
    res.json({ role });
  })
);

// Everything below is owner-only.

// List the granted admins (the Firestore `admins/{uid}` docs). Bootstrap owners
// from ADMIN_EMAILS are configured in env and are not listed here.
router.get(
  '/',
  requireOwner,
  asyncHandler(async (_req, res) => {
    const adminApp = getFirebaseAdmin();
    const snap = await getDb().collection('admins').get();
    const admins = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() ?? {};
        const role = data.role === 'editor' ? 'editor' : 'owner';
        let email: string | null = null;
        try {
          email = (await adminApp.auth().getUser(d.id)).email ?? null;
        } catch {
          // Account deleted but the admin doc lingers — surface it so it can be revoked.
        }
        const addedAt =
          typeof data.addedAt?.toDate === 'function' ? data.addedAt.toDate().toISOString() : null;
        return { uid: d.id, email, role, addedAt };
      })
    );
    res.json({ admins });
  })
);

// Grant admin access by email. New grants default to 'editor'.
router.post(
  '/',
  requireOwner,
  asyncHandler(async (req, res) => {
    const { email, role } = parse(
      z.object({
        email: z.string().email(),
        role: z.enum(['owner', 'editor']).default('editor'),
      }),
      req.body
    );

    const adminApp = getFirebaseAdmin();
    let user;
    try {
      user = await adminApp.auth().getUserByEmail(email);
    } catch {
      throw new ApiError(404, 'USER_NOT_FOUND', 'No account is registered with that email.');
    }

    await getDb().collection('admins').doc(user.uid).set({
      role,
      addedBy: req.user?.uid ?? 'unknown',
      addedAt: adminApp.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ uid: user.uid, email: user.email ?? email, role });
  })
);

// Revoke a granted admin. (Bootstrap owners live in env and have no doc to remove.)
router.delete(
  '/:uid',
  requireOwner,
  asyncHandler(async (req, res) => {
    const uid = req.params.uid;
    if (!uid) throw new ApiError(400, 'BAD_ID', 'uid required');
    if (uid === req.user?.uid) {
      throw new ApiError(400, 'CANNOT_REVOKE_SELF', "You can't revoke your own access.");
    }
    await getDb().collection('admins').doc(uid).delete();
    res.status(204).end();
  })
);

export default router;
