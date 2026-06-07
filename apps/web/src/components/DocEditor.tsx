import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { SlashCommand } from "./editor/SlashCommand";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Baseline,
  Highlighter,
  Check,
  Loader2,
  Share2,
  Eye,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import ShareDialog from "./ShareDialog";
import { api, type DocRole, type FullDocument } from "../lib/api";

const ROLE_RANK: Record<DocRole, number> = {
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  OWNER: 4,
};

const ROLE_LABEL: Record<DocRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  COMMENTER: "Commenter",
  VIEWER: "Viewer",
};

type SaveState = "saved" | "saving" | "error";

const TEXT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
  "#8b5cf6", "#ec4899", "#f43f5e", "#0ea5e9", "#64748b", "#0f172a",
];

const HIGHLIGHT_COLORS = [
  "#fef08a", "#fde68a", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8",
];

function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors " +
        (active
          ? "bg-brand/10 text-brand"
          : "text-muted hover:bg-surface-muted hover:text-fg")
      }
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function ColorMenu({
  label,
  trigger,
  swatches,
  onPick,
  onClear,
  clearLabel,
}: {
  label: string;
  trigger: React.ReactNode;
  swatches: string[];
  onPick: (color: string) => void;
  onClear: () => void;
  clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        {trigger}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onMouseDown={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-30 w-44 rounded-lg border border-border bg-surface p-2 shadow-xl">
            <div className="grid grid-cols-6 gap-1.5">
              {swatches.map((c) => (
                <button
                  key={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(c);
                    setOpen(false);
                  }}
                  title={c}
                  className="h-6 w-6 rounded-md border border-border/60 transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted transition-colors hover:bg-surface-muted"
            >
              {clearLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="sticky top-14 z-10 flex justify-center px-4 py-3">
      <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-border bg-surface/90 px-1.5 py-1.5 shadow-lg shadow-black/5 backdrop-blur">
        <ToolbarButton
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={17} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={16} />
        </ToolbarButton>

        <Divider />

        <ColorMenu
          label="Text color"
          trigger={<Baseline size={16} />}
          swatches={TEXT_COLORS}
          onPick={(c) => editor.chain().focus().setColor(c).run()}
          onClear={() => editor.chain().focus().unsetColor().run()}
          clearLabel="Default color"
        />
        <ColorMenu
          label="Highlight"
          trigger={<Highlighter size={16} />}
          swatches={HIGHLIGHT_COLORS}
          onPick={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
          clearLabel="Remove highlight"
        />

        <Divider />

        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 size={16} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function SelectionMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor}>
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-xl">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={15} />
        </ToolbarButton>
      </div>
    </BubbleMenu>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" />
        Saving…
      </span>
    );
  if (state === "error")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs text-danger">
        Save failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success">
      <Check size={12} />
      Saved
    </span>
  );
}

export default function DocEditor({ doc }: { doc: FullDocument }) {
  const navigate = useNavigate();
  const role = doc.role ?? "VIEWER";
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.EDITOR;
  const isOwner = role === "OWNER";
  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [wordCount, setWordCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const pending = useRef<{ title?: string; content?: unknown }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function flush() {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    api.documents
      .update(doc.id, patch)
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }

  function queueSave(patch: { title?: string; content?: unknown }) {
    pending.current = { ...pending.current, ...patch };
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }

  const editor = useEditor({
    editable: canEdit,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: canEdit
          ? "Type '/' for commands, or just start writing…"
          : "",
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      SlashCommand,
    ],
    content: (doc.content as object | null) ?? undefined,
    onCreate: ({ editor }) => setWordCount(countWords(editor.getText())),
    onUpdate: ({ editor }) => {
      if (!canEdit) return;
      queueSave({ content: editor.getJSON() });
      setWordCount(countWords(editor.getText()));
    },
  });

  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      flush();
    };
  }, []);

  function onTitleChange(value: string) {
    if (!canEdit) return;
    setTitle(value);
    queueSave({ title: value.trim() || "Untitled" });
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              onClick={() => navigate("/home")}
              aria-label="Back to documents"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              onClick={() => navigate("/home")}
              className="hidden text-sm text-muted transition-colors hover:text-fg sm:block"
            >
              Documents
            </button>
            <ChevronRight size={15} className="hidden text-muted sm:block" />
            <span className="truncate text-sm font-medium">
              {title || "Untitled"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-muted sm:block">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
            {canEdit ? (
              <SaveBadge state={saveState} />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                <Eye size={12} />
                {ROLE_LABEL[role]}
              </span>
            )}
            {isOwner && (
              <button
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg transition-colors hover:bg-brand-hover"
              >
                <Share2 size={14} />
                Share
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {editor && canEdit && <Toolbar editor={editor} />}
      {editor && canEdit && <SelectionMenu editor={editor} />}

      {shareOpen && (
        <ShareDialog docId={doc.id} docTitle={title} onClose={() => setShareOpen(false)} />
      )}

      <div className="relative mx-auto max-w-5xl px-4 pb-32 pt-6">
        <div className="pointer-events-none absolute -top-2 left-1/2 -z-0 h-40 w-2/3 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand/15 to-accent/15 blur-3xl" />

        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-black/5">
          <div className="h-1.5 bg-gradient-to-r from-brand to-accent" />
          <div className="px-8 py-10 md:px-16 md:py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white shadow-lg shadow-brand/20">
              <FileText size={24} />
            </div>

            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              readOnly={!canEdit}
              placeholder="Untitled"
              className="mt-5 w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted/40"
            />

            <p className="mt-2 text-sm text-muted">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </p>

            <div className="my-6 h-px bg-border" />

            <EditorContent editor={editor} className="prose-doc" />
          </div>
        </div>
      </div>
    </div>
  );
}
