import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { mergeAttributes, type Extensions } from "@tiptap/core";
import { fileUrl } from "./api";

export const DocImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src as string | undefined;
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        ...(src ? { src: fileUrl(src) } : {}),
        loading: "lazy",
      }),
    ];
  },
}).configure({ allowBase64: false });

export const renderExtensions: Extensions = [
  StarterKit,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  DocImage,
];
