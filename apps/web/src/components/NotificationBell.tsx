import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { api, type NotificationDTO } from "../lib/api";

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function describe(n: NotificationDTO) {
  const who = n.actor?.name ?? "Someone";
  if (n.type === "mention") return `${who} mentioned you`;
  if (n.type === "reply") return `${who} replied to your comment`;
  return `${who} updated a document`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => {
    try {
      const data = await api.notifications.list();
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000);
    return () => clearInterval(timer.current);
  }, [load]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await api.notifications.markRead().catch(() => {});
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
              Notifications
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setOpen(false);
                      if (n.documentId) navigate(`/d/${n.documentId}`);
                    }}
                    className={
                      "flex w-full flex-col gap-0.5 border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-surface-muted " +
                      (n.read ? "" : "bg-brand/5")
                    }
                  >
                    <span className="text-sm">
                      {describe(n)}
                      {n.documentTitle && (
                        <span className="text-muted"> in “{n.documentTitle}”</span>
                      )}
                    </span>
                    {n.snippet && (
                      <span className="truncate text-xs text-muted">{n.snippet}</span>
                    )}
                    <span className="text-xs text-muted">{timeAgo(n.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
