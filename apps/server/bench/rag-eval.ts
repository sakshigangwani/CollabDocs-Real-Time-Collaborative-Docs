import "./guard.js";
// RAG evaluation on bench/rag-dataset.json.
//  1. Retrieval: production retrieve() (workspace scope) -> Hit@8 / MRR against the
//     gold evidence chunk, vs. exact kNN (HNSW disabled) and vs. unfiltered vector
//     search (no ACL) to measure what would leak.
//  2. End-to-end: the real POST /documents/:id/ai/ask handler (in-process) ->
//     citation accuracy, answer correctness (LLM judge), refusal rate, latency.
import { readFileSync, writeFileSync } from "node:fs";
import Fastify from "fastify";
import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db.js";
import { embed } from "../src/ai.js";
import { retrieve } from "../src/rag.js";
import { aiRoutes } from "../src/routes/ai.js";
import { summary } from "./lib.js";

const data = JSON.parse(readFileSync(new URL("./rag-dataset.json", import.meta.url), "utf8"));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const evalUser = await prisma.user.findUniqueOrThrow({ where: { email: "rag-eval@bench.local" } });
const wsA = await prisma.workspace.findUniqueOrThrow({ where: { slug: "rag-a" } });

// "Power user": can read workspace A plus every synthetic workspace (~40% of all chunks),
// which is where the planner switches to the HNSW index.
let power = await prisma.user.findUnique({ where: { email: "rag-power@bench.local" } });
if (!power) {
  power = await prisma.user.create({ data: { email: "rag-power@bench.local", name: "Power" } });
  const wss = await prisma.workspace.findMany({ where: { OR: [{ slug: { startsWith: "bench-ws-" } }, { slug: "rag-a" }] } });
  await prisma.workspaceMember.createMany({ data: wss.map((w) => ({ workspaceId: w.id, userId: power!.id })) });
  // the 20 workspace-A docs owned by the eval user are not workspace-shared; share them with power directly
  const own = await prisma.documentAcl.findMany({ where: { principalId: evalUser.id, role: "OWNER" } });
  await prisma.documentAcl.createMany({ data: own.map((a) => ({ documentId: a.documentId, principalType: "USER" as const, principalId: power!.id, role: "VIEWER" as const })) });
}

const docs = await prisma.document.findMany({ where: { workspaceId: { in: [wsA.id, (await prisma.workspace.findUniqueOrThrow({ where: { slug: "rag-b" } })).id] } }, select: { id: true, title: true, workspaceId: true } });
const docId = (ws: string, title: string) => docs.find((d) => d.title === title && (d.workspaceId === wsA.id) === (ws === "A"))!.id;
const chunks = await prisma.documentChunk.findMany({ where: { documentId: { in: docs.map((d) => d.id) } }, select: { documentId: true, ord: true, text: true } });
const goldOf = (ws: string, title: string, evidence: string) => {
  const id = docId(ws, title);
  const ords = chunks.filter((c) => c.documentId === id && norm(c.text).includes(evidence.slice(0, 200))).map((c) => c.ord);
  return { id, ords };
};
const answerable = data.docs.filter((d: any) => d.ws === "A").flatMap((d: any) => d.qa.map((q: any) => ({ ...q, ...goldOf("A", d.title, q.evidence) })));
const leak = data.docs.filter((d: any) => d.ws === "B").flatMap((d: any) => d.qa.map((q: any) => ({ ...q, ...goldOf("B", d.title, q.evidence) })));
const noGold = answerable.filter((q: any) => q.ords.length === 0).length;

const accessible = async (userId: string) => new Set((await prisma.$queryRaw<{ id: string }[]>`
  SELECT DISTINCT a."documentId" id FROM "DocumentAcl" a WHERE (a."principalType"='USER' AND a."principalId"=${userId})
  OR (a."principalType"='WORKSPACE' AND a."principalId" IN (SELECT "workspaceId" FROM "WorkspaceMember" WHERE "userId"=${userId}))`).map((r) => r.id));

type Row = { documentId: string; ord: number };
const vec = (v: number[]) => `[${v.join(",")}]`;
async function sqlRetrieve(userId: string | null, v: number[], exact: boolean): Promise<Row[]> {
  const ws = userId ? (await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true } })).map((m) => m.workspaceId) : [];
  const acl = userId ? Prisma.sql`AND EXISTS (SELECT 1 FROM "DocumentAcl" a WHERE a."documentId" = d.id AND (a."expiresAt" IS NULL OR a."expiresAt" > now())
      AND ((a."principalType" = 'USER' AND a."principalId" = ${userId}) OR (a."principalType" = 'WORKSPACE' AND a."principalId" IN (${Prisma.join(ws)}))))` : Prisma.empty;
  const q = Prisma.sql`SELECT d.id AS "documentId", c.ord FROM "DocumentChunk" c JOIN "Document" d ON d.id = c."documentId"
    WHERE d."deletedAt" IS NULL AND c.embedding IS NOT NULL ${acl} ORDER BY c.embedding <=> ${vec(v)}::vector LIMIT 8`;
  if (!exact) return prisma.$queryRaw<Row[]>(q);
  return prisma.$transaction(async (tx) => { await tx.$executeRawUnsafe("SET LOCAL enable_indexscan = off"); await tx.$executeRawUnsafe("SET LOCAL enable_bitmapscan = on"); return tx.$queryRaw<Row[]>(q); });
}

