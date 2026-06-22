import cron from "node-cron";
import { prisma } from "./db.js";
import { sendEmail, digestEmailHTML } from "./email.js";

const WEEK = 7 * 86400000;

export async function sendUserDigest(userId: string, opts?: { force?: boolean }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return { empty: true };

  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  const since = opts?.force ? new Date(Date.now() - WEEK) : pref?.lastDigestAt ?? new Date(Date.now() - WEEK);

  const notifs = await prisma.notification.findMany({
    where: { userId, readAt: null, createdAt: { gt: since } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (notifs.length === 0) return { empty: true };

  const actorIds = [...new Set(notifs.map((n) => n.actorId))];
  const docIds = [...new Set(notifs.map((n) => n.documentId).filter((x): x is string => Boolean(x)))];
  const [actors, docs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
    prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, title: true } }),
  ]);
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  const docTitle = new Map(docs.map((d) => [d.id, d.title]));

  const items = notifs.map((n) => ({
    actorName: actorName.get(n.actorId) ?? "Someone",
    type: n.type,
    docTitle: n.documentId ? docTitle.get(n.documentId) ?? "a document" : "a document",
    docId: n.documentId ?? "",
  }));

  await sendEmail({
    to: user.email,
    subject: `Your CollabDocs digest — ${items.length} update${items.length === 1 ? "" : "s"}`,
    html: digestEmailHTML({ items }),
  });

  if (!opts?.force) {
    await prisma.notificationPreference
      .update({ where: { userId }, data: { lastDigestAt: new Date() } })
      .catch(() => {});
  }
  return { sent: items.length };
}

export async function sendDigests(freq: "daily" | "weekly") {
  const prefs = await prisma.notificationPreference.findMany({ where: { digest: freq } });
  for (const p of prefs) {
    await sendUserDigest(p.userId).catch(() => {});
  }
}

export function scheduleDigests() {
  cron.schedule("0 8 * * *", () => {
    sendDigests("daily").catch(() => {});
  });
  cron.schedule("0 8 * * 1", () => {
    sendDigests("weekly").catch(() => {});
  });
}
