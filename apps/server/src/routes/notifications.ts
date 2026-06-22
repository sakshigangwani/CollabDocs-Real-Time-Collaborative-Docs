import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { getDocRole, roleAtLeast } from "../permissions.js";
import { sendUserDigest } from "../digest.js";

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

  app.get("/api/v1/notifications/preferences", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const pref = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    return { emailInstant: pref?.emailInstant ?? true, digest: pref?.digest ?? "off" };
  });

  app.put("/api/v1/notifications/preferences", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const parsed = z
      .object({
        emailInstant: z.boolean().optional(),
        digest: z.enum(["off", "daily", "weekly"]).optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid preferences." });
    const pref = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...parsed.data },
      update: parsed.data,
    });
    return { emailInstant: pref.emailInstant, digest: pref.digest };
  });

  app.post("/api/v1/notifications/digest/test", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const result = await sendUserDigest(user.id, { force: true });
    return { ok: true, ...result };
  });

  app.get("/api/v1/documents/:id/subscription", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!roleAtLeast(await getDocRole(user.id, id), "VIEWER")) {
      return reply.code(404).send({ error: "Document not found." });
    }
    const sub = await prisma.documentSubscription.findUnique({
      where: { userId_documentId: { userId: user.id, documentId: id } },
    });
    return { level: sub?.level ?? "mentions" };
  });

  app.put("/api/v1/documents/:id/subscription", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!roleAtLeast(await getDocRole(user.id, id), "VIEWER")) {
      return reply.code(404).send({ error: "Document not found." });
    }
    const parsed = z.object({ level: z.enum(["all", "mentions", "none"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid level." });
    const sub = await prisma.documentSubscription.upsert({
      where: { userId_documentId: { userId: user.id, documentId: id } },
      create: { userId: user.id, documentId: id, level: parsed.data.level },
      update: { level: parsed.data.level },
    });
    return { level: sub.level };
  });
}
