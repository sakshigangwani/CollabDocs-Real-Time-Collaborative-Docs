// Seeds the benchmark DB with a synthetic corpus for search/ACL benchmarks.
// Words are sampled from /usr/share/dict/words with a Zipf distribution so term
// frequencies look like natural language. Deterministic (seeded PRNG).
import "./guard.js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db.js";
import { reindex } from "../src/search.js";

const N_DOCS = Number(process.env.N_DOCS ?? 10000);
const N_USERS = 200;
const N_WS = 20;

let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

const vocab = readFileSync("/usr/share/dict/words", "utf8")
  .split("\n").filter((w) => /^[a-z]{3,12}$/.test(w));
for (let i = vocab.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [vocab[i], vocab[j]] = [vocab[j], vocab[i]]; }
const V = vocab.slice(0, 30000);
// Zipf(s=1.07) sampler via precomputed CDF
const weights = V.map((_, i) => 1 / Math.pow(i + 1, 1.07));
const total = weights.reduce((a, b) => a + b, 0);
const cdf: number[] = []; let acc = 0;
for (const w of weights) cdf.push((acc += w / total));
function word() {
  const r = rand(); let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
  return V[lo];
}
function sentence() { const n = 6 + Math.floor(rand() * 14); const w = Array.from({ length: n }, word); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(" ") + "."; }
function paragraph() { return Array.from({ length: 3 + Math.floor(rand() * 5) }, sentence).join(" "); }

async function main() {
  const users = Array.from({ length: N_USERS }, (_, i) => ({ id: randomUUID(), email: `bench${i}@bench.local`, name: `Bench User ${i}` }));
  await prisma.user.createMany({ data: users });
  const workspaces = Array.from({ length: N_WS }, (_, i) => ({ id: randomUUID(), name: `WS ${i}`, slug: `bench-ws-${i}`, ownerId: users[i].id }));
  await prisma.workspace.createMany({ data: workspaces });
  // each user in 1-2 workspaces
  const members: Prisma.WorkspaceMemberCreateManyInput[] = [];
  users.forEach((u, i) => {
    members.push({ workspaceId: workspaces[i % N_WS].id, userId: u.id });
    if (rand() < 0.3) { const w = workspaces[(i + 7) % N_WS]; members.push({ workspaceId: w.id, userId: u.id }); }
  });
  await prisma.workspaceMember.createMany({ data: members, skipDuplicates: true });

  const BATCH = 500;
  for (let b = 0; b < N_DOCS; b += BATCH) {
    const docs: Prisma.DocumentCreateManyInput[] = [];
    const acls: Prisma.DocumentAclCreateManyInput[] = [];
    for (let i = b; i < Math.min(b + BATCH, N_DOCS); i++) {
      const owner = users[Math.floor(rand() * N_USERS)];
      const ws = workspaces[users.indexOf(owner) % N_WS];
      const paras = Array.from({ length: 2 + Math.floor(rand() * 5) }, paragraph);
      const title = Array.from({ length: 2 + Math.floor(rand() * 4) }, word).join(" ");
      const content = { type: "doc", content: paras.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })) };
      const id = randomUUID();
      docs.push({ id, workspaceId: ws.id, title, content, searchText: paras.join(" "), createdById: owner.id });
      acls.push({ documentId: id, principalType: "USER", principalId: owner.id, role: "OWNER" });
      if (rand() < 0.4) acls.push({ documentId: id, principalType: "WORKSPACE", principalId: ws.id, role: "VIEWER" });
      if (rand() < 0.2) acls.push({ documentId: id, principalType: "USER", principalId: pick(users).id, role: pick(["EDITOR", "COMMENTER", "VIEWER"] as const) });
    }
    await prisma.document.createMany({ data: docs });
    await prisma.documentAcl.createMany({ data: acls });
  }
  await prisma.$executeRaw(Prisma.sql`UPDATE "Document" SET "searchVector" = to_tsvector('english', coalesce(title,'') || ' ' || coalesce("searchText",''))`);
  await prisma.$executeRawUnsafe(`ANALYZE`);
  void reindex;
  const [{ docs, acls, avgwords }] = await prisma.$queryRaw<any[]>`SELECT (SELECT count(*) FROM "Document")::int docs, (SELECT count(*) FROM "DocumentAcl")::int acls, (SELECT avg(array_length(regexp_split_to_array("searchText", ' '),1))::int FROM "Document") avgwords`;
  console.log({ docs, acls, avgwords, users: N_USERS, workspaces: N_WS });
}
main().finally(() => prisma.$disconnect());
