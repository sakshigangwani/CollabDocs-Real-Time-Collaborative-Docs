import cron from "node-cron";
import { prisma } from "./db.js";
import { isAiConfigured } from "./ai.js";
import { embedDocument, isStale } from "./rag.js";

const EMBED_BATCH = 20;

export async function purgeAudit() {
  const workspaces = await prisma.workspace.findMany({
    where: { auditRetentionDays: { not: null } },
    select: { id: true, auditRetentionDays: true },
  });
  for (const ws of workspaces) {
    if (!ws.auditRetentionDays) continue;
    const cutoff = new Date(Date.now() - ws.auditRetentionDays * 86400000);
    const docIds = (
      await prisma.document.findMany({ where: { workspaceId: ws.id }, select: { id: true } })
    ).map((d) => d.id);
    await prisma.auditEvent
      .deleteMany({ where: { documentId: { in: docIds }, createdAt: { lt: cutoff } } })
      .catch(() => {});
  }
}

export async function embedStaleDocuments() {
  if (!isAiConfigured()) return 0;
  const candidates = await prisma.document.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
    take: 200,
  });

  let embedded = 0;
  for (const doc of candidates) {
    if (embedded >= EMBED_BATCH) break;
    if (!(await isStale(doc.id))) continue;
    const result = await embedDocument(doc.id).catch(() => null);
    if (result && !result.skipped) embedded++;
  }
  return embedded;
}

export function scheduleMaintenance() {
  cron.schedule("0 3 * * *", () => {
    purgeAudit().catch(() => {});
  });
  cron.schedule("*/10 * * * *", () => {
    embedStaleDocuments().catch(() => {});
  });
}
