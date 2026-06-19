import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { DocRole } from "@prisma/client";
import { prisma } from "../db.js";
import { getDocRole, roleAtLeast } from "../permissions.js";
import { writeAudit } from "../audit.js";
import { parseMentions } from "../mentions.js";
import { colorForUser } from "../auth/collab-token.js";

const authorSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const;

type CommentWithRelations = {
  id: string;
  parentId: string | null;
  body: string;
  anchorStart: string | null;
  anchorEnd: string | null;
  quotedText: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; email: string; avatarUrl: string | null };
  reactions: { emoji: string; userId: string }[];
};

async function requireDoc(
  userId: string,
  documentId: string,
  min: DocRole,
  reply: FastifyReply,
): Promise<DocRole | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true },
  });
  if (!doc) {
    reply.code(404).send({ error: "Document not found." });
    return null;
  }
  const role = await getDocRole(userId, documentId);
  if (!roleAtLeast(role, "VIEWER")) {
    reply.code(404).send({ error: "Document not found." });
    return null;
  }
  if (!roleAtLeast(role, min)) {
    reply.code(403).send({ error: "You don't have permission to do that." });
    return null;
  }
  return role;
}

function serializeComment(c: CommentWithRelations, currentUserId: string) {
  const grouped = new Map<string, { emoji: string; count: number; reacted: boolean }>();
  for (const r of c.reactions) {
    const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, reacted: false };
    g.count += 1;
    if (r.userId === currentUserId) g.reacted = true;
    grouped.set(r.emoji, g);
  }
  return {
    id: c.id,
    parentId: c.parentId,
    body: c.body,
    anchorStart: c.anchorStart,
    anchorEnd: c.anchorEnd,
    quotedText: c.quotedText,
    resolved: c.resolvedAt !== null,
    resolvedAt: c.resolvedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    author: {
      id: c.author.id,
      name: c.author.name,
      email: c.author.email,
      avatarUrl: c.author.avatarUrl,
      color: colorForUser(c.author.id),
    },
    reactions: [...grouped.values()],
  };
}

