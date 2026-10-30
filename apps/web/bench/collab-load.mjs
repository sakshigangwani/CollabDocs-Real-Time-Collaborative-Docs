// Orchestrates the collab load test: forks N worker processes, samples server
// CPU/RSS, aggregates latency percentiles and checks every replica converged.
import { fork, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const nDocs = Number(args.docs ?? 50), perDoc = Number(args.perDoc ?? 10), workers = Number(args.workers ?? 4);
const ports = (args.ports ?? "4101,4201").split(",").map(Number);
const serverPids = (args.pids ?? "").split(",").filter(Boolean);
const docs = execSync(`psql -d collabdocs_bench -Atc "select id from \\"Document\\" order by id offset ${args.offset ?? 0} limit ${nDocs}"`).toString().trim().split("\n");

const base = { affinity: args.affinity === "1", docs, clientsPerDoc: perDoc, workers, ports, secret: process.env.COLLAB_JWT_SECRET, editIntervalMs: Number(args.interval ?? 1000), durationMs: Number(args.duration ?? 30000), warmupMs: 5000 };
const procs = Array.from({ length: workers }, (_, i) => fork(fileURLToPath(new URL("./collab-worker.mjs", import.meta.url)), [JSON.stringify({ ...base, workerIdx: i })]));
const ready = await Promise.all(procs.map((p) => new Promise((r) => p.once("message", r))));
const connected = ready.reduce((a, r) => a + r.connected, 0);
console.error(`connected ${connected}/${nDocs * perDoc} (errors ${ready.reduce((a, r) => a + r.connectErrors, 0)}) in ${Math.max(...ready.map((r) => r.connectMs)).toFixed(0)}ms`);

const usage = [];
const sampler = setInterval(() => {
  if (!serverPids.length) return;
  const out = execSync(`ps -o pid=,%cpu=,rss= -p ${serverPids.join(",")}`).toString().trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
  usage.push(out);
}, 1000);
const results = new Promise((res) => { const got = []; procs.forEach((p) => p.on("message", (m) => { if (m.type === "done") { got.push(m); if (got.length === workers) res(got); } })); });
procs.forEach((p) => p.send("start"));
const got = await results;
clearInterval(sampler);

const pct = (a, p) => a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
const sum = (xs) => { const a = [...xs].sort((x, y) => x - y); const r = (n) => Math.round(n * 100) / 100; return a.length ? { n: a.length, p50: r(pct(a, 50)), p95: r(pct(a, 95)), p99: r(pct(a, 99)), max: r(a.at(-1)) } : { n: 0 }; };
const same = got.flatMap((g) => g.samples.same), cross = got.flatMap((g) => g.samples.cross);
const sent = got.reduce((a, g) => a + g.sent, 0), received = got.reduce((a, g) => a + g.received, 0);
const byDoc = new Map();
for (const s of got.flatMap((g) => g.states)) { const e = byDoc.get(s.docId) ?? new Set(); e.add(s.sv); byDoc.set(s.docId, e); }
const converged = [...byDoc.values()].filter((s) => s.size === 1).length;
const secs = base.durationMs / 1000;
const perPid = serverPids.map((pid, i) => { const rows = usage.map((u) => u.find((r) => r[0] === Number(pid))).filter(Boolean); return { pid, avgCpuPct: +(rows.reduce((a, r) => a + r[1], 0) / rows.length).toFixed(1), maxRssMB: +(Math.max(...rows.map((r) => r[2])) / 1024).toFixed(0) }; });
console.log(JSON.stringify({
  config: { docs: nDocs, clientsPerDoc: perDoc, connections: connected, instances: ports.length, editIntervalMs: base.editIntervalMs, measureSecs: secs },
  editsPerSec: +(sent / secs).toFixed(0), deliveriesPerSec: +(received / secs).toFixed(0),
  expectedDeliveries: sent * (perDoc - 1), received, deliveryRatio: +(received / (sent * (perDoc - 1))).toFixed(4),
  latencyMs: { all: sum([...same, ...cross]), sameInstance: sum(same), crossInstanceViaRedis: sum(cross) },
  convergence: `${converged}/${byDoc.size} docs identical across all replicas`, server: perPid,
}, null, 2));
process.exit(0);
