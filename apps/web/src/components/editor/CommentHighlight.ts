import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type CommentRange = {
  id: string;
  from: number;
  to: number;
  resolved: boolean;
  active: boolean;
};

export const commentHighlightKey = new PluginKey<DecorationSet>("commentHighlight");

type Options = {
  onActivate: (id: string) => void;
};

function buildDecorations(doc: import("@tiptap/pm/model").Node, ranges: CommentRange[]) {
  const decorations = ranges
    .filter((r) => r.from < r.to && r.to <= doc.content.size)
    .map((r) =>
      Decoration.inline(
        r.from,
        r.to,
        {
          class:
            "comment-marker" +
            (r.resolved ? " resolved" : "") +
            (r.active ? " active" : ""),
          "data-comment-id": r.id,
        },
        { id: r.id },
      ),
    );
  return DecorationSet.create(doc, decorations);
}

export const CommentHighlight = Extension.create<Options>({
  name: "commentHighlight",

  addOptions() {
    return { onActivate: () => {} };
  },

  addProseMirrorPlugins() {
    const onActivate = this.options.onActivate;
    return [
      new Plugin<DecorationSet>({
        key: commentHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(commentHighlightKey) as
              | { ranges: CommentRange[] }
              | undefined;
            if (meta) return buildDecorations(newState.doc, meta.ranges);
            if (tr.docChanged) return value.map(tr.mapping, tr.doc);
            return value;
          },
        },
        props: {
          decorations(state) {
            return commentHighlightKey.getState(state);
          },
          handleClick(view, pos) {
            const set = commentHighlightKey.getState(view.state);
            const hit = set?.find(pos, pos) ?? [];
            const spec = hit[0]?.spec as { id?: string } | undefined;
            if (spec?.id) {
              onActivate(spec.id);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

export function applyCommentRanges(editor: Editor, ranges: CommentRange[]) {
  editor.view.dispatch(editor.state.tr.setMeta(commentHighlightKey, { ranges }));
}
