import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, Search, LogOut } from "lucide-react";
import Sidebar from "../components/Sidebar";
import DocumentCard from "../components/DocumentCard";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../auth/AuthContext";
import { api, type DocumentDTO } from "../lib/api";

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  const firstName = (user?.name ?? "My").split(" ")[0];
  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    api.documents
      .list()
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleNew() {
    setCreating(true);
    try {
      const doc = await api.documents.create();
      setDocs((prev) => [doc, ...prev]);
    } finally {
      setCreating(false);
    }
  }

  function handleDelete(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    api.documents.remove(id).catch(() => {
      api.documents.list().then(setDocs);
    });
  }

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar onNew={handleNew} />

      <main className="flex-1">
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-semibold">CollabDocs</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border transition-colors hover:bg-surface-muted"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">All documents</h1>
              <p className="mt-1 text-sm text-muted">
                {loading
                  ? "Loading…"
                  : `${docs.length} document${docs.length === 1 ? "" : "s"} in ${firstName}'s Workspace`}
              </p>
            </div>
            <button
              onClick={handleNew}
              disabled={creating}
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg shadow-lg shadow-brand/25 transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              <Plus size={18} />
              {creating ? "Creating…" : "New document"}
            </button>
          </div>

          <div className="relative mt-6 max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          {loading ? (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-border bg-surface"
                >
                  <div className="h-28 animate-pulse bg-surface-muted" />
                  <div className="space-y-2 p-4">
                    <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-muted" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-surface-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <FileText size={26} />
              </div>
              <h2 className="mt-4 font-semibold">
                {query ? "No documents found" : "No documents yet"}
              </h2>
              <p className="mt-1 max-w-xs text-sm text-muted">
                {query
                  ? "Try a different search term."
                  : "Create your first document to get started."}
              </p>
              {!query && (
                <button
                  onClick={handleNew}
                  disabled={creating}
                  className="mt-5 flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover disabled:opacity-60"
                >
                  <Plus size={18} />
                  New document
                </button>
              )}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence>
                {filtered.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onOpen={() => {}}
                    onDelete={() => handleDelete(doc.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
