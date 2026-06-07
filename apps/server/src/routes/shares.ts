import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { DocRole } from "@prisma/client";
import { prisma } from "../db.js";
import { getDocRole, roleAtLeast } from "../permissions.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { writeAudit } from "../audit.js";

const grantableRole = z.enum(["EDITOR", "COMMENTER", "VIEWER"]);

async function requireOwner(userId: string, documentId: string, reply: FastifyReply) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true, title: true, workspaceId: true },
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
  if (!roleAtLeast(role, "OWNER")) {
    reply.code(403).send({ error: "Only the owner can manage sharing." });
    return null;
  }
  return doc;
}

async function setUserAcl(documentId: string, userId: string, role: DocRole) {
  const existing = await prisma.documentAcl.findFirst({
    where: { documentId, principalType: "USER", principalId: userId },
  });
  if (existing) {
    return prisma.documentAcl.update({ where: { id: existing.id }, data: { role } });
  }
  return prisma.documentAcl.create({
    data: { documentId, principalType: "USER", principalId: userId, role },
  });
}

function publicLink(link: {
  token: string;
  role: DocRole;
  scope: string;
  passwordHash: string | null;
  expiresAt: Date | null;
}) {
  return {
    token: link.token,
    role: link.role,
    scope: link.scope,
    hasPassword: link.passwordHash !== null,
    expiresAt: link.expiresAt,
  };
}

