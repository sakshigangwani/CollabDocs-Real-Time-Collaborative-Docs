import { motion } from "framer-motion";
import { FileText, Trash2, Users } from "lucide-react";
import type { DocRole } from "../lib/api";

export type Doc = {
  id: string;
  title: string;
  updatedAt: string;
  role?: DocRole;
};

const ROLE_LABEL: Record<DocRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  COMMENTER: "Commenter",
  VIEWER: "Viewer",
};

const gradients = [
  "from-blue-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-fuchsia-500 to-pink-500",
  "from-amber-500 to-orange-500",
  "from-violet-500 to-purple-500",
  "from-rose-500 to-red-500",
];

function gradientFor(id: string) {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return gradients[sum % gradients.length];
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DocumentCard({
  doc,
  onOpen,
  onDelete,
}: {
  doc: Doc;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isShared = doc.role !== undefined && doc.role !== "OWNER";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      whileHover={{ y: -4 }}
      onClick={onOpen}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-lg hover:shadow-black/5"
    >
      <div
        className={`flex h-28 items-center justify-center bg-gradient-to-br ${gradientFor(doc.id)}`}
      >
        <FileText className="text-white/90" size={30} />
      </div>

      <div className="p-4">
        <h3 className="truncate font-medium">{doc.title}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          Edited {relativeTime(doc.updatedAt)}
          {isShared && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 font-medium">
              <Users size={11} />
              {ROLE_LABEL[doc.role!]}
            </span>
          )}
        </p>
      </div>

      {!isShared && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete document"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/25 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/45 group-hover:opacity-100"
        >
          <Trash2 size={15} />
        </button>
      )}
    </motion.div>
  );
}
