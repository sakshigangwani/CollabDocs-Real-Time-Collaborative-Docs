// One load-generator process. Opens real OT clients (prosemirror-collab, the same
// rebasing the editor uses, speaking the server's WebSocket protocol) and measures
// end-to-end sync latency: sender stamps each edit with a wall-clock time, every
// other client in the doc records receive time - send time. Clients alternate
// between server instances, so a "cross" sample means the step travelled
// A -> Redis step log + pub/sub -> B. Rejected (stale) steps are rebased and
// resent, so that cost is part of the measured latency.
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { EditorState } from "@tiptap/pm/state";
import { Step } from "@tiptap/pm/transform";
import { collab, getVersion, receiveTransaction, sendableSteps } from "prosemirror-collab";
import { createHash, createHmac } from "node:crypto";

const cfg = JSON.parse(process.argv[2]);
const { affinity, docs, clientsPerDoc, workerIdx, workers, ports, secret, editIntervalMs, durationMs, warmupMs } = cfg;

const schema = getSchema([
  StarterKit, TextStyle, Color, Highlight.configure({ multicolor: true }),
  TableKit, TaskList, TaskItem.configure({ nested: true }), Image,
]);

const now = () => performance.timeOrigin + performance.now();

// HS256 JWT, same claims the server's mintCollabToken() issues.
function token(docId, userId, role = "EDITOR") {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256" })}.${b64({ name: userId, color: "#000", docId, role, sub: userId, iat, exp: iat + 7200 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

// Edits are paragraphs whose text is "bench|<sent at>|<instance>|<measuring>".
const MARK = /^bench\|([\d.]+)\|(\d+)\|([01])$/;

const clients = [];
let globalIdx = 0;
for (const [docIdx, docId] of docs.entries()) {
  for (let c = 0; c < clientsPerDoc; c++, globalIdx++) {
    if (globalIdx % workers !== workerIdx) continue;
    // affinity: all editors of a doc on one instance (what a doc-hash load balancer does)
    const instance = affinity ? docIdx % ports.length : c % ports.length;
    clients.push({ docId, id: globalIdx, instance, state: null, inFlight: false, synced: false });
  }
}

const samples = { same: [], cross: [] };
let measuring = false, sent = 0, received = 0, connectErrors = 0;

function flush(cl) {
  if (cl.inFlight || !cl.state) return;
  const s = sendableSteps(cl.state);
  if (!s) return;
  cl.inFlight = true;
  cl.ws.send(JSON.stringify({ type: "steps", version: s.version, steps: s.steps.map((x) => x.toJSON()) }));
}

function onSteps(cl, msg) {
  const version = getVersion(cl.state);
  if (msg.from > version) return cl.ws.send(JSON.stringify({ type: "pull", version }));
  const skip = version - msg.from;
  if (skip >= msg.steps.length) return;
  const t = now();
  const steps = msg.steps.slice(skip).map((j) => Step.fromJSON(schema, j));
  const ids = msg.clientIDs.slice(skip);
  if (ids.includes(cl.id)) cl.inFlight = false;
  ids.forEach((id, k) => {
    if (id === cl.id || !measuring) return;
    const text = msg.steps[skip + k].slice?.content?.[0]?.content?.[0]?.text;
    const m = text && MARK.exec(text);
    if (!m || m[3] !== "1") return;
    received++;
    samples[Number(m[2]) === cl.instance ? "same" : "cross"].push(t - Number(m[1]));
  });
  cl.state = cl.state.apply(receiveTransaction(cl.state, steps, ids));
  flush(cl);
}

const t0 = now();
await Promise.all(clients.map((cl) => new Promise((res) => {
  const to = setTimeout(() => { connectErrors++; res(); }, 30000);
  const ws = new WebSocket(`ws://127.0.0.1:${ports[cl.instance]}?doc=${cl.docId}`);
  cl.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: token(cl.docId, `bench-${cl.id}`), clientID: cl.id, version: null }));
  ws.onclose = () => { if (!cl.synced) { clearTimeout(to); connectErrors++; res(); } };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "init") {
      cl.state = EditorState.create({ doc: schema.nodeFromJSON(msg.doc), plugins: [collab({ version: msg.version, clientID: cl.id })] });
      cl.synced = true; clearTimeout(to); res();
    } else if (msg.type === "steps" && cl.state) onSteps(cl, msg);
    else if (msg.type === "reject") { cl.inFlight = false; if (getVersion(cl.state) >= msg.version) flush(cl); }
  };
})));
const connectMs = now() - t0;
process.send({ type: "ready", connected: clients.filter((c) => c.synced).length, connectErrors, connectMs });

await new Promise((r) => process.once("message", r)); // start signal
const timers = clients.filter((c) => c.synced).map((cl) => {
  const jitter = Math.random() * editIntervalMs;
  let iv;
  const to = setTimeout(() => {
    iv = setInterval(() => {
      const text = `bench|${now()}|${cl.instance}|${measuring ? 1 : 0}`;
      const tr = cl.state.tr.insert(cl.state.doc.content.size, schema.nodes.paragraph.create(null, schema.text(text)));
      cl.state = cl.state.apply(tr);
      if (measuring) sent++;
      flush(cl);
    }, editIntervalMs);
  }, jitter);
  return () => { clearTimeout(to); clearInterval(iv); };
});
await new Promise((r) => setTimeout(r, warmupMs));
measuring = true;
await new Promise((r) => setTimeout(r, durationMs));
measuring = false;
timers.forEach((stop) => stop());
await new Promise((r) => setTimeout(r, 3000)); // let in-flight steps land

// convergence: hash of each client's final document, grouped by doc
const states = clients.filter((c) => c.synced).map((c) => ({
  docId: c.docId,
  len: c.state.doc.childCount,
  sv: createHash("sha1").update(JSON.stringify(c.state.doc.toJSON())).digest("base64"),
}));
process.send({ type: "done", samples, sent, received, states });
setTimeout(() => { clients.forEach((c) => c.ws?.close()); process.exit(0); }, 500);
