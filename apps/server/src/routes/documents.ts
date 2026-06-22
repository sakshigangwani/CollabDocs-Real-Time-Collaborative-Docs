import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { DocRole, Document, User } from "@prisma/client";
import { prisma } from "../db.js";
import { createDefaultWorkspace } from "../workspace.js";
import {
  aclPrincipalWhere,
  bestRole,
  getUserWorkspaceIds,
  roleAtLeast,
} from "../permissions.js";
import { colorForUser, mintCollabToken } from "../auth/collab-token.js";
import { reindex } from "../search.js";

function publicDoc(doc: Document, role?: DocRole | null, isFavorite?: boolean) {
  return {
    id: doc.id,
    title: doc.title,
    icon: doc.icon,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    role: role ?? undefined,
    isFavorite: isFavorite ?? undefined,
  };
}

function fullDoc(doc: Document, role: DocRole | null) {
  return { ...publicDoc(doc, role), content: doc.content };
}

async function getWorkspaceId(user: User) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });
  if (membership) return membership.workspaceId;
  const workspace = await createDefaultWorkspace(user.id, user.name);
  return workspace.id;
}

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.any().optional(),
});

export async function documentRoutes(app: FastifyInstance) {
  app.get("/api/v1/documents", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const workspaceIds = await getUserWorkspaceIds(user.id);
    const docs = await prisma.document.findMany({
      where: {
        deletedAt: null,
        acl: { some: aclPrincipalWhere(user.id, workspaceIds) },
      },
      include: { acl: { where: aclPrincipalWhere(user.id, workspaceIds), select: { role: true } } },
      orderBy: { updatedAt: "desc" },
    });
    const favIds = new Set(
      (await prisma.favorite.findMany({ where: { userId: user.id }, select: { documentId: true } })).map(
        (f) => f.documentId,
      ),
    );
    return {
      documents: docs.map((doc) =>
        publicDoc(doc, bestRole(doc.acl.map((a) => a.role)), favIds.has(doc.id)),
      ),
    };
  });

  app.get("/api/v1/documents/trash", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const docs = await prisma.document.findMany({
      where: {
        deletedAt: { not: null },
        acl: { some: { principalType: "USER", principalId: user.id, role: "OWNER" } },
      },
      orderBy: { deletedAt: "desc" },
    });
    return { documents: docs.map((doc) => publicDoc(doc, "OWNER")) };
  });

  app.get("/api/v1/documents/:id", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const workspaceIds = await getUserWorkspaceIds(user.id);
    const doc = await prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: { acl: { where: aclPrincipalWhere(user.id, workspaceIds), select: { role: true } } },
    });
    if (!doc) return reply.code(404).send({ error: "Document not found." });

    const role = bestRole(doc.acl.map((a) => a.role));
    if (!roleAtLeast(role, "VIEWER")) {
      return reply.code(404).send({ error: "Document not found." });
    }
    return { document: fullDoc(doc, role) };
  });

  app.get("/api/v1/documents/:id/collab-token", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const workspaceIds = await getUserWorkspaceIds(user.id);
    const doc = await prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: { acl: { where: aclPrincipalWhere(user.id, workspaceIds), select: { role: true } } },
    });
    if (!doc) return reply.code(404).send({ error: "Document not found." });

    const role = bestRole(doc.acl.map((a) => a.role));
    if (!roleAtLeast(role, "VIEWER")) {
      return reply.code(404).send({ error: "Document not found." });
    }

    const color = colorForUser(user.id);
    const token = await mintCollabToken({
      sub: user.id,
      name: user.name,
      color,
      docId: id,
      role,
    });
    return { token, color, user: { id: user.id, name: user.name } };
  });

  app.post("/api/v1/documents", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const workspaceId = await getWorkspaceId(user);
    const body = req.body as { title?: string } | undefined;
    const title = body?.title?.trim() || "Untitled";

    const doc = await prisma.document.create({
      data: {
        title,
        workspaceId,
        createdById: user.id,
        acl: {
          create: {
            principalType: "USER",
            principalId: user.id,
            role: "OWNER",
          },
        },
      },
    });
    return reply.code(201).send({ document: publicDoc(doc, "OWNER") });
  });

  app.patch("/api/v1/documents/:id", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success || (parsed.data.title === undefined && parsed.data.content === undefined)) {
      return reply.code(400).send({ error: "Nothing to update." });
    }

    const { id } = req.params as { id: string };
    const workspaceIds = await getUserWorkspaceIds(user.id);
    const existing = await prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: { acl: { where: aclPrincipalWhere(user.id, workspaceIds), select: { role: true } } },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    const role = bestRole(existing.acl.map((a) => a.role));
    if (!roleAtLeast(role, "VIEWER")) {
      return reply.code(404).send({ error: "Document not found." });
    }
    if (!roleAtLeast(role, "EDITOR")) {
      return reply.code(403).send({ error: "You don't have permission to edit this document." });
    }

    const data: Prisma.DocumentUpdateInput = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
    if (parsed.data.content !== undefined) {
      data.content = parsed.data.content as Prisma.InputJsonValue;
    }

    const doc = await prisma.document.update({ where: { id }, data });
    if (data.title !== undefined) await reindex(id);
    return { document: fullDoc(doc, role) };
  });

  app.delete("/api/v1/documents/:id", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const workspaceIds = await getUserWorkspaceIds(user.id);
    const existing = await prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: { acl: { where: aclPrincipalWhere(user.id, workspaceIds), select: { role: true } } },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    const role = bestRole(existing.acl.map((a) => a.role));
    if (!roleAtLeast(role, "OWNER")) {
      return reply.code(403).send({ error: "Only the owner can delete this document." });
    }

    await prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  });

  app.post("/api/v1/documents/:id/restore", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const existing = await prisma.document.findFirst({
      where: {
        id,
        deletedAt: { not: null },
        acl: { some: { principalType: "USER", principalId: user.id, role: "OWNER" } },
      },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    const doc = await prisma.document.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { document: publicDoc(doc, "OWNER") };
  });

  app.delete("/api/v1/documents/:id/permanent", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const existing = await prisma.document.findFirst({
      where: {
        id,
        deletedAt: { not: null },
        acl: { some: { principalType: "USER", principalId: user.id, role: "OWNER" } },
      },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    await prisma.document.delete({ where: { id } });
    return { ok: true };
  });
}
