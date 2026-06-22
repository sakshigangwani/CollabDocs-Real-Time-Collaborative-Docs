import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { DocRole } from "@prisma/client";
import { prisma } from "../db.js";
import { getDocRole, roleAtLeast } from "../permissions.js";
import { writeAudit } from "../audit.js";
import { colorForUser } from "../auth/collab-token.js";
import { createNotifications } from "../notify.js";
import { textOf, reindex } from "../search.js";

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

function hashContent(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

type AuthorRow = { id: string; name: string } | null;

function serializeAuthor(author: AuthorRow) {
  if (!author) return null;
  return { id: author.id, name: author.name, color: colorForUser(author.id) };
}

export async function versionRoutes(app: FastifyInstance) {
  app.get("/api/v1/documents/:id/versions", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "VIEWER", reply))) return;

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        kind: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
    return {
      versions: versions.map((v) => ({
        id: v.id,
        label: v.label,
        kind: v.kind,
        createdAt: v.createdAt,
        author: serializeAuthor(v.author),
      })),
    };
  });

  app.get("/api/v1/documents/:id/versions/:vid", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id, vid } = req.params as { id: string; vid: string };
    if (!(await requireDoc(user.id, id, "VIEWER", reply))) return;

    const version = await prisma.documentVersion.findFirst({
      where: { id: vid, documentId: id },
      include: { author: { select: { id: true, name: true } } },
    });
    if (!version) return reply.code(404).send({ error: "Version not found." });
    return {
      version: {
        id: version.id,
        label: version.label,
        kind: version.kind,
        createdAt: version.createdAt,
        author: serializeAuthor(version.author),
        content: version.content,
      },
    };
  });

  app.post("/api/v1/documents/:id/versions", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "EDITOR", reply))) return;

    const parsed = z
      .object({
        content: z.any(),
        label: z.string().min(1).max(120).optional(),
        kind: z.enum(["auto", "named"]).default("auto"),
      })
      .safeParse(req.body);
    if (!parsed.success || parsed.data.content === undefined) {
      return reply.code(400).send({ error: "Invalid version payload." });
    }
    const { content, label, kind } = parsed.data;
    const contentHash = hashContent(content);

    if (kind === "auto") {
      const latest = await prisma.documentVersion.findFirst({
        where: { documentId: id },
        orderBy: { createdAt: "desc" },
        select: { contentHash: true },
      });
      if (latest && latest.contentHash === contentHash) {
        return { deduped: true };
      }
    }

    const version = await prisma.documentVersion.create({
      data: {
        documentId: id,
        authorId: user.id,
        label: kind === "named" ? label ?? null : null,
        kind,
        content,
        contentHash,
      },
      include: { author: { select: { id: true, name: true } } },
    });
    await prisma.document.update({ where: { id }, data: { searchText: textOf(content) } });
    await reindex(id);

    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "version.create",
      targetType: "version",
      targetId: version.id,
      metadata: { kind, label: version.label },
    });
    return reply.code(201).send({
      version: {
        id: version.id,
        label: version.label,
        kind: version.kind,
        createdAt: version.createdAt,
        author: serializeAuthor(version.author),
      },
    });
  });

  app.post("/api/v1/documents/:id/versions/:vid/restore", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id, vid } = req.params as { id: string; vid: string };
    if (!(await requireDoc(user.id, id, "EDITOR", reply))) return;

    const version = await prisma.documentVersion.findFirst({
      where: { id: vid, documentId: id },
      select: { id: true, content: true },
    });
    if (!version) return reply.code(404).send({ error: "Version not found." });

    const subscribers = await prisma.documentSubscription.findMany({
      where: { documentId: id, level: "all" },
      select: { userId: true },
    });
    await createNotifications(
      subscribers
        .filter((s) => s.userId !== user.id)
        .map((s) => ({ userId: s.userId, type: "version_restored", documentId: id, actorId: user.id })),
    );

    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "version.restore",
      targetType: "version",
      targetId: vid,
    });
    return { content: version.content };
  });
}
