import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Minus,
  Table as TableIcon,
} from "lucide-react";
import SlashMenuList, {
  type SlashItem,
  type SlashMenuRef,
} from "./SlashMenuList";

const ALL_ITEMS: SlashItem[] = [
  {
    title: "Text",
    subtitle: "Plain paragraph",
    icon: Type,
    run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run(),
  },
  {
    title: "Heading 1",
    subtitle: "Big section heading",
    icon: Heading1,
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    subtitle: "Medium heading",
    icon: Heading2,
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    subtitle: "Small heading",
    icon: Heading3,
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet list",
    subtitle: "A simple bulleted list",
    icon: List,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    subtitle: "An ordered list",
    icon: ListOrdered,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    title: "To-do list",
    subtitle: "Track tasks with checkboxes",
    icon: ListChecks,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    title: "Quote",
    subtitle: "Capture a quotation",
    icon: Quote,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    subtitle: "Code with syntax",
    icon: Code2,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    subtitle: "Visually separate sections",
    icon: Minus,
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    title: "Table",
    subtitle: "Insert a 3×3 table",
    icon: TableIcon,
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
];

function position(
  el: HTMLElement,
  clientRect?: (() => DOMRect | null) | null
) {
  if (!clientRect) return;
  const rect = clientRect();
  if (!rect) return;
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.bottom + 6}px`;
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) =>
          ALL_ITEMS.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase())
          ),
        command: ({ editor, range, props }) =>
          props.run(editor as Editor, range as Range),
        render: () => {
          let renderer: ReactRenderer<SlashMenuRef>;

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenuList, {
                props,
                editor: props.editor,
              });
              const el = renderer.element as HTMLElement;
              el.style.position = "fixed";
              el.style.zIndex = "60";
              document.body.appendChild(el);
              position(el, props.clientRect);
            },
            onUpdate: (props) => {
              renderer.updateProps(props);
              position(renderer.element as HTMLElement, props.clientRect);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") return true;
              return renderer.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              (renderer.element as HTMLElement).remove();
              renderer.destroy();
            },
          };
        },
      }),
    ];
  },
});
