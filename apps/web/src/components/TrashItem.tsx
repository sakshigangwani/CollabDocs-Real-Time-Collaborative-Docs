import { motion } from "framer-motion";
import { FileText, RotateCcw, Trash2 } from "lucide-react";
import type { DocumentDTO } from "../lib/api";

function relativeTime(iso: string | null) {
  if (!iso) return "";
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

export default function TrashItem({
  doc,
  onRestore,
  onDestroy,
}: {
  doc: DocumentDTO;
  onRestore: () => void;
  onDestroy: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
        <FileText size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{doc.title}</p>
        <p className="text-xs text-muted">Deleted {relativeTime(doc.deletedAt)}</p>
      </div>

      <button
        onClick={onRestore}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
      >
        <RotateCcw size={15} />
        Restore
      </button>
      <button
        onClick={onDestroy}
        aria-label="Delete forever"
        title="Delete forever"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger/10"
      >
        <Trash2 size={16} />
      </button>
    </motion.div>
  );
}
