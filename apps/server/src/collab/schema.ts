import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";

// Must produce the same node/mark types as the editor's extension list
// (apps/web/src/components/DocEditor.tsx, apps/web/src/lib/docSchema.ts).
// The server validates and applies every step against this schema.
export const schema = getSchema([
  StarterKit,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
]);

export const emptyDoc = () => schema.topNodeType.createAndFill()!;