export async function commentRoutes(app: FastifyInstance) {
  app.get("/api/v1/documents/:id/comments", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "VIEWER", reply))) return;

    const comments = await prisma.comment.findMany({
      where: { documentId: id, deletedAt: null },
      include: { author: { select: authorSelect }, reactions: { select: { emoji: true, userId: true } } },
      orderBy: { createdAt: "asc" },
    });

    const repliesByParent = new Map<string, CommentWithRelations[]>();
    const roots: CommentWithRelations[] = [];
    for (const c of comments) {
      if (c.parentId) {
        const list = repliesByParent.get(c.parentId) ?? [];
        list.push(c);
        repliesByParent.set(c.parentId, list);
      } else {
        roots.push(c);
      }
    }

    const threads = roots
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((root) => ({
        ...serializeComment(root, user.id),
        replies: (repliesByParent.get(root.id) ?? []).map((r) => serializeComment(r, user.id)),
      }));

    return { comments: threads };
  });

  app.post("/api/v1/documents/:id/comments", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "COMMENTER", reply))) return;

    const parsed = z
      .object({
        body: z.string().min(1).max(5000),
        parentId: z.string().uuid().optional(),
        anchorStart: z.string().max(2048).optional(),
        anchorEnd: z.string().max(2048).optional(),
        quotedText: z.string().max(300).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid comment." });
    const { body, parentId, anchorStart, anchorEnd, quotedText } = parsed.data;

    let rootAuthorId: string | null = null;
    if (parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: parentId, documentId: id, parentId: null, deletedAt: null },
        select: { authorId: true },
      });
      if (!parent) return reply.code(404).send({ error: "Comment thread not found." });
      rootAuthorId = parent.authorId;
    }

    const comment = await prisma.comment.create({
      data: {
        documentId: id,
        parentId: parentId ?? null,
        authorId: user.id,
        body,
        anchorStart: parentId ? null : anchorStart ?? null,
        anchorEnd: parentId ? null : anchorEnd ?? null,
        quotedText: parentId ? null : quotedText ?? null,
      },
      include: { author: { select: authorSelect }, reactions: { select: { emoji: true, userId: true } } },
    });

    const recipients = new Map<string, string>();
    for (const uid of parseMentions(body)) {
      if (uid === user.id) continue;
      if (roleAtLeast(await getDocRole(uid, id), "VIEWER")) recipients.set(uid, "mention");
    }
    if (rootAuthorId && rootAuthorId !== user.id && !recipients.has(rootAuthorId)) {
      recipients.set(rootAuthorId, "reply");
    }
    if (recipients.size > 0) {
      await prisma.notification.createMany({
        data: [...recipients].map(([uid, type]) => ({
          userId: uid,
          type,
          documentId: id,
          commentId: comment.id,
          actorId: user.id,
        })),
      });
    }

    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "comment.create",
      targetType: "comment",
      targetId: comment.id,
      metadata: { reply: Boolean(parentId) },
    });

    return reply.code(201).send({ comment: serializeComment(comment, user.id) });
  });

  app.patch("/api/v1/documents/:id/comments/:commentId", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id, commentId } = req.params as { id: string; commentId: string };
    const role = await requireDoc(user.id, id, "COMMENTER", reply);
    if (!role) return;

    const parsed = z
      .object({
        body: z.string().min(1).max(5000).optional(),
        resolved: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success || (parsed.data.body === undefined && parsed.data.resolved === undefined)) {
      return reply.code(400).send({ error: "Nothing to update." });
    }

    const existing = await prisma.comment.findFirst({
      where: { id: commentId, documentId: id, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!existing) return reply.code(404).send({ error: "Comment not found." });

    const data: { body?: string; resolvedAt?: Date | null; resolvedById?: string | null } = {};
    if (parsed.data.body !== undefined) {
      if (existing.authorId !== user.id) {
        return reply.code(403).send({ error: "You can only edit your own comments." });
      }
      data.body = parsed.data.body;
    }
    if (parsed.data.resolved !== undefined) {
      data.resolvedAt = parsed.data.resolved ? new Date() : null;
      data.resolvedById = parsed.data.resolved ? user.id : null;
    }

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data,
      include: { author: { select: authorSelect }, reactions: { select: { emoji: true, userId: true } } },
    });

    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: parsed.data.resolved !== undefined ? "comment.resolve" : "comment.edit",
      targetType: "comment",
      targetId: commentId,
      metadata: { resolved: parsed.data.resolved },
    });

    return { comment: serializeComment(comment, user.id) };
  });

  app.delete("/api/v1/documents/:id/comments/:commentId", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id, commentId } = req.params as { id: string; commentId: string };
    const role = await requireDoc(user.id, id, "COMMENTER", reply);
    if (!role) return;

    const existing = await prisma.comment.findFirst({
      where: { id: commentId, documentId: id, deletedAt: null },
      select: { authorId: true },
    });
    if (!existing) return reply.code(404).send({ error: "Comment not found." });
    if (existing.authorId !== user.id && role !== "OWNER") {
      return reply.code(403).send({ error: "You can only delete your own comments." });
    }

    await prisma.comment.updateMany({
      where: { documentId: id, OR: [{ id: commentId }, { parentId: commentId }] },
      data: { deletedAt: new Date() },
    });
    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "comment.delete",
      targetType: "comment",
      targetId: commentId,
    });
    return { ok: true };
  });

  app.post("/api/v1/documents/:id/comments/:commentId/reactions", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id, commentId } = req.params as { id: string; commentId: string };
    if (!(await requireDoc(user.id, id, "COMMENTER", reply))) return;

    const parsed = z.object({ emoji: z.string().min(1).max(16) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid reaction." });

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, documentId: id, deletedAt: null },
      select: { id: true },
    });
    if (!comment) return reply.code(404).send({ error: "Comment not found." });

    const existing = await prisma.commentReaction.findUnique({
      where: { commentId_userId_emoji: { commentId, userId: user.id, emoji: parsed.data.emoji } },
    });
    if (existing) {
      await prisma.commentReaction.delete({ where: { id: existing.id } });
      return { reacted: false };
    }
    await prisma.commentReaction.create({
      data: { commentId, userId: user.id, emoji: parsed.data.emoji },
    });
    return { reacted: true };
  });

  app.get("/api/v1/documents/:id/mentionable", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "VIEWER", reply))) return;

    const acls = await prisma.documentAcl.findMany({
      where: { documentId: id, principalType: "USER" },
      select: { principalId: true },
    });
    const ids = [...new Set(acls.map((a) => a.principalId).filter((x): x is string => Boolean(x)))];
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: authorSelect,
    });
    return {
      users: users.map((u) => ({ ...u, color: colorForUser(u.id) })),
    };
  });
}
