import { useState } from "react";
import { X, MessageSquare } from "lucide-react";
import { type CommentDTO } from "../../lib/api";
import CommentThread from "./CommentThread";
import MentionInput from "./MentionInput";

type Filter = "all" | "open" | "resolved" | "mentions" | "mine";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "mentions", label: "@ You" },
  { key: "mine", label: "Yours" },
];

function mentionsUser(thread: CommentDTO, userId: string) {
  const needle = `](${userId})`;
  if (thread.body.includes(needle)) return true;
  return (thread.replies ?? []).some((r) => r.body.includes(needle));
}

function byUser(thread: CommentDTO, userId: string) {
  if (thread.author.id === userId) return true;
  return (thread.replies ?? []).some((r) => r.author.id === userId);
}

export default function CommentsDrawer({
  open,
  onClose,
  docId,
  comments,
  currentUserId,
  canComment,
  canModerate,
  activeCommentId,
  onActivate,
  onChanged,
  pendingQuote,
  onCreate,
  onCancelPending,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  comments: CommentDTO[];
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
  activeCommentId: string | null;
  onActivate: (id: string) => void;
  onChanged: () => void;
  pendingQuote: string | null;
  onCreate: (body: string) => Promise<void>;
  onCancelPending: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");

  if (!open) return null;

  const filtered = comments.filter((t) => {
    if (filter === "open") return !t.resolved;
    if (filter === "resolved") return t.resolved;
    if (filter === "mentions") return mentionsUser(t, currentUserId);
    if (filter === "mine") return byUser(t, currentUserId);
    return true;
  });

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-screen w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare size={16} />
          Comments
        </h2>
        <button
          onClick={onClose}
          aria-label="Close comments"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
              (filter === f.key
                ? "bg-brand text-brand-fg"
                : "text-muted hover:bg-surface-muted")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {pendingQuote !== null && (
          <div className="rounded-xl border border-brand bg-brand/5 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="border-l-2 border-brand/40 pl-2 text-xs italic text-muted line-clamp-2">
                {pendingQuote || "Selected text"}
              </div>
              <button
                onClick={onCancelPending}
                aria-label="Cancel"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-muted hover:text-fg"
              >
                <X size={14} />
              </button>
            </div>
            <MentionInput docId={docId} autoFocus onSubmit={onCreate} />
          </div>
        )}
        {filtered.length === 0 && pendingQuote === null ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-center text-sm text-muted">
            <MessageSquare size={28} className="opacity-40" />
            <p>No comments here yet.</p>
            {canComment && filter !== "resolved" && (
              <p className="text-xs">Select text in the document and click Comment.</p>
            )}
          </div>
        ) : (
          filtered.map((t) => (
            <CommentThread
              key={t.id}
              docId={docId}
              thread={t}
              currentUserId={currentUserId}
              canComment={canComment}
              canModerate={canModerate}
              active={t.id === activeCommentId}
              onActivate={() => onActivate(t.id)}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </aside>
  );
}
