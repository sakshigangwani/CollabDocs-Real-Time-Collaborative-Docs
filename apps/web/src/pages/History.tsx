import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { generateHTML } from "@tiptap/core";
import {
  ArrowLeft,
  Clock,
  Loader2,
  RotateCcw,
  Download,
  Columns2,
  FileDiff,
} from "lucide-react";
import { api, type DocRole, type VersionMeta } from "../lib/api";
import { renderExtensions } from "../lib/docSchema";
import { diffWords, textOf } from "../lib/diff";
import { runExport, type ExportFormat } from "../lib/exporters";

const ROLE_RANK: Record<DocRole, number> = { VIEWER: 1, COMMENTER: 2, EDITOR: 3, OWNER: 4 };

const EXPORTS: { format: ExportFormat; label: string }[] = [
  { format: "pdf", label: "PDF" },
  { format: "docx", label: "Word (.doc)" },
  { format: "markdown", label: "Markdown" },
  { format: "html", label: "HTML" },
];

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function html(content: unknown) {
  try {
    return generateHTML(content as Record<string, unknown>, renderExtensions);
  } catch {
    return "<p></p>";
  }
}

export default function History() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<DocRole>("VIEWER");
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState<"side" | "inline">("inline");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [exportOpen, setExportOpen] = useState(false);

  const canRestore = ROLE_RANK[role] >= ROLE_RANK.EDITOR;

  useEffect(() => {
    if (!id) return;
    Promise.all([api.documents.get(id), api.versions.list(id)])
      .then(([doc, list]) => {
        setTitle(doc.title);
        setRole(doc.role ?? "VIEWER");
        setVersions(list);
        setTargetId(list[0]?.id ?? null);
        setBaseId(list[1]?.id ?? list[0]?.id ?? null);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [id]);

  const fetchContent = useCallback(
    async (vid: string) => {
      if (!id || cache[vid]) return;
      try {
        const v = await api.versions.get(id, vid);
        setCache((c) => ({ ...c, [vid]: v.content }));
      } catch {
        // ignore
      }
    },
    [id, cache],
  );

  useEffect(() => {
    if (targetId) fetchContent(targetId);
    if (baseId) fetchContent(baseId);
  }, [targetId, baseId, fetchContent]);

  const target = versions.find((v) => v.id === targetId) ?? null;
  const base = versions.find((v) => v.id === baseId) ?? null;
  const targetContent = targetId ? cache[targetId] : undefined;
  const baseContent = baseId ? cache[baseId] : undefined;

  const diff = useMemo(() => {
    if (targetContent === undefined || baseContent === undefined) return null;
    return diffWords(textOf(baseContent), textOf(targetContent));
  }, [targetContent, baseContent]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }
  if (status === "error" || !id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-xl font-semibold">Couldn't load history</h1>
        <button
          onClick={() => navigate("/home")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          Back to documents
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
        <button
          onClick={() => navigate(`/d/${id}`)}
          aria-label="Back to document"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-fg"
        >
          <ArrowLeft size={18} />
        </button>
        <Clock size={16} className="text-muted" />
        <span className="truncate text-sm font-medium">Version history · {title || "Untitled"}</span>
      </header>

      <div className="flex flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-3">
          {versions.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">No versions yet. Edit the document to create snapshots.</p>
          ) : (
            <ol className="space-y-1">
              {versions.map((v) => {
                const isTarget = v.id === targetId;
                const isBase = v.id === baseId;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => setTargetId(v.id)}
                      className={
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors " +
                        (isTarget
                          ? "border-brand bg-brand/5"
                          : "border-transparent hover:bg-surface-muted")
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          style={{ backgroundColor: v.author?.color ?? "#94a3b8" }}
                        >
                          {(v.author?.name ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {v.label ?? (v.kind === "named" ? "Named version" : "Auto-save")}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between pl-7 text-xs text-muted">
                        <span>{when(v.createdAt)}</span>
                        {isBase && <span className="text-brand">base</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="sticky top-0 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-canvas/90 px-5 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Compare</span>
              <select
                value={baseId ?? ""}
                onChange={(e) => setBaseId(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label ?? when(v.createdAt)}
                  </option>
                ))}
              </select>
              <span className="text-muted">→</span>
              <span className="font-medium">{target?.label ?? (target ? when(target.createdAt) : "—")}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border p-0.5">
                <button
                  onClick={() => setTab("inline")}
                  className={
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium " +
                    (tab === "inline" ? "bg-brand text-brand-fg" : "text-muted hover:text-fg")
                  }
                >
                  <FileDiff size={13} /> Inline
                </button>
                <button
                  onClick={() => setTab("side")}
                  className={
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium " +
                    (tab === "side" ? "bg-brand text-brand-fg" : "text-muted hover:text-fg")
                  }
                >
                  <Columns2 size={13} /> Side-by-side
                </button>
              </div>

              <div className="relative">
                <button
                  onClick={() => setExportOpen((o) => !o)}
                  disabled={targetContent === undefined}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-muted disabled:opacity-50"
                >
                  <Download size={13} /> Export
                </button>
                {exportOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setExportOpen(false)} />
                    <div className="absolute right-0 top-9 z-30 w-40 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
                      {EXPORTS.map((e) => (
                        <button
                          key={e.format}
                          onClick={() => {
                            setExportOpen(false);
                            if (targetContent !== undefined) runExport(e.format, title || "document", targetContent);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {canRestore && target && (
                <button
                  onClick={() => navigate(`/d/${id}?restore=${target.id}`)}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:bg-brand-hover"
                >
                  <RotateCcw size={13} /> Restore
                </button>
              )}
            </div>
          </div>

          {target && base && (
            <div className="flex flex-wrap items-center gap-4 px-5 py-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: target.author?.color ?? "#22c55e" }} />
                Added by {target.author?.name ?? "unknown"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: base.author?.color ?? "#ef4444" }} />
                Removed (from {base.author?.name ?? "unknown"})
              </span>
            </div>
          )}

          <div className="p-5">
            {!targetId ? (
              <div className="flex flex-col items-center gap-2 py-24 text-center text-sm text-muted">
                <Clock size={28} className="opacity-40" />
                <p>No versions to compare yet.</p>
                <p className="text-xs">
                  Versions are captured automatically as you edit, or use “Save version” in the editor.
                </p>
              </div>
            ) : targetContent === undefined ? (
              <div className="flex justify-center py-20 text-muted">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : tab === "side" ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted">
                    {base?.label ?? (base ? when(base.createdAt) : "Base")}
                  </h3>
                  <div
                    className="prose-doc rounded-xl border border-border bg-surface p-5"
                    dangerouslySetInnerHTML={{ __html: html(baseContent) }}
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted">
                    {target?.label ?? (target ? when(target.createdAt) : "Target")}
                  </h3>
                  <div
                    className="prose-doc rounded-xl border border-border bg-surface p-5"
                    dangerouslySetInnerHTML={{ __html: html(targetContent) }}
                  />
                </div>
              </div>
            ) : (
              <div className="prose-doc whitespace-pre-wrap rounded-xl border border-border bg-surface p-5 leading-relaxed">
                {diff?.map((seg, i) =>
                  seg.added ? (
                    <ins
                      key={i}
                      className="diff-add"
                      style={{ backgroundColor: (target?.author?.color ?? "#22c55e") + "33" }}
                    >
                      {seg.value}
                    </ins>
                  ) : seg.removed ? (
                    <del
                      key={i}
                      className="diff-del"
                      style={{ backgroundColor: (base?.author?.color ?? "#ef4444") + "33" }}
                    >
                      {seg.value}
                    </del>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  ),
                )}
                {diff && diff.every((s) => !s.added && !s.removed) && (
                  <p className="text-sm text-muted">No text changes between these versions.</p>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