function score(rows: Row[], q: any) {
  const rank = rows.findIndex((r) => r.documentId === q.id && q.ords.includes(r.ord));
  return { hit: rank >= 0, rr: rank >= 0 ? 1 / (rank + 1) : 0, docHit: rows.some((r) => r.documentId === q.id) };
}
const agg = (xs: { hit: boolean; rr: number; docHit: boolean }[]) => ({
  n: xs.length, hitAt8: +(xs.filter((x) => x.hit).length / xs.length).toFixed(3), mrr: +(xs.reduce((a, x) => a + x.rr, 0) / xs.length).toFixed(3), docHitAt8: +(xs.filter((x) => x.docHit).length / xs.length).toFixed(3),
});

// ---- 1. retrieval ----
const qVecs = await embed(answerable.map((q: any) => q.question));
const leakVecs = await embed(leak.map((q: any) => q.question));
const evalAcc = await accessible(evalUser.id), powerAcc = await accessible(power.id);
const out: any = { dataset: { corpusDocs: await prisma.document.count(), corpusChunks: chunks.length, totalChunks: await prisma.documentChunk.count(), answerable: answerable.length, answerableWithoutLocatableGold: noGold, leakQuestions: leak.length, unanswerable: data.unanswerable.length, evalUserDocs: evalAcc.size, powerUserDocs: powerAcc.size } };

const prodLat: number[] = [], prodScores: any[] = [], sqlLat: Record<string, number[]> = { eval: [], power: [], unfiltered: [] };
for (const [i, q] of answerable.entries()) {
  const t = performance.now();
  const spans = await retrieve(evalUser.id, q.question, { limit: 8 }); // production path incl. query embedding
  prodLat.push(performance.now() - t);
  prodScores.push(score(spans, q));
  void i;
}
out.retrievalProduction = { ...agg(prodScores), latencyMsInclQueryEmbedding: summary(prodLat) };

const modes: Record<string, any[]> = { evalApprox: [], evalExact: [], powerApprox: [], powerExact: [], unfiltered: [] };
let annOverlapPower = 0, annOverlapEval = 0, powerShort = 0, unfilteredLeakQ = 0;
for (const [i, q] of answerable.entries()) {
  const v = qVecs[i];
  let t = performance.now(); const ea = await sqlRetrieve(evalUser.id, v, false); sqlLat.eval.push(performance.now() - t);
  const ee = await sqlRetrieve(evalUser.id, v, true);
  t = performance.now(); const pa = await sqlRetrieve(power.id, v, false); sqlLat.power.push(performance.now() - t);
  const pe = await sqlRetrieve(power.id, v, true);
  t = performance.now(); const un = await sqlRetrieve(null, v, false); sqlLat.unfiltered.push(performance.now() - t);
  modes.evalApprox.push(score(ea, q)); modes.evalExact.push(score(ee, q)); modes.powerApprox.push(score(pa, q)); modes.powerExact.push(score(pe, q)); modes.unfiltered.push(score(un, q));
  const key = (r: Row) => `${r.documentId}:${r.ord}`;
  annOverlapEval += ea.filter((r) => ee.map(key).includes(key(r))).length / Math.max(ee.length, 1);
  annOverlapPower += pa.filter((r) => pe.map(key).includes(key(r))).length / Math.max(pe.length, 1);
  if (pa.length < 8) powerShort++;
  if (un.some((r) => !evalAcc.has(r.documentId))) unfilteredLeakQ++;
}
let leakUnfiltered = 0, leakProd = 0;
for (const [i, q] of leak.entries()) {
  const un = await sqlRetrieve(null, leakVecs[i], false);
  if (un.some((r) => r.documentId === q.id)) leakUnfiltered++;
  const prod = await sqlRetrieve(evalUser.id, leakVecs[i], false);
  if (prod.some((r) => !evalAcc.has(r.documentId))) leakProd++;
}
out.retrievalComparison = Object.fromEntries(Object.entries(modes).map(([k, v]) => [k, agg(v)]));
out.annRecallVsExact = { evalUser: +(annOverlapEval / answerable.length).toFixed(3), powerUser: +(annOverlapPower / answerable.length).toFixed(3), powerQueriesReturningFewerThan8: powerShort };
out.sqlOnlyLatencyMs = Object.fromEntries(Object.entries(sqlLat).map(([k, v]) => [k, summary(v)]));
out.aclLeakage = {
  answerableQueries_unfilteredTop8ContainsInaccessibleDoc: `${unfilteredLeakQ}/${answerable.length}`,
  restrictedQuestions_unfilteredRetrievesRestrictedGoldDoc: `${leakUnfiltered}/${leak.length}`,
  restrictedQuestions_productionRetrievesAnyInaccessibleDoc: `${leakProd}/${leak.length}`,
};
console.error(JSON.stringify(out, null, 1));

