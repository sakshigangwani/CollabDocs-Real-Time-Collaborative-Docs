import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

type JSONNode = { text?: string; content?: JSONNode[]; type?: string };

const BLOCK = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem"]);

export function textOf(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: JSONNode) => {
    if (node.text) parts.push(node.text);
    if (node.content) node.content.forEach(walk);
    if (node.type && BLOCK.has(node.type)) parts.push(" ");
  };
  if (doc && typeof doc === "object") walk(doc as JSONNode);
  return parts.join("").replace(/\s+/g, " ").trim().slice(0, 100000);
}

export async function reindex(documentId: string) {
  await prisma.$executeRaw(
    Prisma.sql`UPDATE "Document"
      SET "searchVector" = to_tsvector('english', coalesce(title, '') || ' ' || coalesce("searchText", ''))
      WHERE id = ${documentId}`,
  );
}
