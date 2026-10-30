import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Step, StepMap } from "@tiptap/pm/transform";
import { collab, getVersion, receiveTransaction, sendableSteps } from "prosemirror-collab";
import type { ConnStatus } from "./collab";

// Client side of the OT protocol (see apps/server/src/collab.ts). The server
// orders steps; prosemirror-collab keeps our unconfirmed steps and rebases
// (transforms) them over whatever the server accepted first.

export type PeerSelection = { anchor: number; head: number; version: number };

export type RemotePeer = {
  clientID: number;
  user: { id: string; name: string; color: string };
  selection: PeerSelection | null;
  typing: boolean;
  lastActive: number | null;
};

type ServerMessage =
  | { type: "hello"; version: number; readOnly: boolean }
  | { type: "init"; version: number; doc: Record<string, unknown> }
  | { type: "steps"; from: number; steps: unknown[]; clientIDs: number[] }
  | { type: "reject"; version: number }
  | { type: "presence"; peer: RemotePeer }
  | { type: "leave"; clientID: number }
  | { type: "error"; message: string };

type Events = {
  status: ConnStatus;
  authenticationFailed: void;
  peers: void;
  // The server can't bring us forward step by step; the editor must restart from this doc.
  reset: { doc: Record<string, unknown>; version: number };
};

// Confirmed step maps kept for mapping peer cursors and comment anchors forward.
const HISTORY = 2000;
const HEARTBEAT_MS = 20000;
const PRESENCE_THROTTLE_MS = 80;

export class OTProvider {
  readonly clientID = Math.floor(Math.random() * 0xffffffff);
  status: ConnStatus = "connecting";
  // The document as the server first sent it; the editor is created from this.
  initial: { doc: Record<string, unknown>; version: number } | null = null;
  peers = new Map<number, RemotePeer>();
  // Steps that were never confirmed when the editor had to be reset.
  orphanSteps: Step[] = [];

  private ws: WebSocket | null = null;
  private editor: Editor | null = null;
  private inFlight = false;
  private destroyed = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private presenceTimer: ReturnType<typeof setTimeout> | undefined;
  private maps: StepMap[] = [];
  private mapsBase = 0;
  private local: { typing: boolean; lastActive: number | null } = { typing: false, lastActive: null };
  private listeners: { [K in keyof Events]?: Set<(e: Events[K]) => void> } = {};
  private readyWaiters: (() => void)[] = [];

  constructor(
    private url: string,
    private docId: string,
    private token: string,
  ) {
    this.connect();
  }

  on<K extends keyof Events>(event: K, fn: (e: Events[K]) => void) {
    (this.listeners[event] ??= new Set() as never).add(fn);
  }

  off<K extends keyof Events>(event: K, fn: (e: Events[K]) => void) {
    this.listeners[event]?.delete(fn);
  }

  private emit<K extends keyof Events>(event: K, e: Events[K]) {
    this.listeners[event]?.forEach((fn) => fn(e));
  }

  // Resolves once the first document state has arrived.
  ready() {
    return new Promise<void>((resolve) => {
      if (this.initial) resolve();
      else this.readyWaiters.push(resolve);
    });
  }

  private setStatus(status: ConnStatus) {
    this.status = status;
    this.emit("status", status);
  }

