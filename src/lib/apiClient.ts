import { auth } from './firebase';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function throwForResponse(method: string, path: string, res: Response): Promise<never> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
    if (body?.error?.message) {
      throw new ApiError(res.status, body.error.code ?? 'UNKNOWN', body.error.message);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
  }
  throw new ApiError(res.status, 'UNKNOWN', `${method} ${path} failed: ${res.status} ${text}`);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: await authHeaders() });
  if (!res.ok) await throwForResponse('GET', path, res);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwForResponse('POST', path, res);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwForResponse('PATCH', path, res);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE', headers: await authHeaders() });
  if (!res.ok && res.status !== 204) await throwForResponse('DELETE', path, res);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  });
  if (!res.ok) await throwForResponse('UPLOAD', path, res);
  return res.json();
}
