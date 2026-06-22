import type { FastifyInstance } from "fastify";
import type { Document } from "@prisma/client";
import { prisma } from "../db.js";
import { getDocRole, roleAtLeast } from "../permissions.js";

function card(doc: Document, isFavorite: boolean) {
  return {
    id: doc.id,
    title: doc.title,
    icon: doc.icon,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    isFavorite,
  };
}

export async function discoveryRoutes(app: FastifyInstance) {
  app.put("/api/v1/documents/:id/favorite", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!roleAtLeast(await getDocRole(user.id, id), "VIEWER")) {
      return reply.code(404).send({ error: "Document not found." });
    }
    await prisma.favorite.upsert({
      where: { userId_documentId: { userId: user.id, documentId: id } },
      create: { userId: user.id, documentId: id },
      update: {},
    });
    return { favorite: true };
  });

  app.delete("/api/v1/documents/:id/favorite", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    await prisma.favorite.deleteMany({ where: { userId: user.id, documentId: id } });
    return { favorite: false };
  });

  app.get("/api/v1/documents/favorites", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const favs = await prisma.favorite.findMany({
      where: { userId: user.id, document: { deletedAt: null } },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });
    return { documents: favs.map((f) => card(f.document, true)) };
  });

  app.post("/api/v1/documents/:id/visit", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!roleAtLeast(await getDocRole(user.id, id), "VIEWER")) {
      return reply.code(404).send({ error: "Document not found." });
    }
    await prisma.recentDocument.upsert({
      where: { userId_documentId: { userId: user.id, documentId: id } },
      create: { userId: user.id, documentId: id },
      update: { viewedAt: new Date() },
    });
    return { ok: true };
  });

  app.get("/api/v1/documents/recents", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const recents = await prisma.recentDocument.findMany({
      where: { userId: user.id, document: { deletedAt: null } },
      include: { document: true },
      orderBy: { viewedAt: "desc" },
      take: 24,
    });
    const favIds = new Set(
      (await prisma.favorite.findMany({ where: { userId: user.id }, select: { documentId: true } })).map(
        (f) => f.documentId,
      ),
    );
    return { documents: recents.map((r) => card(r.document, favIds.has(r.documentId))) };
  });
}
