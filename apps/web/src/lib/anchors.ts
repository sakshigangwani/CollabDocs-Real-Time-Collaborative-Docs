import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { getVersion } from "prosemirror-collab";
import type { OTProvider } from "./ot";

// Comment anchors are document positions at an OT version. The collab server
// maps stored anchors forward as it persists; the client maps the rest of the
// way using the confirmed steps it has seen.
export type Anchor = {
  anchorFrom: number;
  anchorTo: number;
  anchorVersion: number;
  quotedText: string;
};

type AnchoredThread = {
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorVersion: number | null;
  quotedText: string | null;
};

export function selectionToAnchor(editor: Editor, provider: OTProvider): Anchor | null {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const start = provider.toConfirmed(editor.state, from);
  const end = provider.toConfirmed(editor.state, to);
  if (start === null || end === null) return null;
  return {
    anchorFrom: start,
    anchorTo: end,
    anchorVersion: getVersion(editor.state),
    quotedText: editor.state.doc.textBetween(from, to, " ").slice(0, 280),
  };
}

export function anchorToRange(
  editor: Editor,
  provider: OTProvider,
  thread: AnchoredThread,
): { from: number; to: number } | null {
  const { anchorFrom, anchorTo, anchorVersion } = thread;
  if (anchorFrom !== null && anchorTo !== null && anchorVersion !== null) {
    const from = provider.fromVersion(editor.state, anchorFrom, anchorVersion, 1);
    const to = provider.fromVersion(editor.state, anchorTo, anchorVersion, -1);
    if (from !== null && to !== null) {
      return from < to && to <= editor.state.doc.content.size ? { from, to } : null;
    }
  }
  // Pre-OT comments, or anchors older than the steps we hold: find the quoted text.
  return thread.quotedText ? findText(editor.state.doc, thread.quotedText) : null;
}

function findText(doc: PMNode, needle: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, " ", " ");
    const index = text.indexOf(needle);
    if (index === -1) return false;
    // textBetween renders each leaf node as one character, so offsets line up.
    found = { from: pos + 1 + index, to: pos + 1 + index + needle.length };
    return false;
  });
  return found;
}
