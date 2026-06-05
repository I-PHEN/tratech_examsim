import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState } from './ui/EmptyState';
import { apiGet, apiPost } from '../lib/apiClient';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  schedule_id: string | null;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unread_count: number;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  return `${diffDay}d`;
}

interface NotificationsBellProps {
  onOpenReminder?: (scheduleId: string | null, payload: Record<string, unknown> | null) => void;
}

export function NotificationsBell({ onOpenReminder }: NotificationsBellProps = {}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const loadNotifications = (onDone?: () => void) => {
    let cancelled = false;
    apiGet<NotificationsResponse>('/api/notifications')
      .then((data) => {
        if (!cancelled) {
          setNotifications(data.items);
          setUnreadCount(data.unread_count);
        }
      })
      .catch((err) => {
        console.error('NotificationsBell: fetch failed', err);
      })
      .finally(() => {
        if (!cancelled) onDone?.();
      });
    return () => { cancelled = true; };
  };

  // Fetch on mount + re-fetch on window focus
  useEffect(() => {
    const cleanup = loadNotifications();

    const handleFocus = () => loadNotifications();
    window.addEventListener('focus', handleFocus);

    return () => {
      cleanup();
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Outside-click / Escape close
  useEffect(() => {
    if (!open) return;

    const handlePointer = (e: MouseEvent | TouchEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleMarkOne = (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    apiPost<{ ok: boolean }>(`/api/notifications/${id}/read`, {}).catch((err) => {
      console.error('NotificationsBell: mark-read failed', err);
      // Roll back optimistic update on failure
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
      );
      setUnreadCount((c) => c + 1);
    });
  };

  const handleMarkAll = () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    apiPost<{ updated: number }>('/api/notifications/read-all', {}).catch((err) => {
      console.error('NotificationsBell: mark-all-read failed', err);
      // Re-fetch real state on failure
      loadNotifications();
    });
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        className={cn(
          'relative p-2 rounded-xl transition-[transform,opacity,box-shadow,background-color,color] active:scale-95',
          open
            ? 'bg-bg-raised text-text-primary'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-raised',
        )}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-1 rounded-full bg-accent text-slate-950 text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] z-50 origin-top-right animate-fade-in rounded-2xl bg-bg-raised border border-border-medium shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h3 className="font-display italic text-lg text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-text">
                  {unreadCount} new
                </span>
                <button
                  onClick={handleMarkAll}
                  className="text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2"
                >
                  Mark all read
                </button>
              </div>
            )}
          </div>

          <div className="p-3">
            {notifications.length === 0 ? (
              <EmptyState
                icon={BellOff}
                size="sm"
                title="You're all caught up"
                description="No new notifications right now. We'll let you know when something needs your attention."
                className="border-none bg-transparent"
              />
            ) : (
              <ul className="space-y-1">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => {
                      if (!n.read) handleMarkOne(n.id);
                      if (onOpenReminder) {
                        onOpenReminder(n.schedule_id, n.payload);
                        setOpen(false);
                      }
                    }}
                    className={cn(
                      'rounded-xl px-3 py-2.5 transition-colors',
                      n.read
                        ? onOpenReminder ? 'opacity-60 cursor-pointer hover:opacity-100 hover:bg-bg-surface' : 'opacity-60'
                        : 'bg-bg-surface cursor-pointer hover:bg-bg-raised',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-text-primary leading-snug">{n.title}</p>
                      <span className="text-[10px] text-text-secondary shrink-0 mt-0.5">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{n.body}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
