import type { Request, Response, NextFunction } from 'express';
import { getFirebaseAdmin, getDb } from './firebase-admin';
import { retryTransient } from './retry';
import { ApiError } from './errors';

export type AdminRole = 'owner' | 'editor';

export interface AuthUser {
  uid: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      adminRole?: AdminRole;
    }
  }
}

// Bootstrap OWNERS: hardcoded so the project's builders can never be locked
// out, even if the Firestore `admins/` collection is empty or unreachable.
// Any email here resolves as an 'owner'. Day-to-day grants happen through the
// in-app UI ("Admin Console → Manage Admins") and default to 'editor'.
const ADMIN_EMAILS = new Set<string>([
  'iphhennom@gmail.com',
  // TODO(owners): add the three other builder emails here so they resolve as
  // owners on sign-in (they can also be promoted via Manage Admins).
]);

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization') || req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Empty bearer token');

    const decoded = await getFirebaseAdmin().auth().verifyIdToken(token);
    // Real-email gate: Firebase only validates email format on signup, not
    // ownership. Block API access until the user clicks the verification link.
    // Google sign-in stamps email_verified: true automatically.
    if (decoded.email_verified !== true) {
      throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address to continue.');
    }
    req.user = { uid: decoded.uid, email: decoded.email ?? null };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

/**
 * Resolves a user's admin role, or null for non-admins.
 *
 * Bootstrap emails are always owners. Otherwise the `admins/{uid}` doc decides:
 * an explicit `role: 'editor'` is an editor; anything else (an explicit
 * `role: 'owner'`, or a legacy doc with no `role` field — those were full
 * admins before tiering existed) resolves as an owner.
 */
export async function getAdminRole(
  uid?: string,
  email?: string | null
): Promise<AdminRole | null> {
  if (email && ADMIN_EMAILS.has(email)) return 'owner';
  if (!uid) return null;
  try {
    const snap = await retryTransient(() => getDb().collection('admins').doc(uid).get());
    if (!snap.exists) return null;
    return snap.data()?.role === 'editor' ? 'editor' : 'owner';
  } catch (err) {
    // Fail closed if Firestore is unreachable — surface a clear error.
    throw new ApiError(
      503,
      'ADMIN_CHECK_UNAVAILABLE',
      'Admin check failed: ' + (err instanceof Error ? err.message : 'unknown error')
    );
  }
}

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = await getAdminRole(req.user?.uid, req.user?.email ?? null);
    if (!role) return next(new ApiError(403, 'FORBIDDEN', 'Admin access required'));
    req.adminRole = role;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : new ApiError(403, 'FORBIDDEN', 'Admin access required'));
  }
}

/** Owner-only gate. Use in place of `requireAdmin` on destructive / admin-management routes. */
export async function requireOwner(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = req.adminRole ?? (await getAdminRole(req.user?.uid, req.user?.email ?? null));
    if (role !== 'owner') return next(new ApiError(403, 'FORBIDDEN', 'Owner access required'));
    req.adminRole = role;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : new ApiError(403, 'FORBIDDEN', 'Owner access required'));
  }
}
