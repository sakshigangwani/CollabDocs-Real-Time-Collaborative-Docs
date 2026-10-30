-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "embeddedHash" TEXT;

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_ord_key" ON "DocumentChunk"("documentId", "ord");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approximate-nearest-neighbour index for cosine similarity (pgvector HNSW).
-- Prisma has no syntax for this, so it is written by hand.
CREATE INDEX "DocumentChunk_embedding_idx" ON "DocumentChunk"
  USING hnsw ("embedding" vector_cosine_ops);