  private connect() {
    if (this.destroyed) return;
    this.setStatus("connecting");
    const url = new URL(this.url);
    // Lets a load balancer route all editors of a document to the same replica.
    url.searchParams.set("doc", this.docId);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.send({
        type: "auth",
        token: this.token,
        clientID: this.clientID,
        version: this.editor ? getVersion(this.editor.state) : (this.initial?.version ?? null),
      });
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data as string) as ServerMessage);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.inFlight = false;
      clearInterval(this.heartbeat);
      if (this.peers.size) {
        this.peers.clear();
        this.emit("peers", undefined);
      }
      if (this.destroyed) return;
      if (ev.code === 4401 || ev.code === 4403 || ev.code === 4404) {
        this.setStatus("error");
        this.emit("authenticationFailed", undefined);
        return;
      }
      this.setStatus("disconnected");
      const delay = Math.min(30000, 500 * 2 ** this.retry++) * (0.5 + Math.random() / 2);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "hello":
        this.retry = 0;
        this.setStatus("connected");
        this.sendPresence();
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => this.sendPresence(), HEARTBEAT_MS);
        this.flush();
        return;
      case "init":
        if (!this.initial) {
          this.initial = { doc: msg.doc, version: msg.version };
          this.mapsBase = msg.version;
          this.readyWaiters.splice(0).forEach((fn) => fn());
        } else if (!this.editor || getVersion(this.editor.state) !== msg.version) {
          this.resetTo(msg.doc, msg.version);
        }
        this.flush();
        return;
      case "steps":
        this.receiveSteps(msg.from, msg.steps, msg.clientIDs);
        return;
      case "reject":
        this.inFlight = false;
        // If we already hold everything the server has, our steps were rebased: resend.
        if (this.editor && getVersion(this.editor.state) >= msg.version) this.flush();
        return;
      case "presence":
        if (msg.peer.clientID === this.clientID) return;
        this.peers.set(msg.peer.clientID, this.mapPeer(msg.peer));
        this.emit("peers", undefined);
        this.refreshCursors();
        return;
      case "leave":
        if (this.peers.delete(msg.clientID)) {
          this.emit("peers", undefined);
          this.refreshCursors();
        }
        return;
      case "error":
        console.warn("[collab]", msg.message);
        return;
    }
  }

  private receiveSteps(from: number, stepsJSON: unknown[], clientIDs: number[]) {
    const editor = this.editor;
    if (!editor) return;
    const version = getVersion(editor.state);
    if (from > version) {
      // We missed something; ask again from where we are.
      this.send({ type: "pull", version });
      return;
    }
    const skip = version - from;
    if (skip >= stepsJSON.length) return;
    const schema = editor.schema;
    const steps = stepsJSON.slice(skip).map((j) => Step.fromJSON(schema, j));
    const ids = clientIDs.slice(skip);
    if (ids.includes(this.clientID)) this.inFlight = false;

    editor.view.dispatch(
      receiveTransaction(editor.state, steps, ids, { mapSelectionBackward: true }),
    );

    this.maps.push(...steps.map((s) => s.getMap()));
    if (this.maps.length > HISTORY) {
      const drop = this.maps.length - HISTORY;
      this.maps.splice(0, drop);
      this.mapsBase += drop;
    }
    for (const [id, peer] of this.peers) this.peers.set(id, this.mapPeer(peer));
    this.refreshCursors();
    this.flush();
  }

  private resetTo(doc: Record<string, unknown>, version: number) {
    const pending = this.editor ? sendableSteps(this.editor.state) : null;
    this.orphanSteps = pending ? [...pending.steps] : [];
    // The old editor is about to be replaced; the new one pulls anything it missed on attach.
    this.editor = null;
    this.initial = { doc, version };
    this.maps = [];
    this.mapsBase = version;
    this.inFlight = false;
    this.emit("reset", { doc, version });
  }

  // Sends our unconfirmed steps if nothing is already on the way.
  flush() {
    const editor = this.editor;
    if (!editor || this.inFlight || this.status !== "connected") return;
    const sendable = sendableSteps(editor.state);
    if (!sendable) return;
    this.inFlight = true;
    this.send({
      type: "steps",
      version: sendable.version,
      steps: sendable.steps.map((s) => s.toJSON()),
    });
  }

  attach(editor: Editor) {
    this.editor = editor;
    if (this.orphanSteps.length) {
      // Best effort: replay what we hadn't sent before the reset.
      const tr = editor.state.tr;
      for (const step of this.orphanSteps) tr.maybeStep(step);
      this.orphanSteps = [];
      if (tr.docChanged) editor.view.dispatch(tr);
    }
    // Pick up anything that arrived between the first state and the editor existing.
    this.send({ type: "pull", version: getVersion(editor.state) });
    this.flush();
  }

  detach(editor: Editor) {
    if (this.editor === editor) this.editor = null;
  }

  setLocalState(state: Partial<{ typing: boolean; lastActive: number }>) {
    const next = { ...this.local, ...state };
    if (next.typing === this.local.typing && next.lastActive === this.local.lastActive) return;
    this.local = next;
    this.sendPresence();
  }

  schedulePresence() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => this.sendPresence(), PRESENCE_THROTTLE_MS);
  }

  sendPresence() {
    clearTimeout(this.presenceTimer);
    this.presenceTimer = undefined;
    const editor = this.editor;
    let selection: PeerSelection | null = null;
    if (editor && editor.isFocused) {
      const { anchor, head } = editor.state.selection;
      const version = getVersion(editor.state);
      const a = this.toConfirmed(editor.state, anchor);
      const h = this.toConfirmed(editor.state, head);
      if (a !== null && h !== null) selection = { anchor: a, head: h, version };
    }
    this.send({ type: "presence", selection, ...this.local });
  }

  // Position in the local document (which includes unconfirmed steps) → position
  // in the last confirmed version, which is what the server and peers share.
  toConfirmed(state: EditorState, pos: number): number | null {
    const pending = sendableSteps(state);
    if (!pending) return pos;
    for (let i = pending.steps.length - 1; i >= 0; i--) {
      const r = pending.steps[i].getMap().invert().mapResult(pos);
      if (r.deleted) return null;
      pos = r.pos;
    }
    return pos;
  }

  // Position at confirmed `version` → position in the current local document,
  // or null if we don't have the steps in between.
  fromVersion(state: EditorState, pos: number, version: number, assoc = 1): number | null {
    const current = getVersion(state);
    if (version < this.mapsBase || version > current) return null;
    for (const map of this.maps.slice(version - this.mapsBase, current - this.mapsBase)) {
      pos = map.map(pos, assoc);
    }
    const pending = sendableSteps(state);
    for (const step of pending?.steps ?? []) pos = step.getMap().map(pos, assoc);
    return pos;
  }

  // Keeps a peer's selection at our confirmed version so mapping stays cheap.
  private mapPeer(peer: RemotePeer): RemotePeer {
    const sel = peer.selection;
    const editor = this.editor;
    if (!sel || !editor) return peer;
    const current = getVersion(editor.state);
    if (sel.version >= current) return peer;
    if (sel.version < this.mapsBase) return { ...peer, selection: null };
    let { anchor, head } = sel;
    for (const map of this.maps.slice(sel.version - this.mapsBase, current - this.mapsBase)) {
      anchor = map.map(anchor);
      head = map.map(head);
    }
    return { ...peer, selection: { anchor, head, version: current } };
  }

  private refreshCursors() {
    const editor = this.editor;
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(cursorsKey, true));
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeat);
    clearTimeout(this.presenceTimer);
    this.ws?.close();
    this.ws = null;
    this.editor = null;
  }
}

