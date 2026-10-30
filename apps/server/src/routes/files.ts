import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Attachment, DocRole } from "@prisma/client";
import { prisma } from "../db.js";
import { getDocRole, roleAtLeast } from "../permissions.js";
import { writeAudit } from "../audit.js";
import {
  attachmentKey,
  deleteObject,
  getObject,
  isStorageConfigured,
  putObject,
  signedGetUrl,
  storageDriver,
} from "../storage.js";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

const linkSecret = process.env.ATTACHMENT_SECRET ?? process.env.COLLAB_JWT_SECRET ?? "dev-attachment-secret-change-me";

function signAttachment(id: string) {
  return createHmac("sha256", linkSecret).update(id).digest("base64url");
}

function validSignature(id: string, token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(signAttachment(id));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function serialize(a: Attachment) {
  return {
    id: a.id,
    documentId: a.documentId,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    createdAt: a.createdAt,
    url: `/api/v1/attachments/${a.id}?t=${signAttachment(a.id)}`,
  };
}

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

export async function fileRoutes(app: FastifyInstance) {
  app.get("/api/v1/storage", async () => {
    return { configured: isStorageConfigured, driver: storageDriver, maxBytes: MAX_BYTES };
  });

  app.post("/api/v1/documents/:id/attachments", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "EDITOR", reply))) return;

    const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });

    const ext = ALLOWED.get(file.mimetype);
    if (!ext) {
      return reply.code(415).send({ error: `Unsupported file type: ${file.mimetype}` });
    }

    const body = await file.toBuffer().catch(() => null);
    if (!body) {
      return reply.code(413).send({ error: "File is too large (10 MB max)." });
    }

    const attachmentId = randomUUID();
    const key = attachmentKey(id, attachmentId, ext);
    await putObject(key, body, file.mimetype);

    const attachment = await prisma.attachment.create({
      data: {
        id: attachmentId,
        documentId: id,
        uploaderId: user.id,
        key,
        filename: file.filename || `upload${ext}`,
        contentType: file.mimetype,
        size: body.byteLength,
      },
    });

    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "attachment.upload",
      targetType: "attachment",
      targetId: attachment.id,
      metadata: { filename: attachment.filename, size: attachment.size },
    });

    return reply.code(201).send({ attachment: serialize(attachment) });
  });

  app.get("/api/v1/documents/:id/attachments", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "VIEWER", reply))) return;

    const attachments = await prisma.attachment.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
    });
    return { attachments: attachments.map(serialize) };
  });

  app.get("/api/v1/attachments/:aid", async (req, reply) => {
    const { aid } = req.params as { aid: string };
    const { t, download } = req.query as { t?: string; download?: string };

    const attachment = await prisma.attachment.findUnique({ where: { id: aid } });
    if (!attachment) return reply.code(404).send({ error: "Attachment not found." });

    if (!validSignature(aid, t)) {
      const user = req.user;
      if (!user) return reply.code(401).send({ error: "Not signed in." });
      if (!roleAtLeast(await getDocRole(user.id, attachment.documentId), "VIEWER")) {
        return reply.code(404).send({ error: "Attachment not found." });
      }
    }

    const signed = await signedGetUrl(attachment.key, attachment.filename);
    if (signed) return reply.redirect(signed, 302);

    const body = await getObject(attachment.key).catch(() => null);
    if (!body) return reply.code(404).send({ error: "Attachment not found." });
    return reply
      .header("Content-Type", attachment.contentType)
      .header("Cache-Control", "private, max-age=3600")
      .header(
        "Content-Disposition",
        `${download ? "attachment" : "inline"}; filename="${attachment.filename.replace(/"/g, "")}"`,
      )
      .send(body);
  });

  app.delete("/api/v1/attachments/:aid", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { aid } = req.params as { aid: string };

    const attachment = await prisma.attachment.findUnique({ where: { id: aid } });
    if (!attachment) return reply.code(404).send({ error: "Attachment not found." });

    const role = await getDocRole(user.id, attachment.documentId);
    if (!roleAtLeast(role, "VIEWER")) {
      return reply.code(404).send({ error: "Attachment not found." });
    }
    const isUploader = attachment.uploaderId === user.id;
    if (!isUploader && !roleAtLeast(role, "OWNER")) {
      return reply.code(403).send({ error: "You don't have permission to do that." });
    }

    await deleteObject(attachment.key);
    await prisma.attachment.delete({ where: { id: aid } });
    await writeAudit({
      documentId: attachment.documentId,
      actorId: user.id,
      action: "attachment.delete",
      targetType: "attachment",
      targetId: aid,
      metadata: { filename: attachment.filename },
    });
    return { ok: true };
  });
}
