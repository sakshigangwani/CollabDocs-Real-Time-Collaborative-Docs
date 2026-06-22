import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

type Match = { from: number; to: number };

type SearchState = {
  term: string;
  replaceTerm: string;
  caseSensitive: boolean;
  regex: boolean;
  matches: Match[];
  current: number;
  deco: DecorationSet;
};

export const searchKey = new PluginKey<SearchState>("searchReplace");

const EMPTY: SearchState = {
  term: "",
  replaceTerm: "",
  caseSensitive: false,
  regex: false,
  matches: [],
  current: 0,
  deco: DecorationSet.empty,
};

function buildRegex(s: SearchState): RegExp | null {
  if (!s.term) return null;
  try {
    const flags = "g" + (s.caseSensitive ? "" : "i");
    const source = s.regex ? s.term : s.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

function findMatches(doc: PMNode, re: RegExp | null): Match[] {
  if (!re) return [];
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(node.text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      matches.push({ from: pos + m.index, to: pos + m.index + m[0].length });
    }
  });
  return matches;
}

function decorate(doc: PMNode, matches: Match[], current: number): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === current ? "search-match search-match-current" : "search-match",
      }),
    ),
  );
}

function recompute(doc: PMNode, base: SearchState, current: number): SearchState {
  const matches = findMatches(doc, buildRegex(base));
  const clamped = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : 0;
  return { ...base, matches, current: clamped, deco: decorate(doc, matches, clamped) };
}

export const SearchReplace = Extension.create({
  name: "searchReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => EMPTY,
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(searchKey) as
              | { search?: Partial<SearchState>; current?: number }
              | undefined;
            if (meta?.search) {
              return recompute(newState.doc, { ...value, ...meta.search }, 0);
            }
            if (meta && typeof meta.current === "number") {
              return { ...value, current: meta.current, deco: decorate(newState.doc, value.matches, meta.current) };
            }
            if (tr.docChanged && value.term) {
              return recompute(newState.doc, value, value.current);
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return searchKey.getState(state)?.deco;
          },
        },
      }),
    ];
  },
});

export function setSearch(editor: Editor, opts: Partial<SearchState>) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { search: opts }));
}

export function clearSearch(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { search: { term: "" } }));
}

export function getSearchInfo(editor: Editor) {
  const s = searchKey.getState(editor.state);
  return { count: s?.matches.length ?? 0, current: s?.matches.length ? s.current : -1 };
}

export function goToMatch(editor: Editor, dir: 1 | -1) {
  const s = searchKey.getState(editor.state);
  if (!s || s.matches.length === 0) return;
  const next = (s.current + dir + s.matches.length) % s.matches.length;
  const m = s.matches[next];
  const tr = editor.state.tr.setMeta(searchKey, { current: next });
  tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
  editor.view.dispatch(tr);
}

export function replaceCurrent(editor: Editor) {
  const s = searchKey.getState(editor.state);
  if (!s || s.matches.length === 0) return;
  const m = s.matches[Math.min(s.current, s.matches.length - 1)];
  editor.view.dispatch(editor.state.tr.insertText(s.replaceTerm, m.from, m.to));
}

export function replaceAll(editor: Editor) {
  const s = searchKey.getState(editor.state);
  if (!s || s.matches.length === 0) return;
  const tr = editor.state.tr;
  [...s.matches]
    .sort((a, b) => b.from - a.from)
    .forEach((m) => tr.insertText(s.replaceTerm, m.from, m.to));
  editor.view.dispatch(tr);
}
