import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { embed } from "./ai.js";
import { getUserWorkspaceIds } from "./permissions.js";
import { textOf } from "./search.js";

export const TOP_K = 8;

const CHUNK_CHARS = 900;
const OVERLAP_CHARS = 150;
const MAX_CHUNKS = 200;

export type Span = {
  documentId: string;
  documentTitle: string;
  ord: number;
  text: string;
  similarity: number;
};

export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences = (clean.match(/[^.!?]+[.!?]*\s*/g) ?? [clean]).flatMap((s) =>
    s.length <= CHUNK_CHARS ? [s] : (s.match(new RegExp(`.{1,${CHUNK_CHARS}}`, "g")) ?? [s]),
  );
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > CHUNK_CHARS) {
      chunks.push(current.trim());
      current = current.slice(-OVERLAP_CHARS) + sentence;
    } else {
      current += sentence;
    }
    if (chunks.length >= MAX_CHUNKS) break;
  }
  if (current.trim() && chunks.length < MAX_CHUNKS) chunks.push(current.trim());

  return chunks;
}

function toVector(values: number[]) {
  return `[${values.join(",")}]`;
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function embedDocument(documentId: string, { force = false } = {}) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, content: true, searchText: true, embeddedHash: true },
  });
  if (!doc) return { chunks: 0, skipped: true };

  const body = doc.searchText?.trim() || textOf(doc.content);
  const source = `${doc.title}\n\n${body}`;
  const hash = hashText(source);
  if (!force && doc.embeddedHash === hash) return { chunks: 0, skipped: true };

  const chunks = chunkText(body);
  if (chunks.length === 0) {
    await prisma.documentChunk.deleteMany({ where: { documentId } });
    await prisma.document.update({ where: { id: documentId }, data: { embeddedHash: hash } });
    return { chunks: 0, skipped: false };
  }

  const vectors = await embed(chunks.map((c) => `${doc.title}\n\n${c}`));

  await prisma.documentChunk.deleteMany({ where: { documentId } });
  for (let i = 0; i < chunks.length; i++) {
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "DocumentChunk" (id, "documentId", ord, text, embedding)
        VALUES (gen_random_uuid(), ${documentId}, ${i}, ${chunks[i]}, ${toVector(vectors[i])}::vector)`,
    );
  }
  await prisma.document.update({ where: { id: documentId }, data: { embeddedHash: hash } });

  return { chunks: chunks.length, skipped: false };
}

export async function isStale(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { title: true, content: true, searchText: true, embeddedHash: true },
  });
  if (!doc) return false;
  const body = doc.searchText?.trim() || textOf(doc.content);
  return doc.embeddedHash !== hashText(`${doc.title}\n\n${body}`);
}

export async function retrieve(
  userId: string,
  query: string,
  { documentId, limit = TOP_K }: { documentId?: string; limit?: number } = {},
): Promise<Span[]> {
  const [vector] = await embed([query]);
  if (!vector) return [];

  const workspaceIds = await getUserWorkspaceIds(userId);
  const wsClause = workspaceIds.length
    ? Prisma.sql`OR (a."principalType" = 'WORKSPACE' AND a."principalId" IN (${Prisma.join(workspaceIds)}))`
    : Prisma.empty;
  const docClause = documentId ? Prisma.sql`AND d.id = ${documentId}` : Prisma.empty;

  return prisma.$queryRaw<Span[]>(Prisma.sql`
    SELECT d.id AS "documentId", d.title AS "documentTitle", c.ord, c.text,
      1 - (c.embedding <=> ${toVector(vector)}::vector) AS similarity
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE d."deletedAt" IS NULL
      AND c.embedding IS NOT NULL
      ${docClause}
      AND EXISTS (
        SELECT 1 FROM "DocumentAcl" a
        WHERE a."documentId" = d.id
          AND (a."expiresAt" IS NULL OR a."expiresAt" > now())
          AND ((a."principalType" = 'USER' AND a."principalId" = ${userId}) ${wsClause})
      )
    ORDER BY c.embedding <=> ${toVector(vector)}::vector
    LIMIT ${limit}
  `);
}
