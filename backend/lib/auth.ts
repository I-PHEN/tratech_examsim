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

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const email = req.user?.email;
  if (!email || !ADMIN_EMAILS.has(email)) {
    return next(new ApiError(403, 'FORBIDDEN', 'Admin access required'));
  }
  next();
}
