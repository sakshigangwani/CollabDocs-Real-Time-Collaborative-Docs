import { Step, Mapping } from "@tiptap/pm/transform";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { deleteObject, getObject } from "../storage.js";
import { reindex, textOf } from "../search.js";
import { schema, emptyDoc } from "./schema.js";
import { yjsStateToDoc } from "./legacy.js";
import type { StepEntry, StepLog } from "./steplog.js";

export type Peer = {
  clientID: number;
  user: { id: string; name: string; color: string };
  // Selection in document positions at OT version `version`.
  selection: { anchor: number; head: number; version: number } | null;
  typing: boolean;
  lastActive: number | null;
};

export type ServerMessage =
  | { type: "hello"; version: number; readOnly: boolean }
  | { type: "init"; version: number; doc: unknown }
  | { type: "steps"; from: number; steps: unknown[]; clientIDs: number[] }
  | { type: "reject"; version: number }
  | { type: "presence"; peer: Peer }
  | { type: "leave"; clientID: number }
  | { type: "error"; message: string };

export interface Conn {
  clientID: number | null;
  readOnly: boolean;
  send(msg: ServerMessage): void;
}

const DEBOUNCE_MS = 2000;
const MAX_DEBOUNCE_MS = 10000;
// Presence from other instances is dropped if not refreshed (clients heartbeat every 20s).
const REMOTE_PEER_TTL_MS = 60000;

// The in-memory copy of one document on this instance, plus the connections
// editing it here. All state changes go through `run` so they are serialised.
export class DocAuthority {
  doc: PMNode = emptyDoc();
  version = 0;
  conns = new Set<Conn>();
  private persistedVersion = 0;
  private legacySnapshotKey: string | null = null;
  private legacyColumn = false;
  private queue: Promise<unknown> = Promise.resolve();
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private firstDirtyAt = 0;
  private localPeers = new Map<Conn, Peer>();
  private remotePeers = new Map<number, { peer: Peer; expires: number }>();

  constructor(
    readonly id: string,
    private log: StepLog,
  ) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  // Returns false if the document doesn't exist.
  async load() {
    const row = await prisma.document.findUnique({
      where: { id: this.id },
      select: { content: true, otVersion: true, ydoc: true, snapshotKey: true },
    });
    if (!row) return false;

    let doc: PMNode | null = null;
    if (row.content) {
      try {
        doc = schema.nodeFromJSON(row.content);
        doc.check();
      } catch (err) {
        console.error(`[collab] stored content for ${this.id} doesn't fit the schema`, err);
        doc = null;
      }
    }
    if (row.otVersion === 0 && (row.snapshotKey || row.ydoc)) {
      const state = row.snapshotKey ? await getObject(row.snapshotKey).catch(() => null) : null;
      const legacy = state ?? row.ydoc;
      const migrated = legacy ? yjsStateToDoc(new Uint8Array(legacy)) : null;
      if (migrated) doc = migrated;
      this.legacySnapshotKey = row.snapshotKey;
      this.legacyColumn = Boolean(row.ydoc);
    }

    this.doc = doc ?? emptyDoc();
    this.version = row.otVersion;
    this.persistedVersion = row.otVersion;

    await this.log.init(this.id, this.version);
    await this.log.subscribe(this.id);
    // Another instance may hold steps it hasn't persisted yet.
    await this.catchUp();
    if (this.legacySnapshotKey || this.legacyColumn) this.schedulePersist();
    return true;
  }

  private async catchUp() {
    const entries = await this.log.since(this.id, this.version);
    if (entries === null) {
      throw new Error(`step log for ${this.id} no longer covers version ${this.version}`);
    }
    if (entries.length) this.applyEntries(this.version, entries);
  }

  // Applies already-ordered entries starting at version `from`, skipping any we have.
  private applyEntries(from: number, entries: StepEntry[]) {
    const fresh = entries.slice(this.version - from);
    if (!fresh.length) return;
    let doc = this.doc;
    for (const e of fresh) {
      const result = Step.fromJSON(schema, e.step).apply(doc);
      if (!result.doc) throw new Error(`logged step failed to apply to ${this.id}: ${result.failed}`);
      doc = result.doc;
    }
    const start = this.version;
    this.doc = doc;
    this.version += fresh.length;
    this.broadcast({
      type: "steps",
      from: start,
      steps: fresh.map((e) => e.step),
      clientIDs: fresh.map((e) => e.clientID),
    });
    this.schedulePersist();
  }

  // A client sent steps built on `version`.
  receive(conn: Conn, version: number, stepsJSON: unknown[]) {
    return this.run(async () => {
      if (conn.readOnly || conn.clientID === null) {
        conn.send({ type: "error", message: "This connection is read-only." });
        return;
      }
      if (version > this.version) await this.catchUp();
      if (version !== this.version) {
        conn.send({ type: "reject", version: this.version });
        return;
      }

      let doc = this.doc;
      const entries: StepEntry[] = [];
      for (const json of stepsJSON) {
        let step: Step;
        let result;
        try {
          step = Step.fromJSON(schema, json);
          result = step.apply(doc);
        } catch {
          conn.send({ type: "error", message: "Malformed step." });
          return;
        }
        if (!result.doc) {
          conn.send({ type: "error", message: `Step rejected: ${result.failed}` });
          return;
        }
        doc = result.doc;
        entries.push({ step: step.toJSON(), clientID: conn.clientID });
      }

      if (!(await this.log.append(this.id, version, entries))) {
        // Another instance appended first; pick its steps up and let the client rebase.
        await this.catchUp();
        conn.send({ type: "reject", version: this.version });
        return;
      }
      this.applyEntries(version, entries);
    });
  }

