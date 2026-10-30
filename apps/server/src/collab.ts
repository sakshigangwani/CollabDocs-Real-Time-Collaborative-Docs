import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { roleAtLeast } from "./permissions.js";
import { verifyCollabToken, type CollabClaims } from "./auth/collab-token.js";
import { DocAuthority, type Conn, type ServerMessage } from "./collab/authority.js";
import { createStepLog } from "./collab/steplog.js";

export const INSTANCE_ID = process.env.INSTANCE_ID ?? randomUUID();

// Wire protocol (JSON over WebSocket), client → server:
//   auth      first message: token, the client's random clientID, and the OT version it
//             already has (null on first load). Server answers hello + init|steps.
//   steps     steps the client made on top of `version`. Accepted steps come back to
//             everyone (sender included) as `steps`; stale ones get `reject` and the
//             client rebases over the steps it is about to receive, then resends.
//   pull      the client noticed a gap; server resends from `version`.
//   presence  cursor/selection (at an OT version), typing, last activity.
const clientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    token: z.string().max(4096),
    clientID: z.number().int().nonnegative(),
    version: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    type: z.literal("steps"),
    version: z.number().int().nonnegative(),
    steps: z.array(z.unknown()).min(1).max(2000),
  }),
  z.object({ type: z.literal("pull"), version: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("presence"),
    selection: z
      .object({
        anchor: z.number().int().nonnegative(),
        head: z.number().int().nonnegative(),
        version: z.number().int().nonnegative(),
      })
      .nullable(),
    typing: z.boolean(),
    lastActive: z.number().nullable(),
  }),
]);

const AUTH_TIMEOUT_MS = 10000;
const PING_INTERVAL_MS = 30000;

export function createCollabServer() {
  const log = createStepLog(INSTANCE_ID);
  const docs = new Map<string, Promise<DocAuthority | null>>();
  const unloading = new Map<string, Promise<void>>();
  let wss: WebSocketServer | null = null;

  async function open(docId: string) {
    await unloading.get(docId);
    let pending = docs.get(docId);
    if (!pending) {
      const authority = new DocAuthority(docId, log);
      pending = authority.load().then((found) => (found ? authority : null));
      docs.set(docId, pending);
      pending.then((a) => !a && docs.delete(docId), () => docs.delete(docId));
    }
    return pending;
  }

  function close(authority: DocAuthority) {
    if (authority.conns.size > 0 || unloading.has(authority.id)) return;
    docs.delete(authority.id);
    const done = authority
      .unload()
      .catch((err) => console.error(`[collab] unload failed for ${authority.id}`, err))
      .finally(() => unloading.delete(authority.id));
    unloading.set(authority.id, done);
  }

  log.onMessage(async (docId, _origin, msg) => {
    const authority = await docs.get(docId)?.catch(() => null);
    if (!authority) return;
    if (msg.kind === "steps") {
      authority.receiveRemote(msg.from, msg.entries).catch((err) => {
        console.error(`[collab] remote steps for ${docId} failed`, err);
      });
    } else if (msg.kind === "presence") {
      authority.remotePresence(msg.peer as Parameters<DocAuthority["remotePresence"]>[0]);
    } else {
      authority.remoteLeave(msg.clientID);
    }
  });

  const sweep = setInterval(async () => {
    const now = Date.now();
    for (const pending of docs.values()) (await pending.catch(() => null))?.sweepRemotePeers(now);
  }, 10000);

  function handle(socket: WebSocket) {
    let claims: CollabClaims | null = null;
    let authority: DocAuthority | null = null;
    let alive = true;

    const conn: Conn = {
      clientID: null,
      readOnly: true,
      send(msg: ServerMessage) {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      },
    };

    const fail = (code: number, message: string) => {
      conn.send({ type: "error", message });
      socket.close(code, message);
    };

    const authTimer = setTimeout(() => fail(4401, "Authentication timed out."), AUTH_TIMEOUT_MS);
    const ping = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, PING_INTERVAL_MS);
    socket.on("pong", () => (alive = true));

    socket.on("message", async (raw) => {
      let parsed;
      try {
        parsed = clientMessage.safeParse(JSON.parse(raw.toString()));
      } catch {
        return fail(4400, "Malformed message.");
      }
      if (!parsed.success) return fail(4400, "Malformed message.");
      const msg = parsed.data;

      if (msg.type === "auth") {
        if (claims) return;
        try {
          claims = await verifyCollabToken(msg.token);
        } catch {
          return fail(4401, "Invalid or expired token.");
        }
        clearTimeout(authTimer);
        if (!roleAtLeast(claims.role, "VIEWER")) return fail(4403, "You don't have access to this document.");
        conn.clientID = msg.clientID;
        conn.readOnly = !roleAtLeast(claims.role, "EDITOR");

        try {
          authority = await open(claims.docId);
        } catch (err) {
          console.error(`[collab] failed to load ${claims.docId}`, err);
          return fail(1011, "Couldn't load the document.");
        }
        if (!authority) return fail(4404, "Document not found.");
        if (socket.readyState !== socket.OPEN) return close(authority);
        authority.join(conn);
        await authority.resume(conn, msg.version);
        return;
      }

      if (!claims || !authority) return fail(4401, "Not authenticated.");

      if (msg.type === "steps") {
        await authority.receive(conn, msg.version, msg.steps).catch((err) => {
          console.error(`[collab] steps for ${authority!.id} failed`, err);
          fail(1011, "Couldn't apply changes.");
        });
      } else if (msg.type === "pull") {
        await authority.resume(conn, msg.version);
      } else {
        authority.setPresence(conn, {
          clientID: conn.clientID!,
          user: { id: claims.sub, name: claims.name, color: claims.color },
          selection: msg.selection,
          typing: msg.typing,
          lastActive: msg.lastActive,
        });
      }
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      clearInterval(ping);
      if (!authority) return;
      authority.leave(conn);
      close(authority);
    });

    socket.on("error", () => socket.terminate());
  }

  return {
    listen(port: number) {
      return new Promise<void>((resolve, reject) => {
        wss = new WebSocketServer({ port, maxPayload: 8 * 1024 * 1024 });
        wss.on("connection", handle);
        wss.once("listening", resolve);
        wss.once("error", reject);
      });
    },

    // Persists every open document, then tells clients to reconnect (to another replica).
    async destroy() {
      clearInterval(sweep);
      for (const socket of wss?.clients ?? []) socket.close(1012, "Server restarting.");
      wss?.close();
      const open = await Promise.all([...docs.values()].map((p) => p.catch(() => null)));
      await Promise.all(open.map((a) => a?.persist().catch(() => {})));
      await Promise.all(unloading.values());
      await log.close();
    },
  };
}
