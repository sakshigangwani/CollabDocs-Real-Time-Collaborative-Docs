import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { Node as PMNode } from "@tiptap/pm/model";
import { schema } from "./schema.js";

// Documents edited before the move to OT only have Yjs state (in S3 or the
// `ydoc` column). Tiptap's Collaboration extension stored the body in the
// "default" XML fragment; convert it once, the first time the document loads.
export function yjsStateToDoc(state: Uint8Array): PMNode | null {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, state);
    const fragment = ydoc.getXmlFragment("default");
    if (fragment.length === 0) return null;
    return yXmlFragmentToProseMirrorRootNode(fragment, schema);
  } catch (err) {
    console.error("[collab] could not convert legacy Yjs state", err);
    return null;
  } finally {
    ydoc.destroy();
  }
}
