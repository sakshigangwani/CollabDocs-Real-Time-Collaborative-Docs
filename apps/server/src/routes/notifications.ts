import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const actorIds = [...new Set(notifications.map((n) => n.actorId))];
    const docIds = [...new Set(notifications.map((n) => n.documentId).filter((x): x is string => Boolean(x)))];
    const commentIds = [...new Set(notifications.map((n) => n.commentId).filter((x): x is string => Boolean(x)))];

    const [actors, docs, comments] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true, avatarUrl: true } }),
      prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, title: true } }),
      prisma.comment.findMany({ where: { id: { in: commentIds } }, select: { id: true, body: true } }),
    ]);
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const docById = new Map(docs.map((d) => [d.id, d]));
    const commentById = new Map(comments.map((c) => [c.id, c]));

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        documentId: n.documentId,
        documentTitle: n.documentId ? docById.get(n.documentId)?.title ?? null : null,
        commentId: n.commentId,
        snippet: n.commentId ? commentById.get(n.commentId)?.body ?? null : null,
        read: n.readAt !== null,
        createdAt: n.createdAt,
        actor: actorById.get(n.actorId) ?? null,
      })),
      unreadCount: notifications.filter((n) => n.readAt === null).length,
    };
  });

  app.post("/api/v1/notifications/read", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const parsed = z.object({ ids: z.array(z.string().uuid()).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });

    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
}
