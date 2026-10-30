// Loads bench/rag-dataset.json into the bench DB with realistic ACLs, then embeds
// everything (eval corpus + the 10K synthetic search docs as distractors) through
// the production embedDocument() path. Reports embedding throughput/latency.
import "./guard.js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db.js";
import { embedDocument } from "../src/rag.js";
import { summary } from "./lib.js";

const data = JSON.parse(readFileSync(new URL("./rag-dataset.json", import.meta.url), "utf8"));
const mk = (email: string, name: string) => prisma.user.create({ data: { email, name } });
const evalUser = await mk("rag-eval@bench.local", "Eval User");
const teammate = await mk("rag-teammate@bench.local", "Teammate");
const outsider = await mk("rag-outsider@bench.local", "Outsider");
const wsA = await prisma.workspace.create({ data: { name: data.A_CO, slug: "rag-a", ownerId: teammate.id } });
const wsB = await prisma.workspace.create({ data: { name: data.B_CO, slug: "rag-b", ownerId: outsider.id } });
await prisma.workspaceMember.createMany({ data: [
  { workspaceId: wsA.id, userId: evalUser.id }, { workspaceId: wsA.id, userId: teammate.id }, { workspaceId: wsB.id, userId: outsider.id },
] });

const ids: Record<string, string> = {};
for (const [i, d] of data.docs.entries()) {
  const id = randomUUID(); ids[`${d.ws}:${d.title}`] = id;
  const paras = d.body.split(/(?<=[.!?])\s+(?=[A-Z])/).reduce((acc: string[], s: string, k: number) => { if (k % 5 === 0) acc.push(s); else acc[acc.length - 1] += " " + s; return acc; }, []);
  // A docs: half owned by the eval user directly, half reachable only via workspace share.
  const owner = d.ws === "B" ? outsider : i % 2 ? evalUser : teammate;
  await prisma.document.create({ data: {
    id, workspaceId: d.ws === "A" ? wsA.id : wsB.id, title: d.title, createdById: owner.id, searchText: d.body,
    content: { type: "doc", content: paras.map((p: string) => ({ type: "paragraph", content: [{ type: "text", text: p }] })) },
    acl: { create: [
      { principalType: "USER", principalId: owner.id, role: "OWNER" },
      ...(d.ws === "A" && owner.id === teammate.id ? [{ principalType: "WORKSPACE" as const, principalId: wsA.id, role: "VIEWER" as const }] : []),
    ] },
  } });
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const all = await prisma.document.findMany({ select: { id: true }, where: { embeddedHash: null } });
const lat: number[] = []; let chunks = 0, failed = 0;
const t0 = performance.now();
await pool(all, 16, async (d) => {
  const t = performance.now();
  try { const r = await embedDocument(d.id); chunks += r.chunks; lat.push(performance.now() - t); }
  catch (e) { failed++; if (failed < 3) console.error(e); }
  if (lat.length % 1000 === 0) process.stderr.write(`${lat.length} `);
});
const secs = (performance.now() - t0) / 1000;
console.log(JSON.stringify({ docsEmbedded: lat.length, failed, chunks, wallSecs: +secs.toFixed(1), docsPerSec: +(lat.length / secs).toFixed(1), chunksPerSec: +(chunks / secs).toFixed(1), perDocMs: summary(lat), concurrency: 16,
  evalCorpus: { docsA: data.docs.filter((d: any) => d.ws === "A").length, docsB: data.docs.filter((d: any) => d.ws === "B").length } }, null, 1));
await prisma.$disconnect();
