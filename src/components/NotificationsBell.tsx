import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState } from './ui/EmptyState';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

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
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-1 rounded-full bg-accent text-slate-950 text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
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
            {unread > 0 && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-text">
                {unread} new
              </span>
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
                    className={cn(
                      'rounded-xl px-3 py-2.5 transition-colors',
                      n.read ? 'opacity-60' : 'bg-bg-surface',
                    )}
                  >
                    <p className="text-sm font-semibold text-text-primary">{n.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{n.body}</p>
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
