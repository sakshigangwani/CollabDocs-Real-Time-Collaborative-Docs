import cron from "node-cron";
import { prisma } from "./db.js";

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

export function scheduleMaintenance() {
  cron.schedule("0 3 * * *", () => {
    purgeAudit().catch(() => {});
  });
}
