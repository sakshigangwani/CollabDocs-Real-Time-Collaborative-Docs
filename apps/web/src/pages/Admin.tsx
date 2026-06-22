import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { api, type AdminAuditEvent } from "../lib/api";

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Admin() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "denied">("loading");
  const [filter, setFilter] = useState("");
  const [retention, setRetention] = useState<string>("");
  const [savedRetention, setSavedRetention] = useState(false);

  useEffect(() => {
    api.workspace
      .get()
      .then((wi) => {
        if (!wi.isAdmin) {
          setStatus("denied");
          return;
        }
        setRetention(wi.workspace.auditRetentionDays?.toString() ?? "");
        setStatus("ready");
        api.workspace.audit().then(setEvents).catch(() => {});
      })
      .catch(() => setStatus("denied"));
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    api.workspace.audit(filter || undefined).then(setEvents).catch(() => {});
  }, [filter, status]);

  async function saveRetention() {
    const days = retention.trim() ? Math.max(1, parseInt(retention, 10) || 1) : null;
    await api.workspace.update({ auditRetentionDays: days }).catch(() => {});
    setSavedRetention(true);
    setTimeout(() => setSavedRetention(false), 2000);
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-xl font-semibold">Admin access required</h1>
        <button
          onClick={() => navigate("/home")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          Back to documents
        </button>
      </div>
    );
  }

  const actions = [...new Set(events.map((e) => e.action))];

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
        <ShieldCheck size={16} className="text-muted" />
        <span className="text-sm font-medium">Admin · Audit log</span>
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <section className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted">Audit retention (days)</span>
            <input
              type="number"
              min={1}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              placeholder="Keep forever"
              className="w-40 rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <button
            onClick={saveRetention}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
          >
            {savedRetention ? "Saved" : "Save retention"}
          </button>
        </section>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">{events.length} events</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {events.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">No audit events yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Document</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(e.createdAt)}</td>
                    <td className="px-4 py-2">{e.actor?.name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{e.action}</code>
                    </td>
                    <td className="truncate px-4 py-2 text-muted">{e.documentTitle ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