// ---- 2. end-to-end /ask via the real route handler ----
const app = Fastify();
app.decorateRequest("user", null);
app.addHook("onRequest", async (req) => { (req as any).user = evalUser; });
await app.register(aiRoutes);
await app.ready();
const anchorDoc = docId("A", data.docs.find((d: any) => d.ws === "A").title);
const REFUSAL = "I couldn't find that in your documents.";
const e2eItems = [
  ...answerable.map((q: any) => ({ kind: "answerable", q })),
  ...leak.map((q: any) => ({ kind: "restricted", q })),
  ...data.unanswerable.map((question: string) => ({ kind: "unanswerable", q: { question } })),
];
const e2e: any[] = new Array(e2eItems.length);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < e2eItems.length) {
    const k = next++; const { kind, q } = e2eItems[k];
    const t = performance.now();
    const res = await app.inject({ method: "POST", url: `/api/v1/documents/${anchorDoc}/ai/ask`, payload: { question: q.question, scope: "workspace" } });
    const ms = performance.now() - t;
    const body = res.json();
    const rawCites = [...(body.answer ?? "").matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    e2e[k] = { kind, q, ms, status: res.statusCode, answer: body.answer, citations: body.citations ?? [], rawCites, retrieved: body.retrieved,
      refused: norm(body.answer ?? "").startsWith(REFUSAL.slice(0, 30)) };
  }
}));

// LLM judge for answerable questions (gpt-4o-mini, strict factual match).
const openai = new OpenAI();
async function judge(question: string, gold: string, answer: string) {
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content:
    `Question: ${question}\nReference answer: ${gold}\nCandidate answer: ${answer}\n\nDoes the candidate answer state the key fact of the reference answer correctly (ignore citation markers and extra correct detail)? A refusal or a wrong/contradicting fact is incorrect. Reply JSON {"correct": true|false}` }] });
  return JSON.parse(r.choices[0].message.content!).correct === true;
}
const ans = e2e.filter((x) => x.kind === "answerable");
let j = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (j < ans.length) { const x = ans[j++]; x.correct = x.refused ? false : await judge(x.q.question, x.q.answer, x.answer); } }));

const rate = (xs: any[], f: (x: any) => boolean) => `${xs.filter(f).length}/${xs.length} (${((100 * xs.filter(f).length) / xs.length).toFixed(1)}%)`;
const restricted = e2e.filter((x) => x.kind === "restricted"), unans = e2e.filter((x) => x.kind === "unanswerable");
const answeredWithCites = ans.filter((x) => !x.refused);
out.endToEnd = {
  concurrency: 4, model: "gpt-4o-mini", httpErrors: e2e.filter((x) => x.status !== 200).length,
  latencyMs: { all: summary(e2e.map((x) => x.ms)), answerable: summary(ans.map((x) => x.ms)) },
  answerable: {
    correctPerJudge: rate(ans, (x) => x.correct),
    refused: rate(ans, (x) => x.refused),
    answeredWithAtLeastOneCitation: rate(answeredWithCites, (x) => x.citations.length > 0),
    citationHitsGoldChunk: rate(answeredWithCites, (x) => x.citations.some((c: any) => c.documentId === x.q.id && x.q.ords.includes(c.ord))),
    citationHitsGoldDoc: rate(answeredWithCites, (x) => x.citations.some((c: any) => c.documentId === x.q.id)),
    outOfRangeCitationMarkersInRawAnswer: ans.reduce((a, x) => a + x.rawCites.filter((n: number) => n < 1 || n > (x.retrieved ?? 0)).length, 0),
  },
  restrictedDocQuestions: { refused: rate(restricted, (x) => x.refused), citedInaccessibleDoc: rate(restricted, (x) => x.citations.some((c: any) => !evalAcc.has(c.documentId))) },
  unanswerable: { refused: rate(unans, (x) => x.refused), citedAnything: rate(unans, (x) => x.citations.length > 0) },
};
writeFileSync(new URL("./rag-eval-results.json", import.meta.url), JSON.stringify({ summary: out, e2e: e2e.map((x) => ({ kind: x.kind, question: x.q.question, gold: x.q.answer, answer: x.answer, correct: x.correct, refused: x.refused, cites: x.citations.map((c: any) => `${c.documentTitle}#${c.ord}`) })) }, null, 1));
console.log(JSON.stringify(out.endToEnd, null, 1));
await app.close(); await prisma.$disconnect();
