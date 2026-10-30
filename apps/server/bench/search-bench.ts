// Runs the real /api/v1/search handler in-process (Fastify inject) against the
// seeded corpus. The global rate limiter is not registered here, only the route.
import "./guard.js";
import Fastify from "fastify";
import { prisma } from "../src/db.js";
import { searchRoutes } from "../src/routes/search.js";
import { summary } from "./lib.js";

const users = await prisma.$queryRaw<{ id: string; accessible: number }[]>`
  SELECT u.id, (SELECT count(DISTINCT a."documentId") FROM "DocumentAcl" a
    WHERE (a."principalType"='USER' AND a."principalId"=u.id)
       OR (a."principalType"='WORKSPACE' AND a."principalId" IN (SELECT "workspaceId" FROM "WorkspaceMember" m WHERE m."userId"=u.id)))::int accessible
  FROM "User" u WHERE u.email LIKE 'bench%' ORDER BY random() LIMIT 40`;
const lex = async (lo: number, hi: number, n: number) =>
  (await prisma.$queryRawUnsafe<{ word: string }[]>(
    `SELECT word FROM ts_stat('SELECT "searchVector" FROM "Document"') WHERE ndoc BETWEEN ${lo} AND ${hi} AND length(word) >= 5 ORDER BY md5(word) LIMIT ${n}`)).map((r) => r.word);
const common = await lex(1500, 100000, 40), medium = await lex(50, 500, 40), rare = await lex(2, 10, 40);
const classes: Record<string, string[]> = {
  common, medium, rare,
  twoWord: medium.map((w, i) => `${w} ${common[i % common.length]}`),
  typo: medium.map((w) => w.slice(0, 2) + w.slice(3)), // dropped character -> trigram fuzzy path
};

const app = Fastify();
app.decorateRequest("user", null);
let current: { id: string } | null = null;
app.addHook("onRequest", async (req) => { (req as any).user = current; });
await app.register(searchRoutes);
await app.ready();

async function run(q: string, userId: string) {
  current = { id: userId };
  const t = performance.now();
  const res = await app.inject({ method: "GET", url: `/api/v1/search?q=${encodeURIComponent(q)}` });
  const ms = performance.now() - t;
  if (res.statusCode !== 200) throw new Error(res.body);
  return { ms, hits: res.json().results.length };
}

// warm-up
for (let i = 0; i < 20; i++) await run(common[i], users[i].id);

const all: number[] = [];
const out: Record<string, unknown> = {};
for (const [name, qs] of Object.entries(classes)) {
  const lat: number[] = []; let hits = 0;
  for (let i = 0; i < qs.length; i++) for (let k = 0; k < 5; k++) {
    const r = await run(qs[i], users[(i * 5 + k) % users.length].id); lat.push(r.ms); hits += r.hits;
  }
  all.push(...lat);
  out[name] = { ...summary(lat), avgHits: +(hits / lat.length).toFixed(1) };
}
const acc = users.map((u) => u.accessible).sort((a, b) => a - b);
console.log(JSON.stringify({ docs: await prisma.document.count(), usersSampled: users.length, accessibleDocsPerUser: { min: acc[0], median: acc[acc.length >> 1], max: acc.at(-1) }, overall: summary(all), byClass: out, sampleQueries: { common: common[0], medium: medium[0], rare: rare[0], typo: classes.typo[0] } }, null, 2));
await app.close(); await prisma.$disconnect();
