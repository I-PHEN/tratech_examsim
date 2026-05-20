import type { Request, Response, NextFunction } from 'express';
import { getFirebaseAdmin } from './firebase-admin';
import { ApiError } from './errors';

export interface AuthUser {
  uid: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Bootstrap admins: hardcoded so the project owner can never be locked out
// of admin access, even if the Firestore `admins/` collection is empty or
// unreachable. Day-to-day admin grants happen through the in-app UI
// ("Admin Console → Manage Admins"), which writes to `admins/{uid}`.
const ADMIN_EMAILS = new Set<string>([
  'iphhennom@gmail.com',
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
    req.user = { uid: decoded.uid, email: decoded.email ?? null };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const email = req.user?.email;
  const uid = req.user?.uid;

  // Bootstrap path: hardcoded email allowlist always wins.
  if (email && ADMIN_EMAILS.has(email)) return next();

  // Firestore path: in-app "Manage Admins" writes a doc at admins/{uid}.
  // We check existence — the doc's contents (addedBy, addedAt) are audit
  // metadata, not gate values.
  if (uid) {
    try {
      const snap = await getFirebaseAdmin()
        .firestore()
        .collection('admins')
        .doc(uid)
        .get();
      if (snap.exists) return next();
    } catch (err) {
      // Fail closed if Firestore is unreachable — surface the error so the
      // user gets a clear message rather than a generic 403.
      return next(
        new ApiError(503, 'ADMIN_CHECK_UNAVAILABLE', 'Admin check failed: ' + (err instanceof Error ? err.message : 'unknown error'))
      );
    }
  }

  next(new ApiError(403, 'FORBIDDEN', 'Admin access required'));
}