  // Steps another instance appended (delivered over Redis pub/sub).
  receiveRemote(from: number, entries: StepEntry[]) {
    return this.run(async () => {
      if (from > this.version) await this.catchUp();
      else this.applyEntries(from, entries);
    });
  }

  // What a (re)connecting client needs to get from `version` to the current state.
  resume(conn: Conn, version: number | null) {
    return this.run(async () => {
      conn.send({ type: "hello", version: this.version, readOnly: conn.readOnly });
      if (version !== null && version <= this.version) {
        const entries = await this.log.since(this.id, version);
        if (entries && entries.length === this.version - version) {
          if (entries.length) {
            conn.send({
              type: "steps",
              from: version,
              steps: entries.map((e) => e.step),
              clientIDs: entries.map((e) => e.clientID),
            });
          }
          return;
        }
      }
      conn.send({ type: "init", version: this.version, doc: this.doc.toJSON() });
    });
  }

  join(conn: Conn) {
    this.conns.add(conn);
    for (const peer of this.peers()) conn.send({ type: "presence", peer });
  }

  leave(conn: Conn) {
    this.conns.delete(conn);
    const peer = this.localPeers.get(conn);
    this.localPeers.delete(conn);
    if (peer) {
      this.broadcast({ type: "leave", clientID: peer.clientID }, conn);
      this.log.publish(this.id, { kind: "leave", clientID: peer.clientID }).catch(() => {});
    }
  }

  setPresence(conn: Conn, peer: Peer) {
    this.localPeers.set(conn, peer);
    this.broadcast({ type: "presence", peer }, conn);
    this.log.publish(this.id, { kind: "presence", peer }).catch(() => {});
  }

  remotePresence(peer: Peer) {
    this.remotePeers.set(peer.clientID, { peer, expires: Date.now() + REMOTE_PEER_TTL_MS });
    this.broadcast({ type: "presence", peer });
  }

  remoteLeave(clientID: number) {
    if (this.remotePeers.delete(clientID)) this.broadcast({ type: "leave", clientID });
  }

  sweepRemotePeers(now: number) {
    for (const [clientID, { expires }] of this.remotePeers) {
      if (expires < now) this.remoteLeave(clientID);
    }
  }

  private peers() {
    return [...this.localPeers.values(), ...[...this.remotePeers.values()].map((p) => p.peer)];
  }

  private broadcast(msg: ServerMessage, except?: Conn) {
    for (const conn of this.conns) if (conn !== except) conn.send(msg);
  }

  private schedulePersist() {
    const now = Date.now();
    if (!this.persistTimer) this.firstDirtyAt = now;
    clearTimeout(this.persistTimer);
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, this.firstDirtyAt + MAX_DEBOUNCE_MS - now));
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.persist().catch((err) => console.error(`[collab] persist failed for ${this.id}`, err));
    }, wait);
  }

  persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    return this.run(async () => {
      const legacy = this.legacySnapshotKey !== null || this.legacyColumn;
      if (this.version <= this.persistedVersion && !legacy) return;
      const version = this.version;
      const content = this.doc.toJSON();

      // Conditional on the version so instances sharing a document never move it backwards.
      const { count } = await prisma.document.updateMany({
        where: { id: this.id, otVersion: { lte: version } },
        data: {
          content: content as Prisma.InputJsonValue,
          otVersion: version,
          searchText: textOf(content),
          updatedAt: new Date(),
          ...(legacy ? { ydoc: null, snapshotKey: null } : {}),
        },
      });
      this.persistedVersion = version;
      if (!count) return;
      await reindex(this.id);

      if (this.legacySnapshotKey) await deleteObject(this.legacySnapshotKey).catch(() => {});
      this.legacySnapshotKey = null;
      this.legacyColumn = false;

      await this.mapCommentAnchors(version);
    });
  }

  // Moves open comment anchors forward to `version` so they keep pointing at
  // the same text. Clients can map recent anchors themselves, but only through
  // steps they've seen, so the stored anchors must not fall far behind.
  private async mapCommentAnchors(version: number) {
    const comments = await prisma.comment.findMany({
      where: {
        documentId: this.id,
        parentId: null,
        deletedAt: null,
        resolvedAt: null,
        anchorVersion: { lt: version },
        anchorFrom: { not: null },
        anchorTo: { not: null },
      },
      select: { id: true, anchorFrom: true, anchorTo: true, anchorVersion: true },
    });
    if (!comments.length) return;

    const oldest = Math.min(...comments.map((c) => c.anchorVersion!));
    const entries = await this.log.since(this.id, oldest);
    if (!entries) return;
    const maps = entries.slice(0, version - oldest).map((e) => Step.fromJSON(schema, e.step).getMap());

    for (const c of comments) {
      const mapping = new Mapping(maps.slice(c.anchorVersion! - oldest));
      const from = mapping.map(c.anchorFrom!, 1);
      const to = Math.max(from, mapping.map(c.anchorTo!, -1));
      await prisma.comment.updateMany({
        where: { id: c.id, anchorVersion: c.anchorVersion },
        data: { anchorFrom: from, anchorTo: to, anchorVersion: version },
      });
    }
  }

  async unload() {
    clearTimeout(this.persistTimer);
    await this.persist();
    await this.log.unsubscribe(this.id);
  }
}
