import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Document, User } from "@prisma/client";
import { prisma } from "../db.js";
import { createDefaultWorkspace } from "../workspace.js";

function publicDoc(doc: Document) {
  return {
    id: doc.id,
    title: doc.title,
    icon: doc.icon,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
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

const titleSchema = z.object({ title: z.string().min(1).max(200) });

export async function documentRoutes(app: FastifyInstance) {
  app.get("/api/v1/documents", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const workspaceId = await getWorkspaceId(user);
    const docs = await prisma.document.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    return { documents: docs.map(publicDoc) };
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
    return reply.code(201).send({ document: publicDoc(doc) });
  });

  app.patch("/api/v1/documents/:id", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const parsed = titleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "A valid title is required." });
    }

    const { id } = req.params as { id: string };
    const workspaceId = await getWorkspaceId(user);
    const existing = await prisma.document.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    const doc = await prisma.document.update({
      where: { id },
      data: { title: parsed.data.title.trim() },
    });
    return { document: publicDoc(doc) };
  });

  app.delete("/api/v1/documents/:id", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const workspaceId = await getWorkspaceId(user);
    const existing = await prisma.document.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    await prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  });

  app.get("/api/v1/documents/trash", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const workspaceId = await getWorkspaceId(user);
    const docs = await prisma.document.findMany({
      where: { workspaceId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    });
    return { documents: docs.map(publicDoc) };
  });

  app.post("/api/v1/documents/:id/restore", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const workspaceId = await getWorkspaceId(user);
    const existing = await prisma.document.findFirst({
      where: { id, workspaceId, deletedAt: { not: null } },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    const doc = await prisma.document.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { document: publicDoc(doc) };
  });

  app.delete("/api/v1/documents/:id/permanent", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const { id } = req.params as { id: string };
    const workspaceId = await getWorkspaceId(user);
    const existing = await prisma.document.findFirst({
      where: { id, workspaceId, deletedAt: { not: null } },
    });
    if (!existing) return reply.code(404).send({ error: "Document not found." });

    await prisma.document.delete({ where: { id } });
    return { ok: true };
  });
}
