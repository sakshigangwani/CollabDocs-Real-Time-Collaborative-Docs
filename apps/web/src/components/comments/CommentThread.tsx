import { useState } from "react";
import { Check, RotateCcw, Trash2, SmilePlus, CornerDownRight } from "lucide-react";
import { api, type CommentDTO } from "../../lib/api";
import { renderBody } from "./mentionRender";
import MentionInput from "./MentionInput";

const EMOJIS = ["👍", "❤️", "🎉", "😄", "🤔", "👀"];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function CommentRow({
  docId,
  comment,
  currentUserId,
  canComment,
  canModerate,
  onChanged,
}: {
  docId: string;
  comment: CommentDTO;
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
  onChanged: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mine = comment.author.id === currentUserId;

  async function react(emoji: string) {
    setPickerOpen(false);
    await api.comments.react(docId, comment.id, emoji).catch(() => {});
    onChanged();
  }

  return (
    <div className="flex gap-2.5">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
        style={{ backgroundColor: comment.author.color }}
      >
        {comment.author.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{comment.author.name}</span>
          <span className="text-xs text-muted">{timeAgo(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg/90">
          {renderBody(comment.body)}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {comment.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => canComment && react(r.emoji)}
              className={
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors " +
                (r.reacted
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-border text-muted hover:bg-surface-muted")
              }
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
          {canComment && (
            <div className="relative">
              <button
                onClick={() => setPickerOpen((o) => !o)}
                title="Add reaction"
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-fg"
              >
                <SmilePlus size={14} />
              </button>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
                  <div className="absolute left-0 top-7 z-30 flex gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-xl">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => react(e)}
                        className="rounded p-1 text-base transition-transform hover:scale-125"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {(mine || canModerate) && (
            <button
              onClick={async () => {
                await api.comments.remove(docId, comment.id).catch(() => {});
                onChanged();
              }}
              title="Delete"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommentThread({
  docId,
  thread,
  currentUserId,
  canComment,
  canModerate,
  active,
  onChanged,
  onActivate,
}: {
  docId: string;
  thread: CommentDTO;
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
  active: boolean;
  onChanged: () => void;
  onActivate: () => void;
}) {
  const [replying, setReplying] = useState(false);

  async function toggleResolve() {
    await api.comments.update(docId, thread.id, { resolved: !thread.resolved }).catch(() => {});
    onChanged();
  }

  return (
    <div
      onClick={onActivate}
      className={
        "cursor-pointer rounded-xl border p-3 transition-colors " +
        (active ? "border-brand bg-brand/5" : "border-border bg-surface hover:border-brand/40") +
        (thread.resolved ? " opacity-70" : "")
      }
    >
      {thread.quotedText && (
        <div className="mb-2 border-l-2 border-brand/40 pl-2 text-xs italic text-muted line-clamp-2">
          {thread.quotedText}
        </div>
      )}

      <CommentRow
        docId={docId}
        comment={thread}
        currentUserId={currentUserId}
        canComment={canComment}
        canModerate={canModerate}
        onChanged={onChanged}
      />

      {thread.replies && thread.replies.length > 0 && (
        <div className="mt-3 space-y-3 border-l border-border pl-3">
          {thread.replies.map((r) => (
            <CommentRow
              key={r.id}
              docId={docId}
              comment={r}
              currentUserId={currentUserId}
              canComment={canComment}
              canModerate={canModerate}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
        {canComment && (
          <button
            onClick={() => setReplying((r) => !r)}
            className="inline-flex items-center gap-1 text-muted transition-colors hover:text-fg"
          >
            <CornerDownRight size={13} />
            Reply
          </button>
        )}
        {canComment && (
          <button
            onClick={toggleResolve}
            className="inline-flex items-center gap-1 text-muted transition-colors hover:text-fg"
          >
            {thread.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
            {thread.resolved ? "Reopen" : "Resolve"}
          </button>
        )}
      </div>

      {replying && canComment && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <MentionInput
            docId={docId}
            autoFocus
            submitLabel="Reply"
            placeholder="Reply…"
            onSubmit={async (body) => {
              await api.comments.create(docId, { body, parentId: thread.id });
              setReplying(false);
              onChanged();
            }}
          />
        </div>
      )}
    </div>
  );
}
