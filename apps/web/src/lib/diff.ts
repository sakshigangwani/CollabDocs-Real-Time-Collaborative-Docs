import { diffWords as jsDiffWords } from "diff";

export type DiffSegment = { value: string; added: boolean; removed: boolean };

type JSONNode = {
  type?: string;
  text?: string;
  content?: JSONNode[];
};

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "taskItem",
  "tableRow",
]);

export function textOf(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: JSONNode) => {
    if (node.text) parts.push(node.text);
    if (node.content) node.content.forEach(walk);
    if (node.type && BLOCK_TYPES.has(node.type)) parts.push("\n");
  };
  if (doc && typeof doc === "object") walk(doc as JSONNode);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function diffWords(oldText: string, newText: string): DiffSegment[] {
  return jsDiffWords(oldText, newText).map((part) => ({
    value: part.value,
    added: Boolean(part.added),
    removed: Boolean(part.removed),
  }));
}
