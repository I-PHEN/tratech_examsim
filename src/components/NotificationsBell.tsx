import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState } from './ui/EmptyState';
import { apiGet, apiDelete } from '../lib/apiClient';

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

  // Remove one notification (the × button, and auto-dismiss when a reminder is opened).
  const handleDelete = (id: string) => {
    const target = notifications.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (target && !target.read) setUnreadCount((c) => Math.max(0, c - 1));

    apiDelete(`/api/notifications/${id}`).catch((err) => {
      console.error('NotificationsBell: delete failed', err);
      loadNotifications(); // re-sync on failure
    });
  };

  const handleClearAll = () => {
    setNotifications([]);
    setUnreadCount(0);
    setOpen(false);

    apiDelete('/api/notifications').catch((err) => {
      console.error('NotificationsBell: clear-all failed', err);
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
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-text">
                  {unreadCount} new
                </span>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2"
                >
                  Clear all
                </button>
              )}
            </div>
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
                      // Open the pre-filled practice, then auto-dismiss this reminder.
                      if (onOpenReminder) {
                        onOpenReminder(n.schedule_id, n.payload);
                        setOpen(false);
                      }
                      handleDelete(n.id);
                    }}
                    className="rounded-xl px-3 py-2.5 transition-colors bg-bg-surface cursor-pointer hover:bg-bg-raised"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-text-primary leading-snug">{n.title}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-text-secondary mt-0.5">
                          {timeAgo(n.created_at)}
                        </span>
                        <button
                          type="button"
                          aria-label="Dismiss notification"
                          onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                          className="p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-raised transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
