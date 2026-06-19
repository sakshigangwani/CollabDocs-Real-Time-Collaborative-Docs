import * as Y from "yjs";
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
} from "y-prosemirror";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

type Mapping = Map<Y.AbstractType<unknown>, PMNode | PMNode[]>;

type Binding = {
  type: Y.XmlFragment;
  doc: Y.Doc;
  mapping: Mapping;
};

export type Anchor = {
  anchorStart: string;
  anchorEnd: string;
  quotedText: string;
};

function getBinding(editor: Editor): Binding | null {
  const state = editor.state;
  for (const plugin of state.plugins) {
    const key = (plugin as unknown as { key?: string }).key;
    if (!key || !key.startsWith("y-sync")) continue;
    const pstate = (
      plugin as unknown as { getState?: (s: typeof state) => { binding?: Binding } }
    ).getState?.(state);
    if (pstate?.binding) return pstate.binding;
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function selectionToAnchor(editor: Editor): Anchor | null {
  const binding = getBinding(editor);
  if (!binding) return null;
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const start = absolutePositionToRelativePosition(from, binding.type, binding.mapping);
  const end = absolutePositionToRelativePosition(to, binding.type, binding.mapping);
  return {
    anchorStart: toBase64(Y.encodeRelativePosition(start)),
    anchorEnd: toBase64(Y.encodeRelativePosition(end)),
    quotedText: editor.state.doc.textBetween(from, to, " ").slice(0, 280),
  };
}

export function anchorToRange(
  editor: Editor,
  anchorStart: string | null,
  anchorEnd: string | null,
): { from: number; to: number } | null {
  const binding = getBinding(editor);
  if (!binding || !anchorStart || !anchorEnd) return null;
  const start = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    Y.decodeRelativePosition(fromBase64(anchorStart)),
    binding.mapping,
  );
  const end = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    Y.decodeRelativePosition(fromBase64(anchorEnd)),
    binding.mapping,
  );
  if (start == null || end == null) return null;
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  if (from >= to) return null;
  return { from, to };
}
