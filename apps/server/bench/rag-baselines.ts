import "./guard.js";
// Recomputes baselines with guaranteed-exact kNN (MATERIALIZED CTE cannot use the
// HNSW index), since default HNSW (ef_search=40) under-recalls on this corpus.
import { readFileSync } from "node:fs";
import { prisma } from "../src/db.js";
import { embed } from "../src/ai.js";
import { summary } from "./lib.js";
const data = JSON.parse(readFileSync(new URL("./rag-dataset.json", import.meta.url), "utf8"));
const docs = await prisma.$queryRaw<{ id: string; title: string; slug: string }[]>`SELECT d.id, d.title, w.slug FROM "Document" d JOIN "Workspace" w ON w.id=d."workspaceId" WHERE w.slug IN ('rag-a','rag-b')`;
const idOf = (slug: string, title: string) => docs.find((d) => d.slug === slug && d.title === title)!.id;
const bIds = new Set(docs.filter((d) => d.slug === "rag-b").map((d) => d.id));
const power = await prisma.user.findUniqueOrThrow({ where: { email: "rag-power@bench.local" } });
const pws = (await prisma.workspaceMember.findMany({ where: { userId: power.id } })).map((m) => `'${m.workspaceId}'`).join(",");
const aclP = `EXISTS (SELECT 1 FROM "DocumentAcl" a WHERE a."documentId"=c."documentId" AND ((a."principalType"='USER' AND a."principalId"='${power.id}') OR (a."principalType"='WORKSPACE' AND a."principalId" IN (${pws}))))`;
const exact = (v: string, where = "TRUE") => prisma.$queryRawUnsafe<{ documentId: string }[]>(
  `WITH x AS MATERIALIZED (SELECT c."documentId", c.embedding <=> '${v}'::vector dist FROM "DocumentChunk" c WHERE ${where}) SELECT "documentId" FROM x ORDER BY dist LIMIT 8`);
async function approx(v: string, where: string, settings: string[]) {
  return prisma.$transaction(async (tx) => { for (const s of settings) await tx.$executeRawUnsafe(s);
    return tx.$queryRawUnsafe<{ documentId: string }[]>(`SELECT c."documentId" FROM "DocumentChunk" c WHERE ${where} ORDER BY c.embedding <=> '${v}'::vector LIMIT 8`); });
}
const A = data.docs.filter((d: any) => d.ws === "A").flatMap((d: any) => d.qa.map((q: any) => ({ q: q.question, id: idOf("rag-a", d.title) })));
const R = data.docs.filter((d: any) => d.ws === "B").flatMap((d: any) => d.qa.map((q: any) => ({ q: q.question, id: idOf("rag-b", d.title) })));
const av = (await embed(A.map((x: any) => x.q))).map((v) => `[${v.join(",")}]`);
const rv = (await embed(R.map((x: any) => x.q))).map((v) => `[${v.join(",")}]`);

let rLeak = 0, aLeakB = 0;
for (const [i, x] of R.entries()) if ((await exact(rv[i])).some((r) => r.documentId === x.id)) rLeak++;
for (const [i] of A.entries()) if ((await exact(av[i])).some((r) => bIds.has(r.documentId))) aLeakB++;

const modes: Record<string, string[]> = { default_ef40: [], ef400: ["SET LOCAL hnsw.ef_search = 400"], ef400_iterative: ["SET LOCAL hnsw.ef_search = 400", "SET LOCAL hnsw.iterative_scan = relaxed_order"] };
const power_: Record<string, { hit: number; lat: number[] }> = {};
let exactHit = 0; const exactLat: number[] = [];
for (const [i, x] of A.entries()) { const t = performance.now(); const r = await exact(av[i], aclP); exactLat.push(performance.now() - t); if (r.some((y) => y.documentId === x.id)) exactHit++; }
for (const [m, s] of Object.entries(modes)) {
  power_[m] = { hit: 0, lat: [] };
  for (const [i, x] of A.entries()) { const t = performance.now(); const r = await approx(av[i], aclP, s); power_[m].lat.push(performance.now() - t); if (r.some((y) => y.documentId === x.id)) power_[m].hit++; }
}
console.log(JSON.stringify({
  unfilteredExactBaseline: {
    restrictedQuestions_restrictedGoldDocInTop8: `${rLeak}/${R.length}`,
    answerableQuestions_otherCompanyDocInTop8: `${aLeakB}/${A.length}`,
  },
  powerUser_docHitAt8: { exact: `${exactHit}/${A.length}`, exactLatencyMs: summary(exactLat), ...Object.fromEntries(Object.entries(power_).map(([k, v]) => [k, { hit: `${v.hit}/${A.length}`, latencyMs: summary(v.lat) }])) },
}, null, 1));
await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS bench_q`);
await prisma.$disconnect();
