import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Loader2, CornerDownLeft, Quote } from "lucide-react";
import { api, type AiScope, type AskResult, type Citation } from "../../lib/api";

const SCOPES: { key: AiScope; label: string }[] = [
  { key: "document", label: "This document" },
  { key: "workspace", label: "All my documents" },
];

const SUGGESTIONS = [
  "Summarise this document",
  "What decisions were made?",
  "What's still unresolved?",
];

function AnswerText({
  answer,
  citations,
  onCite,
}: {
  answer: string;
  citations: Citation[];
  onCite: (citation: Citation) => void;
}) {
  const byNumber = new Map(citations.map((c) => [c.n, c]));
  const parts = answer.split(/(\[\d+\])/g);

  return (
    <p className="text-sm leading-relaxed text-fg">
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const citation = match ? byNumber.get(Number(match[1])) : undefined;
        if (!citation) return <span key={i}>{part}</span>;
        return (
          <button
            key={i}
            onClick={() => onCite(citation)}
            title={citation.text.slice(0, 160)}
            className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-brand/15 px-1 align-super text-[10px] font-semibold text-brand transition-colors hover:bg-brand/30"
          >
            {citation.n}
          </button>
        );
      })}
    </p>
  );
}

export default function AiPanel({
  open,
  onClose,
  docId,
  model,
  onJumpToSpan,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  model: string | null;
  onJumpToSpan: (text: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<AiScope>("document");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.ai.ask(docId, trimmed, scope));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-screen w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand" />
          <h2 className="text-sm font-semibold">Ask your documents</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted transition-colors hover:bg-surface-muted hover:text-fg"
          aria-label="Close AI panel"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex gap-1 border-b border-border px-4 py-2">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              scope === s.key
                ? "bg-brand/15 font-medium text-brand"
                : "text-muted hover:bg-surface-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!result && !asking && !error && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Answers are grounded in your documents — every claim links back to the
              excerpt it came from.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQuestion(s);
                  ask(s);
                }}
                className="block w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-muted hover:text-fg"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {asking && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" />
            Searching your documents…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>
        )}

        {result && (
          <div className="space-y-4">
            <AnswerText
              answer={result.answer}
              citations={result.citations}
              onCite={(c) => onJumpToSpan(c.text)}
            />

            {result.citations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Sources
                </h3>
                {result.citations.map((c) => (
                  <button
                    key={c.n}
                    onClick={() => onJumpToSpan(c.text)}
                    className="block w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-brand/15 px-1 text-[10px] font-semibold text-brand">
                        {c.n}
                      </span>
                      <span className="truncate text-xs font-medium">{c.documentTitle}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted">
                        {Math.round(c.similarity * 100)}% match
                      </span>
                    </div>
                    <p className="flex gap-1.5 text-xs leading-relaxed text-muted">
                      <Quote size={11} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-3">{c.text}</span>
                    </p>
                  </button>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted">
              Searched {result.retrieved} excerpt{result.retrieved === 1 ? "" : "s"}
              {model ? ` · ${model}` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            rows={2}
            placeholder="Ask a question…"
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 pr-9 text-sm outline-none transition-colors focus:border-brand"
          />
          <button
            onClick={() => ask(question)}
            disabled={asking || !question.trim()}
            className="absolute bottom-2 right-2 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-40"
            aria-label="Ask"
          >
            {asking ? <Loader2 size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
