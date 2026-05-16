import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

type PostgrestLikeError = { code?: string; message?: string; details?: string | null };

function mapPostgrestError(err: PostgrestLikeError): ApiError {
  switch (err.code) {
    case '23505':
      return new ApiError(409, 'DUPLICATE', err.message || 'Resource already exists', err.details);
    case '23503':
      return new ApiError(400, 'FK_VIOLATION', err.message || 'Referenced resource not found', err.details);
    case '23514':
      return new ApiError(400, 'CHECK_VIOLATION', err.message || 'Value violates check constraint', err.details);
    case 'PGRST116':
      return new ApiError(404, 'NOT_FOUND', 'Resource not found');
    default:
      return new ApiError(500, 'DB_ERROR', err.message || 'Database error', err.details);
  }
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.issues },
    });
    return;
  }

  if (typeof err === 'object' && err !== null && 'code' in err) {
    const mapped = mapPostgrestError(err as PostgrestLikeError);
    res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, details: mapped.details },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[unhandled error]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message },
  });
}
