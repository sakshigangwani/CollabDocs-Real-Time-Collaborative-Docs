import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { api, type AiAction } from "../../lib/api";

const ACTIONS: { key: AiAction; label: string }[] = [
  { key: "rewrite", label: "Improve writing" },
  { key: "grammar", label: "Fix spelling & grammar" },
  { key: "shorten", label: "Make shorter" },
  { key: "lengthen", label: "Make longer" },
  { key: "summarize", label: "Summarise" },
  { key: "professional", label: "Professional tone" },
  { key: "friendly", label: "Friendly tone" },
];

const LANGUAGES = ["Spanish", "French", "German", "Hindi", "Japanese"];

export default function AiActions({
  docId,
  getSelection,
  onReplace,
}: {
  docId: string;
  getSelection: () => string;
  onReplace: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: AiAction, language?: string) {
    const text = getSelection().trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      onReplace(await api.ai.action(docId, action, text, language));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Ask AI"
        className="flex h-8 items-center gap-1 rounded-lg px-2 text-brand transition-colors hover:bg-surface-muted"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        <span className="text-xs font-medium">AI</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-border bg-surface p-1 shadow-xl">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(a.key)}
                disabled={busy}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-muted disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}

            <div className="my-1 border-t border-border" />
            <p className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-muted">
              Translate to
            </p>
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run("translate", lang)}
                disabled={busy}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-muted disabled:opacity-50"
              >
                {lang}
              </button>
            ))}

            {error && <p className="px-2.5 py-1.5 text-[11px] text-red-500">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