export async function shareRoutes(app: FastifyInstance) {
  app.get("/api/v1/documents/:id/shares", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    const doc = await requireOwner(user.id, id, reply);
    if (!doc) return;

    const acls = await prisma.documentAcl.findMany({
      where: { documentId: id, principalType: "USER" },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: acls.map((a) => a.principalId!).filter(Boolean) } },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const collaborators = acls
      .map((a) => {
        const u = a.principalId ? byId.get(a.principalId) : undefined;
        if (!u) return null;
        return { ...u, role: a.role, isYou: u.id === user.id };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.role === "OWNER" ? -1 : b!.role === "OWNER" ? 1 : 0));

    const link = await prisma.shareLink.findFirst({ where: { documentId: id } });
    return { collaborators, link: link ? publicLink(link) : null };
  });

  app.post("/api/v1/documents/:id/shares", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    const doc = await requireOwner(user.id, id, reply);
    if (!doc) return;

    const parsed = z
      .object({ email: z.string().email(), role: grantableRole })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid email or role." });

    const target = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    if (!target) {
      return reply.code(404).send({ error: "No CollabDocs user with that email." });
    }
    if (target.id === user.id) {
      return reply.code(400).send({ error: "You already own this document." });
    }

    await setUserAcl(id, target.id, parsed.data.role);
    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "share.invite",
      targetType: "user",
      targetId: target.id,
      metadata: { email: target.email, role: parsed.data.role },
    });
    return reply.code(201).send({ collaborator: { ...target, role: parsed.data.role, isYou: false } });
  });

  app.patch("/api/v1/documents/:id/shares/:userId", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id, userId } = req.params as { id: string; userId: string };
    const doc = await requireOwner(user.id, id, reply);
    if (!doc) return;

    const parsed = z.object({ role: grantableRole }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid role." });
    if (userId === user.id) {
      return reply.code(400).send({ error: "You can't change your own owner role." });
    }

    const existing = await prisma.documentAcl.findFirst({
      where: { documentId: id, principalType: "USER", principalId: userId, role: { not: "OWNER" } },
    });
    if (!existing) return reply.code(404).send({ error: "Collaborator not found." });

    await prisma.documentAcl.update({ where: { id: existing.id }, data: { role: parsed.data.role } });
    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "share.role_change",
      targetType: "user",
      targetId: userId,
      metadata: { role: parsed.data.role },
    });
    return { ok: true };
  });

  app.delete("/api/v1/documents/:id/shares/:userId", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id, userId } = req.params as { id: string; userId: string };
    const doc = await requireOwner(user.id, id, reply);
    if (!doc) return;
    if (userId === user.id) {
      return reply.code(400).send({ error: "You can't remove yourself as owner." });
    }

    await prisma.documentAcl.deleteMany({
      where: { documentId: id, principalType: "USER", principalId: userId, role: { not: "OWNER" } },
    });
    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "share.remove",
      targetType: "user",
      targetId: userId,
    });
    return { ok: true };
  });

  app.put("/api/v1/documents/:id/share-link", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    const doc = await requireOwner(user.id, id, reply);
    if (!doc) return;

    const parsed = z
      .object({
        role: grantableRole.default("VIEWER"),
        scope: z.enum(["ANYONE", "WORKSPACE"]).default("ANYONE"),
        expiresInDays: z.number().int().positive().max(365).nullable().optional(),
        password: z.string().min(1).max(128).nullable().optional(),
        regenerate: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid link settings." });
    const { role, scope, expiresInDays, password, regenerate } = parsed.data;

    const expiresAt =
      expiresInDays != null ? new Date(Date.now() + expiresInDays * 86400000) : null;
    const passwordHash =
      password === undefined ? undefined : password === null ? null : await hashPassword(password);

    const existing = await prisma.shareLink.findFirst({ where: { documentId: id } });
    let link;
    if (existing && !regenerate) {
      link = await prisma.shareLink.update({
        where: { id: existing.id },
        data: {
          role,
          scope,
          expiresAt,
          ...(passwordHash !== undefined ? { passwordHash } : {}),
        },
      });
    } else {
      if (existing) await prisma.shareLink.delete({ where: { id: existing.id } });
      link = await prisma.shareLink.create({
        data: {
          documentId: id,
          token: randomBytes(18).toString("base64url"),
          role,
          scope,
          expiresAt,
          passwordHash: passwordHash ?? null,
          createdById: user.id,
        },
      });
    }
    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: regenerate || !existing ? "link.create" : "link.update",
      targetType: "link",
      metadata: { role, scope, hasPassword: link.passwordHash !== null },
    });
    return { link: publicLink(link) };
  });

  app.delete("/api/v1/documents/:id/share-link", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    const doc = await requireOwner(user.id, id, reply);
    if (!doc) return;

    await prisma.shareLink.deleteMany({ where: { documentId: id } });
    await writeAudit({ documentId: id, actorId: user.id, action: "link.revoke", targetType: "link" });
    return { ok: true };
  });

  app.get("/api/v1/documents/:id/audit", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    const doc = await requireOwner(user.id, id, reply);
    if (!doc) return;

    const events = await prisma.auditEvent.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const actors = await prisma.user.findMany({
      where: { id: { in: [...new Set(events.map((e) => e.actorId))] } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata,
        createdAt: e.createdAt,
        actor: byId.get(e.actorId) ?? null,
      })),
    };
  });

  app.get("/api/v1/shared/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const link = await prisma.shareLink.findUnique({ where: { token } });
    if (!link) return reply.code(404).send({ error: "This link is invalid or has been revoked." });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.code(410).send({ error: "This link has expired." });
    }
    const doc = await prisma.document.findFirst({
      where: { id: link.documentId, deletedAt: null },
      select: { id: true, title: true, icon: true },
    });
    if (!doc) return reply.code(404).send({ error: "This document no longer exists." });
    return {
      document: doc,
      role: link.role,
      scope: link.scope,
      requiresPassword: link.passwordHash !== null,
      signedIn: req.user !== null,
    };
  });

  app.post("/api/v1/shared/:token/claim", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Sign in to open this shared document." });
    const { token } = req.params as { token: string };
    const link = await prisma.shareLink.findUnique({ where: { token } });
    if (!link) return reply.code(404).send({ error: "This link is invalid or has been revoked." });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.code(410).send({ error: "This link has expired." });
    }

    if (link.passwordHash) {
      const parsed = z.object({ password: z.string() }).safeParse(req.body ?? {});
      const ok = parsed.success && (await verifyPassword(link.passwordHash, parsed.data.password));
      if (!ok) return reply.code(403).send({ error: "Incorrect password." });
    }

    const doc = await prisma.document.findFirst({
      where: { id: link.documentId, deletedAt: null },
      select: { id: true, workspaceId: true },
    });
    if (!doc) return reply.code(404).send({ error: "This document no longer exists." });

    if (link.scope === "WORKSPACE") {
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: doc.workspaceId, userId: user.id } },
      });
      if (!member) {
        return reply.code(403).send({ error: "This link is restricted to workspace members." });
      }
    }

    const current = await getDocRole(user.id, doc.id);
    if (!roleAtLeast(current, link.role)) {
      await setUserAcl(doc.id, user.id, link.role);
      await writeAudit({
        documentId: doc.id,
        actorId: user.id,
        action: "link.claim",
        targetType: "link",
        metadata: { role: link.role },
      });
    }
    return { documentId: doc.id };
  });
}
