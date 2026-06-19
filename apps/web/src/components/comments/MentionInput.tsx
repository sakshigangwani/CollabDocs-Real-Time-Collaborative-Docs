import { useEffect, useRef, useState } from "react";
import { api, type Mentionable } from "../../lib/api";

export default function MentionInput({
  docId,
  onSubmit,
  placeholder,
  autoFocus,
  submitLabel = "Comment",
}: {
  docId: string;
  onSubmit: (body: string) => Promise<void> | void;
  placeholder?: string;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const [text, setText] = useState("");
  const [picked] = useState(() => new Map<string, string>());
  const [users, setUsers] = useState<Mentionable[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    api.comments.mentionable(docId).then((u) => active && setUsers(u)).catch(() => {});
    return () => {
      active = false;
    };
  }, [docId]);

  const matches =
    query === null
      ? []
      : users
          .filter((u) =>
            (u.name + " " + u.email).toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 6);

  function onChange(value: string) {
    setText(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    setQuery(m ? m[1] : null);
    setActiveIndex(0);
  }

  function pick(user: Mentionable) {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@(\w*)$/, `@${user.name} `);
    const next = before + text.slice(caret);
    picked.set(user.name, user.id);
    setText(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function tokenize(value: string) {
    let out = value;
    for (const [name, id] of picked) {
      out = out.replace(`@${name}`, `@[${name}](${id})`);
    }
    return out;
  }

  async function submit() {
    const body = tokenize(text).trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
      setText("");
      picked.clear();
      setQuery(null);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query !== null && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        setQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Add a comment… use @ to mention"}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-brand"
      />
      {query !== null && matches.length > 0 && (
        <div className="absolute left-2 top-full z-30 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          {matches.map((u, i) => (
            <button
              key={u.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              className={
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm " +
                (i === activeIndex ? "bg-surface-muted" : "hover:bg-surface-muted")
              }
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: u.color }}
              >
                {u.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted">{u.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">⌘↵ to send</span>
        <button
          onClick={submit}
          disabled={busy || tokenize(text).trim().length === 0}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
