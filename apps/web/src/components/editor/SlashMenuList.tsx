import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { Editor, Range } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";

export type SlashItem = {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  run: (editor: Editor, range: Range) => void;
};

type Props = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
};

export type SlashMenuRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

const SlashMenuList = forwardRef<SlashMenuRef, Props>(function SlashMenuList(
  { items, command },
  ref
) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  function pick(index: number) {
    const item = items[index];
    if (item) command(item);
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((s) => (s + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        pick(selected);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="w-64 rounded-xl border border-border bg-surface p-3 text-sm text-muted shadow-xl">
        No matching blocks
      </div>
    );
  }

  return (
    <div className="max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-xl">
      {items.map((item, i) => (
        <button
          key={item.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(i)}
          onMouseEnter={() => setSelected(i)}
          className={
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors " +
            (i === selected ? "bg-brand/10" : "hover:bg-surface-muted")
          }
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted">
            <item.icon size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{item.title}</span>
            {item.subtitle && (
              <span className="block truncate text-xs text-muted">
                {item.subtitle}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});

export default SlashMenuList;
