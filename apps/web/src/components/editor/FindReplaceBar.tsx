import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { ChevronUp, ChevronDown, X, CaseSensitive, Regex } from "lucide-react";
import {
  setSearch,
  clearSearch,
  getSearchInfo,
  goToMatch,
  replaceCurrent,
  replaceAll,
} from "./SearchReplace";

export default function FindReplaceBar({
  editor,
  canEdit,
  onClose,
}: {
  editor: Editor;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [info, setInfo] = useState({ count: 0, current: -1 });

  useEffect(() => {
    setSearch(editor, { term, replaceTerm, caseSensitive, regex });
  }, [editor, term, replaceTerm, caseSensitive, regex]);

  useEffect(() => {
    const handler = () => setInfo(getSearchInfo(editor));
    editor.on("transaction", handler);
    handler();
    return () => {
      editor.off("transaction", handler);
    };
  }, [editor]);

  function close() {
    clearSearch(editor);
    onClose();
  }

  const iconBtn = (active: boolean) =>
    "flex h-7 w-7 items-center justify-center rounded transition-colors " +
    (active ? "bg-brand/15 text-brand" : "text-muted hover:bg-surface-muted hover:text-fg");

  return (
    <div className="fixed right-6 top-20 z-50 w-80 rounded-xl border border-border bg-surface p-2 shadow-2xl">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              goToMatch(editor, e.shiftKey ? -1 : 1);
            }
            if (e.key === "Escape") close();
          }}
          placeholder="Find"
          className="h-8 flex-1 rounded-lg border border-border bg-canvas px-2 text-sm outline-none focus:border-brand"
        />
        <span className="w-16 shrink-0 text-center text-xs text-muted">
          {info.count ? `${info.current + 1}/${info.count}` : "0/0"}
        </span>
        <button onClick={() => goToMatch(editor, -1)} className={iconBtn(false)} title="Previous">
          <ChevronUp size={16} />
        </button>
        <button onClick={() => goToMatch(editor, 1)} className={iconBtn(false)} title="Next">
          <ChevronDown size={16} />
        </button>
        <button onClick={close} className={iconBtn(false)} title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-1">
        <button
          onClick={() => setCaseSensitive((v) => !v)}
          className={iconBtn(caseSensitive)}
          title="Match case"
        >
          <CaseSensitive size={16} />
        </button>
        <button onClick={() => setRegex((v) => !v)} className={iconBtn(regex)} title="Regular expression">
          <Regex size={16} />
        </button>
      </div>

      {canEdit && (
        <div className="mt-1.5 flex items-center gap-1">
          <input
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            placeholder="Replace with"
            className="h-8 flex-1 rounded-lg border border-border bg-canvas px-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={() => replaceCurrent(editor)}
            disabled={info.count === 0}
            className="rounded-lg border border-border px-2 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
          >
            Replace
          </button>
          <button
            onClick={() => replaceAll(editor)}
            disabled={info.count === 0}
            className="rounded-lg border border-border px-2 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}
