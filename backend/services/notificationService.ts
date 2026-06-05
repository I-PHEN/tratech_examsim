import { supabase } from '../lib/supabase';
import { ApiError } from '../lib/errors';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  schedule_id: string | null;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread_count: number;
}

export async function createNotification(input: {
  user_uid: string;
  type: string;
  title: string;
  body?: string | null;
  schedule_id?: string | null;
  payload?: Record<string, unknown> | null;
  email_sent_at?: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_uid: input.user_uid,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      schedule_id: input.schedule_id ?? null,
      payload: input.payload ?? null,
      email_sent_at: input.email_sent_at ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export async function listNotifications(
  userUid: string,
  limit = 30
): Promise<NotificationFeed> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, schedule_id, payload, read_at, created_at')
    .eq('user_uid', userUid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    schedule_id: string | null;
    payload: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string;
  }>;

  const items: NotificationItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    schedule_id: row.schedule_id,
    payload: row.payload,
    read: row.read_at != null,
    created_at: row.created_at,
  }));

  const { count, error: countError } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_uid', userUid)
    .is('read_at', null);
  if (countError) throw countError;

  return { items, unread_count: count ?? 0 };
}

export async function markRead(userUid: string, id: string): Promise<void> {
  // First confirm the row belongs to this user.
  const { data: existing, error: selectError } = await supabase
    .from('notifications')
    .select('id')
    .eq('id', id)
    .eq('user_uid', userUid)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Notification not found.');

  // Update only if not already read (idempotent — already-read rows are fine).
  const { error: updateError } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_uid', userUid)
    .is('read_at', null);
  if (updateError) throw updateError;
}

export async function markAllRead(userUid: string): Promise<{ updated: number }> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_uid', userUid)
    .is('read_at', null)
    .select('id');
  if (error) throw error;
  return { updated: (data ?? []).length };
}

/** Hard-delete one notification, scoped to its owner. 404 if not found / not theirs. */
export async function deleteNotification(userUid: string, id: string): Promise<void> {
  const { error, count } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_uid', userUid);
  if (error) throw error;
  if ((count ?? 0) === 0) throw new ApiError(404, 'NOT_FOUND', 'Notification not found.');
}

/**
 * Hard-delete a user's notifications — all of them, or (when `scheduleId` is
 * given) just those for one schedule. Used by "Clear all" and by the deep-link
 * auto-dismiss when a reminder is opened.
 */
export async function clearNotifications(
  userUid: string,
  scheduleId?: string
): Promise<{ deleted: number }> {
  let q = supabase.from('notifications').delete({ count: 'exact' }).eq('user_uid', userUid);
  if (scheduleId) q = q.eq('schedule_id', scheduleId);
  const { error, count } = await q;
  if (error) throw error;
  return { deleted: count ?? 0 };
}