export const cursorsKey = new PluginKey<DecorationSet>("otCursors");

function caret(name: string, color: string) {
  const cursor = document.createElement("span");
  cursor.classList.add("collaboration-carets__caret");
  cursor.style.borderColor = color;
  const label = document.createElement("div");
  label.classList.add("collaboration-carets__label");
  label.style.backgroundColor = color;
  label.textContent = name;
  cursor.append(label);
  return cursor;
}

function cursorDecorations(provider: OTProvider, state: EditorState) {
  const version = getVersion(state);
  const size = state.doc.content.size;
  const decorations: Decoration[] = [];
  for (const peer of provider.peers.values()) {
    const sel = peer.selection;
    if (!sel || sel.version !== version) continue;
    const anchor = provider.fromVersion(state, sel.anchor, version);
    const head = provider.fromVersion(state, sel.head, version);
    if (anchor === null || head === null || anchor > size || head > size) continue;
    const { color, name } = peer.user;
    decorations.push(
      Decoration.widget(head, () => caret(name, color), { key: `${peer.clientID}:${name}:${color}`, side: 10 }),
    );
    if (anchor !== head) {
      decorations.push(
        Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), {
          style: `background-color: ${color}33`,
          class: "collaboration-carets__selection",
        }),
      );
    }
  }
  return DecorationSet.create(state.doc, decorations);
}

export const OTCollab = Extension.create<{ provider: OTProvider | null }>({
  name: "otCollab",

  addOptions() {
    return { provider: null };
  },

  addProseMirrorPlugins() {
    const provider = this.options.provider!;
    return [
      collab({ version: provider.initial?.version ?? 0, clientID: provider.clientID }),
      new Plugin<DecorationSet>({
        key: cursorsKey,
        state: {
          init: (_, state) => cursorDecorations(provider, state),
          apply: (tr, value, _old, state) =>
            tr.docChanged || tr.getMeta(cursorsKey) ? cursorDecorations(provider, state) : value,
        },
        props: {
          decorations: (state) => cursorsKey.getState(state),
        },
      }),
    ];
  },

  onCreate() {
    this.options.provider!.attach(this.editor);
  },

  onTransaction({ transaction }) {
    const provider = this.options.provider!;
    if (transaction.docChanged) provider.flush();
    if (transaction.docChanged || transaction.selectionSet) provider.schedulePresence();
  },

  onFocus() {
    this.options.provider!.sendPresence();
  },

  onBlur() {
    this.options.provider!.sendPresence();
  },

  onDestroy() {
    this.options.provider!.detach(this.editor);
  },
});
