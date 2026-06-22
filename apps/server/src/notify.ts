import { prisma } from "./db.js";
import { sendEmail, instantEmailHTML } from "./email.js";

export type SubscriptionLevel = "all" | "mentions" | "none";

export type NotifyItem = {
  userId: string;
  type: string;
  documentId?: string | null;
  commentId?: string | null;
  actorId: string;
};

export async function subscriptionLevel(
  userId: string,
  documentId: string,
): Promise<SubscriptionLevel> {
  const sub = await prisma.documentSubscription.findUnique({
    where: { userId_documentId: { userId, documentId } },
    select: { level: true },
  });
  return (sub?.level as SubscriptionLevel) ?? "mentions";
}

export async function createNotifications(items: NotifyItem[]) {
  const filtered = items.filter((i) => i.userId !== i.actorId);
  if (filtered.length === 0) return;

  await prisma.notification.createMany({
    data: filtered.map((i) => ({
      userId: i.userId,
      type: i.type,
      documentId: i.documentId ?? null,
      commentId: i.commentId ?? null,
      actorId: i.actorId,
    })),
  });

  const userIds = [...new Set(filtered.map((i) => i.userId))];
  const actorIds = [...new Set(filtered.map((i) => i.actorId))];
  const docIds = [...new Set(filtered.map((i) => i.documentId).filter((x): x is string => Boolean(x)))];
  const commentIds = [...new Set(filtered.map((i) => i.commentId).filter((x): x is string => Boolean(x)))];

  const [users, prefs, actors, docs, comments] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
    prisma.notificationPreference.findMany({ where: { userId: { in: userIds } } }),
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
    prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, title: true } }),
    prisma.comment.findMany({ where: { id: { in: commentIds } }, select: { id: true, body: true } }),
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const prefById = new Map(prefs.map((p) => [p.userId, p]));
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  const docTitle = new Map(docs.map((d) => [d.id, d.title]));
  const commentBody = new Map(comments.map((c) => [c.id, c.body]));

  for (const i of filtered) {
    const pref = prefById.get(i.userId);
    if (pref && pref.emailInstant === false) continue;
    const to = emailById.get(i.userId);
    if (!to) continue;
    const title = i.documentId ? docTitle.get(i.documentId) ?? "a document" : "a document";
    await sendEmail({
      to,
      subject: `${actorName.get(i.actorId) ?? "Someone"} • ${title}`,
      html: instantEmailHTML({
        actorName: actorName.get(i.actorId) ?? "Someone",
        type: i.type,
        docTitle: title,
        docId: i.documentId ?? "",
        snippet: i.commentId ? commentBody.get(i.commentId) : null,
      }),
    });
  }
}
