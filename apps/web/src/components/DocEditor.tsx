import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { SlashCommand } from "./editor/SlashCommand";
import {
  CommentHighlight,
  applyCommentRanges,
  type CommentRange,
} from "./editor/CommentHighlight";
import CommentsDrawer from "./comments/CommentsDrawer";
import NotificationBell from "./NotificationBell";
import { anchorToRange, selectionToAnchor, type Anchor } from "../lib/anchors";
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
  Loader2,
  Share2,
  Eye,
  MessageSquare,
  MessageSquarePlus,
  History as HistoryIcon,
  Save,
  Bell,
  BellRing,
  BellOff,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import ShareDialog from "./ShareDialog";
import {
  PresenceStack,
  SyncBadge,
  ConnectionBanner,
  FollowingBanner,
} from "./Presence";
import {
  api,
  COLLAB_URL,
  type CollabToken,
  type CommentDTO,
  type DocRole,
  type FullDocument,
  type SubscriptionLevel,
} from "../lib/api";
import {
  computeStatus,
  type ConnStatus,
  type Peer,
} from "../lib/collab";

type CollabSession = {
  ydoc: Y.Doc;
  persistence: IndexeddbPersistence;
  provider: HocuspocusProvider;
};

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

function SelectionMenu({
  editor,
  canEdit,
  canComment,
  onComment,
}: {
  editor: Editor;
  canEdit: boolean;
  canComment: boolean;
  onComment: () => void;
}) {
  return (
    <BubbleMenu editor={editor} shouldShow={({ from, to }) => from !== to}>
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-xl">
        {canEdit && (
          <>
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
          </>
        )}
        {canComment && (
          <>
            {canEdit && <Divider />}
            <ToolbarButton label="Comment" onClick={onComment}>
              <MessageSquarePlus size={15} />
            </ToolbarButton>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}

export default function DocEditor({ doc }: { doc: FullDocument }) {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<CollabToken | null>(null);
  const [authError, setAuthError] = useState(false);
  const [session, setSession] = useState<CollabSession | null>(null);

  useEffect(() => {
    let active = true;
    setAuth(null);
    setAuthError(false);
    api.documents
      .collabToken(doc.id)
      .then((t) => active && setAuth(t))
      .catch(() => active && setAuthError(true));
    return () => {
      active = false;
    };
  }, [doc.id]);

  useEffect(() => {
    if (!auth) return;
    const ydoc = new Y.Doc();
    const persistence = new IndexeddbPersistence(`collabdocs-${doc.id}`, ydoc);
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: doc.id,
      document: ydoc,
      token: auth.token,
    });
    setSession({ ydoc, persistence, provider });
    return () => {
      provider.destroy();
      persistence.destroy();
      ydoc.destroy();
      setSession(null);
    };
  }, [auth, doc.id]);

  if (authError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-xl font-semibold">Can't open this document</h1>
        <p className="text-sm text-muted">
          The collaboration session couldn't start. Your access may have changed.
        </p>
        <button
          onClick={() => navigate("/home")}
          className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover"
        >
          Back to documents
        </button>
      </div>
    );
  }

  if (!auth || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return <CollabEditor key={doc.id} doc={doc} auth={auth} session={session} />;
}

function CollabEditor({
  doc,
  auth,
  session,
}: {
  doc: FullDocument;
  auth: CollabToken;
  session: CollabSession;
}) {
  const navigate = useNavigate();
  const role = doc.role ?? "VIEWER";
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.EDITOR;
  const canComment = ROLE_RANK[role] >= ROLE_RANK.COMMENTER;
  const isOwner = role === "OWNER";

  const [title, setTitle] = useState(doc.title);
  const [titleSaving, setTitleSaving] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [followClientId, setFollowClientId] = useState<number | null>(null);

  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  const activateRef = useRef<(id: string) => void>(() => {});

  const [versionFlash, setVersionFlash] = useState(false);
  const [subLevel, setSubLevel] = useState<SubscriptionLevel>("mentions");
  const [subOpen, setSubOpen] = useState(false);
  const dirtyRef = useRef(false);
  const restoredRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const restoreId = searchParams.get("restore");

  const openCount = comments.filter((c) => !c.resolved).length;

  const titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastActiveSent = useRef(0);

  function markTyping() {
    session.provider.awareness?.setLocalStateField("typing", true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      session.provider.awareness?.setLocalStateField("typing", false);
    }, 1500);
  }

  function markActivity() {
    const now = Date.now();
    if (now - lastActiveSent.current < 5000) return;
    lastActiveSent.current = now;
    session.provider.awareness?.setLocalStateField("lastActive", now);
  }

  const editor = useEditor({
    editable: canEdit,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
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
      CommentHighlight.configure({
        onActivate: (id) => activateRef.current(id),
      }),
      Collaboration.configure({ document: session.ydoc }),
      CollaborationCaret.configure({
        provider: session.provider,
        user: { name: auth.user.name, color: auth.color, id: auth.user.id },
      }),
    ],
    onCreate: ({ editor }) => setWordCount(countWords(editor.getText())),
    onUpdate: ({ editor }) => {
      setWordCount(countWords(editor.getText()));
      if (!canEdit) return;
      markActivity();
      markTyping();
      dirtyRef.current = true;
    },
  }, [session]);

  useEffect(() => {
    const { provider } = session;
    const onStatus = (e: { status: string }) =>
      setStatus(e.status as ConnStatus);
    const onAuthFail = () => setStatus("error");
    provider.on("status", onStatus);
    provider.on("authenticationFailed", onAuthFail);

    const refresh = () => {
      const states = provider.awareness?.getStates() ?? new Map();
      const myId = provider.awareness?.clientID;
      const now = Date.now();
      const list: Peer[] = [];
      states.forEach((state, clientId) => {
        if (clientId === myId) return;
        const u = state.user as
          | { id?: string; name?: string; color?: string }
          | undefined;
        if (!u) return;
        list.push({
          clientId,
          userId: u.id,
          name: u.name ?? "Anonymous",
          color: u.color ?? "#888888",
          status: computeStatus(state.lastActive as number | undefined, now),
          typing: Boolean(state.typing),
        });
      });
      setPeers(list);
    };

    provider.awareness?.on("change", refresh);
    const interval = setInterval(refresh, 15000);
    refresh();
    markActivity();

    return () => {
      provider.off("status", onStatus);
      provider.off("authenticationFailed", onAuthFail);
      provider.awareness?.off("change", refresh);
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!editor || !canEdit) return;
    const initialContent = doc.content as object | null;
    const seed = () => {
      const meta = session.ydoc.getMap("meta");
      if (meta.get("seeded")) return;
      if (editor.isEmpty && initialContent) {
        editor.commands.setContent(initialContent);
      }
      meta.set("seeded", true);
    };
    if (session.provider.isSynced) seed();
    else session.provider.on("synced", seed);
    return () => {
      session.provider.off("synced", seed);
    };
  }, [editor, session]);

  useEffect(() => {
    if (followClientId == null) return;
    const peer = peers.find((p) => p.clientId === followClientId);
    if (!peer) {
      setFollowClientId(null);
      return;
    }
    const labels = document.querySelectorAll<HTMLElement>(
      ".collaboration-carets__label"
    );
    for (const label of labels) {
      if (label.textContent === peer.name) {
        label.scrollIntoView({ block: "center", behavior: "smooth" });
        break;
      }
    }
  }, [followClientId, peers]);

  useEffect(() => {
    api.documents.getSubscription(doc.id).then(setSubLevel).catch(() => {});
  }, [doc.id]);

  async function changeSubscription(level: SubscriptionLevel) {
    setSubLevel(level);
    setSubOpen(false);
    await api.documents.setSubscription(doc.id, level).catch(() => {});
  }

  const loadComments = useCallback(async () => {
    try {
      setComments(await api.comments.list(doc.id));
    } catch {
      // ignore — access may have changed
    }
  }, [doc.id]);

  useEffect(() => {
    loadComments();
    const interval = setInterval(loadComments, 15000);
    return () => clearInterval(interval);
  }, [loadComments]);

  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const ranges: CommentRange[] = [];
      for (const thread of comments) {
        if (thread.resolved) continue;
        const range = anchorToRange(editor, thread.anchorStart, thread.anchorEnd);
        if (range) {
          ranges.push({
            id: thread.id,
            from: range.from,
            to: range.to,
            resolved: thread.resolved,
            active: thread.id === activeCommentId,
          });
        }
      }
      applyCommentRanges(editor, ranges);
    };
    compute();
    editor.on("update", compute);
    return () => {
      editor.off("update", compute);
    };
  }, [editor, comments, activeCommentId]);

  function scrollToComment(id: string) {
    if (!editor) return;
    const thread = comments.find((t) => t.id === id);
    if (!thread) return;
    const range = anchorToRange(editor, thread.anchorStart, thread.anchorEnd);
    if (!range) return;
    try {
      const coords = editor.view.coordsAtPos(range.from);
      window.scrollTo({ top: window.scrollY + coords.top - 140, behavior: "smooth" });
    } catch {
      // position not resolvable yet
    }
  }

  activateRef.current = (id: string) => {
    setActiveCommentId(id);
    setDrawerOpen(true);
    scrollToComment(id);
  };

  function startComment() {
    if (!editor) return;
    const anchor = selectionToAnchor(editor);
    if (!anchor) return;
    setPendingAnchor(anchor);
    setActiveCommentId(null);
    setDrawerOpen(true);
  }

  async function createComment(body: string) {
    if (!pendingAnchor) return;
    await api.comments.create(doc.id, { body, ...pendingAnchor });
    setPendingAnchor(null);
    await loadComments();
  }

  useEffect(() => {
    if (!editor || !canEdit) return;
    const interval = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      api.versions
        .create(doc.id, { kind: "auto", content: editor.getJSON() })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [editor, canEdit, doc.id]);

  async function saveVersion() {
    if (!editor) return;
    const label = window.prompt("Name this version (optional):");
    if (label === null) return;
    try {
      await api.versions.create(doc.id, {
        kind: "named",
        label: label.trim() || undefined,
        content: editor.getJSON(),
      });
      dirtyRef.current = false;
      setVersionFlash(true);
      setTimeout(() => setVersionFlash(false), 2000);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!editor || !canEdit || !restoreId || restoredRef.current) return;
    restoredRef.current = true;
    const apply = async () => {
      try {
        const content = await api.versions.restore(doc.id, restoreId);
        editor.commands.setContent(content as Parameters<typeof editor.commands.setContent>[0]);
        dirtyRef.current = true;
      } catch {
        // ignore
      }
      setSearchParams({}, { replace: true });
    };
    if (session.provider.isSynced) apply();
    else session.provider.on("synced", apply);
    return () => {
      session.provider.off("synced", apply);
    };
  }, [editor, canEdit, restoreId, doc.id, session, setSearchParams]);

  useEffect(() => {
    return () => clearTimeout(titleTimer.current);
  }, []);

  function onTitleChange(value: string) {
    if (!canEdit) return;
    setTitle(value);
    setTitleSaving(true);
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      api.documents
        .rename(doc.id, value.trim() || "Untitled")
        .catch(() => {})
        .finally(() => setTitleSaving(false));
    }, 800);
  }

  const followedPeer =
    followClientId != null
      ? peers.find((p) => p.clientId === followClientId)
      : undefined;

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
            <PresenceStack
              me={{ name: auth.user.name, color: auth.color }}
              peers={peers}
              followClientId={followClientId}
              onFollow={(id) =>
                setFollowClientId((cur) => (cur === id ? null : id))
              }
            />
            {canEdit ? (
              titleSaving ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                  <Loader2 size={12} className="animate-spin" />
                  Saving…
                </span>
              ) : (
                <SyncBadge status={status} />
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                <Eye size={12} />
                {ROLE_LABEL[role]}
              </span>
            )}
            <button
              onClick={() => setDrawerOpen((o) => !o)}
              aria-label="Comments"
              className={
                "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors " +
                (drawerOpen
                  ? "bg-brand/10 text-brand"
                  : "text-muted hover:bg-surface-muted hover:text-fg")
              }
            >
              <MessageSquare size={18} />
              {openCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-fg">
                  {openCount > 9 ? "9+" : openCount}
                </span>
              )}
            </button>
            <NotificationBell />
            {canEdit && (
              <button
                onClick={saveVersion}
                title="Save a named version"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
              >
                {versionFlash ? <Save size={18} className="text-success" /> : <Save size={18} />}
              </button>
            )}
            <button
              onClick={() => navigate(`/d/${doc.id}/history`)}
              title="Version history"
              aria-label="Version history"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <HistoryIcon size={18} />
            </button>
            <div className="relative">
              <button
                onClick={() => setSubOpen((o) => !o)}
                title={`Notifications for this doc: ${subLevel}`}
                aria-label="Document notifications"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
              >
                {subLevel === "all" ? (
                  <BellRing size={18} />
                ) : subLevel === "none" ? (
                  <BellOff size={18} />
                ) : (
                  <Bell size={18} />
                )}
              </button>
              {subOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setSubOpen(false)} />
                  <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
                    <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
                      Notify me about
                    </p>
                    {(
                      [
                        ["all", "All activity"],
                        ["mentions", "Mentions & replies"],
                        ["none", "Nothing (mute)"],
                      ] as [SubscriptionLevel, string][]
                    ).map(([level, label]) => (
                      <button
                        key={level}
                        onClick={() => changeSubscription(level)}
                        className={
                          "block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted " +
                          (subLevel === level ? "font-medium text-brand" : "")
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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
        <ConnectionBanner status={status} />
        {followedPeer && (
          <FollowingBanner
            name={followedPeer.name}
            onStop={() => setFollowClientId(null)}
          />
        )}
      </header>

      {editor && canEdit && <Toolbar editor={editor} />}
      {editor && canComment && (
        <SelectionMenu
          editor={editor}
          canEdit={canEdit}
          canComment={canComment}
          onComment={startComment}
        />
      )}

      <CommentsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        docId={doc.id}
        comments={comments}
        currentUserId={auth.user.id}
        canComment={canComment}
        canModerate={isOwner}
        activeCommentId={activeCommentId}
        onActivate={(id) => activateRef.current(id)}
        onChanged={loadComments}
        pendingQuote={pendingAnchor ? pendingAnchor.quotedText : null}
        onCreate={createComment}
        onCancelPending={() => setPendingAnchor(null)}
      />

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
