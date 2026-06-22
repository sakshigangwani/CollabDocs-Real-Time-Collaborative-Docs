import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Check, Mail, Send, Loader2 } from "lucide-react";
import {
  api,
  type NotificationDTO,
  type NotificationPrefs,
} from "../lib/api";

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const VERB: Record<string, string> = {
  mention: "mentioned you in",
  reply: "replied to your comment in",
  comment: "commented on",
  share_invite: "shared",
  version_restored: "restored a version of",
};

function describe(n: NotificationDTO) {
  const who = n.actor?.name ?? "Someone";
  return `${who} ${VERB[n.type] ?? "updated"} “${n.documentTitle ?? "a document"}”`;
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [digestState, setDigestState] = useState<"idle" | "sending" | "sent" | "empty">("idle");

  const load = useCallback(async () => {
    try {
      const [data, p] = await Promise.all([api.notifications.list(), api.notifications.getPrefs()]);
      setItems(data.notifications);
      setPrefs(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAll() {
    await api.notifications.markRead().catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function updatePref(patch: Partial<NotificationPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await api.notifications.setPrefs(patch).catch(() => {});
  }

  async function testDigest() {
    setDigestState("sending");
    const res = await api.notifications.sendTestDigest().catch(() => null);
    setDigestState(res?.empty ? "empty" : "sent");
    setTimeout(() => setDigestState("idle"), 3000);
  }

  const shown = filter === "unread" ? items.filter((n) => !n.read) : items;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
        <button
          onClick={() => navigate("/home")}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-fg"
        >
          <ArrowLeft size={18} />
        </button>
        <Bell size={16} className="text-muted" />
        <span className="text-sm font-medium">Notifications</span>
      </header>

      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-6 md:grid-cols-[1fr_280px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex rounded-lg border border-border p-0.5">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    "rounded-md px-3 py-1 text-xs font-medium capitalize " +
                    (filter === f ? "bg-brand text-brand-fg" : "text-muted hover:text-fg")
                  }
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={markAll}
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"
            >
              <Check size={14} /> Mark all read
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20 text-muted">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : shown.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted">Nothing here.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {shown.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => n.documentId && navigate(`/d/${n.documentId}`)}
                    className={
                      "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-surface-muted " +
                      (n.read ? "" : "bg-brand/5")
                    }
                  >
                    <span className="text-sm">{describe(n)}</span>
                    {n.snippet && <span className="truncate text-xs text-muted">{n.snippet}</span>}
                    <span className="text-xs text-muted">{timeAgo(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Mail size={15} /> Email preferences
            </h2>
            {prefs && (
              <div className="space-y-3 text-sm">
                <label className="flex items-center justify-between gap-2">
                  <span>Instant emails</span>
                  <input
                    type="checkbox"
                    checked={prefs.emailInstant}
                    onChange={(e) => updatePref({ emailInstant: e.target.checked })}
                    className="h-4 w-4 accent-brand"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Digest</span>
                  <select
                    value={prefs.digest}
                    onChange={(e) => updatePref({ digest: e.target.value as NotificationPrefs["digest"] })}
                    className="rounded-lg border border-border bg-canvas px-2 py-1 text-sm outline-none"
                  >
                    <option value="off">Off</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <button
                  onClick={testDigest}
                  disabled={digestState === "sending"}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
                >
                  <Send size={13} />
                  {digestState === "sending"
                    ? "Sending…"
                    : digestState === "sent"
                      ? "Digest sent"
                      : digestState === "empty"
                        ? "Nothing to digest"
                        : "Send test digest"}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
