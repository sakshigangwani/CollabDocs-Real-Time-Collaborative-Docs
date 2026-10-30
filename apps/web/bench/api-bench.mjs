// HTTP benchmark against running server instances (full middleware: helmet, CORS,
// session lookup, CSRF, Redis-backed rate limiter). Global limit is 300 req/min/IP,
// so requests go in batches of 250 with the bench-only Redis DB flushed in between.
// Also verifies authorization outcomes and that the rate limit is shared across instances.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const A = "http://127.0.0.1:4100", B = "http://127.0.0.1:4200";
const sql = (q) => execSync(`psql -d collabdocs_bench -Atc ${JSON.stringify(q)}`).toString().trim();
const flush = () => execSync("redis-cli -n 5 flushdb");
function session(email) {
  const uid = sql(`select id from "User" where email='${email}'`);
  const tok = randomBytes(32).toString("base64url");
  sql(`insert into "Session"(id,"userId","expiresAt") values ('${tok}','${uid}', now() + interval '1 day')`);
  return { uid, cookie: `session=${tok}; csrf=benchcsrf`, csrf: "benchcsrf" };
}
const evalS = session("rag-eval@bench.local"), mate = session("rag-teammate@bench.local"), searcher = session("bench5@bench.local");
const ownDoc = sql(`select "documentId" from "DocumentAcl" where "principalId"='${evalS.uid}' and role='OWNER' limit 1`);
const wsSharedDoc = sql(`select d.id from "Document" d join "DocumentAcl" a on a."documentId"=d.id where a."principalId"='${mate.uid}' and a.role='OWNER' and d."workspaceId"=(select id from "Workspace" where slug='rag-a') limit 1`);
const otherCoDoc = sql(`select d.id from "Document" d join "Workspace" w on w.id=d."workspaceId" where w.slug='rag-b' limit 1`);
const words = sql(`SELECT string_agg(word, ' ') FROM (SELECT word FROM ts_stat('SELECT "searchVector" FROM "Document"') WHERE ndoc BETWEEN 50 AND 500 AND length(word)>=5 ORDER BY md5(word) LIMIT 50) t`).split(" ");

async function req(base, s, method, path, body, { csrf = true } = {}) {
  const headers = { cookie: s?.cookie ?? "" };
  if (body) headers["content-type"] = "application/json";
  if (csrf && s && method !== "GET") headers["x-csrf-token"] = s.csrf;
  const t = performance.now();
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  await r.arrayBuffer();
  return { status: r.status, ms: performance.now() - t };
}
const pct = (a, p) => a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
const sum = (xs) => { const a = [...xs].sort((x, y) => x - y); const r = (n) => Math.round(n * 100) / 100; return { n: a.length, p50: r(pct(a, 50)), p95: r(pct(a, 95)), p99: r(pct(a, 99)) }; };

async function bench(name, total, conc, make) {
  const lat = [], statuses = {};
  for (let done = 0; done < total; ) {
    flush();
    const batch = Math.min(250, total - done); let i = 0;
    await Promise.all(Array.from({ length: conc }, async () => {
      while (i < batch) { const k = done + i++; const r = await make(k); lat.push(r.ms); statuses[r.status] = (statuses[r.status] ?? 0) + 1; }
    }));
    done += batch;
  }
  return { name, concurrency: conc, statuses, latencyMs: sum(lat) };
}
for (let i = 0; i < 30; i++) await req(A, evalS, "GET", `/api/v1/documents/${ownDoc}`); // warm-up

const results = [
  await bench("GET /documents/:id (session + ACL check)", 1000, 10, (k) => req(k % 2 ? A : B, evalS, "GET", `/api/v1/documents/${ownDoc}`)),
  await bench("PATCH /documents/:id title (CSRF + EDITOR check + tsvector reindex)", 1000, 10, (k) => req(k % 2 ? A : B, evalS, "PATCH", `/api/v1/documents/${ownDoc}`, { title: `Bench title ${k}` })),
  await bench("GET /search on 10K docs (ACL-filtered FTS + trigram)", 1000, 10, (k) => req(k % 2 ? A : B, searcher, "GET", `/api/v1/search?q=${words[k % words.length]}`)),
];

// Authorization / security matrix (expected status for each case).
flush();
const checks = [
  ["no session -> 401", 401, await req(A, null, "GET", `/api/v1/documents/${ownDoc}`)],
  ["read doc shared via workspace ACL -> 200", 200, await req(A, evalS, "GET", `/api/v1/documents/${wsSharedDoc}`)],
  ["read other company's doc -> 404 (no existence leak)", 404, await req(A, evalS, "GET", `/api/v1/documents/${otherCoDoc}`)],
  ["VIEWER edits workspace-shared doc -> 403", 403, await req(A, evalS, "PATCH", `/api/v1/documents/${wsSharedDoc}`, { title: "x" })],
  ["mutation without CSRF header -> 403", 403, await req(A, evalS, "PATCH", `/api/v1/documents/${ownDoc}`, { title: "x" }, { csrf: false })],
].map(([name, want, r]) => ({ name, want, got: r.status, pass: r.status === want }));

// Distributed rate limit: 150 requests to A, then keep going on B until the first 429.
flush();
let n = 0, first429 = null;
for (; n < 150; n++) await req(A, evalS, "GET", `/api/v1/documents/${ownDoc}`);
while (n < 400 && first429 === null) { const r = await req(B, evalS, "GET", `/api/v1/documents/${ownDoc}`); n++; if (r.status === 429) first429 = n; }
flush();
console.log(JSON.stringify({ results, securityChecks: checks, distributedRateLimit: { limitPerMin: 300, split: "150 on instance A, rest on instance B", first429AtRequest: first429 } }, null, 1));
