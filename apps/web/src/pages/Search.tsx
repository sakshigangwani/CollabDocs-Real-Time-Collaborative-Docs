import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search as SearchIcon, Loader2, FileText, Star } from "lucide-react";
import { api, type SearchResult, type SearchParams } from "../lib/api";

function relative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Facets = Omit<SearchParams, "q">;

export default function Search() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [facets, setFacets] = useState<Facets>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const run = useCallback(
    (query: string, f: Facets) => {
      if (!query.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      api
        .search({ q: query.trim(), ...f })
        .then((r) => {
          setResults(r);
          setSearched(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setParams(q.trim() ? { q: q.trim() } : {}, { replace: true });
      run(q, facets);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, facets, run, setParams]);

  function toggleFacet<K extends keyof Facets>(key: K, value: Facets[K]) {
    setFacets((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));
  }

  const chip = (active: boolean) =>
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
    (active ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:bg-surface-muted");

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
        <button
          onClick={() => navigate("/home")}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-fg"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-canvas px-3">
          <SearchIcon size={16} className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents by title or content…"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/60"
          />
          {loading && <Loader2 size={15} className="animate-spin text-muted" />}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => toggleFacet("mine", true)} className={chip(!!facets.mine)}>
            Owned by me
          </button>
          <button onClick={() => toggleFacet("hasComments", true)} className={chip(!!facets.hasComments)}>
            Has comments
          </button>
          <button onClick={() => toggleFacet("favorites", true)} className={chip(!!facets.favorites)}>
            Favorites
          </button>
          <button onClick={() => toggleFacet("within", "7")} className={chip(facets.within === "7")}>
            Edited ≤ 7d
          </button>
          <button onClick={() => toggleFacet("within", "30")} className={chip(facets.within === "30")}>
            Edited ≤ 30d
          </button>
        </div>

        {!q.trim() ? (
          <p className="py-20 text-center text-sm text-muted">Type to search across your documents.</p>
        ) : searched && results.length === 0 && !loading ? (
          <p className="py-20 text-center text-sm text-muted">No results for “{q.trim()}”.</p>
        ) : (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => navigate(`/d/${r.id}`)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-brand/40"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <FileText size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{r.title}</span>
                      {r.isFavorite && <Star size={13} className="fill-warn text-warn" />}
                    </span>
                    {r.snippet && (
                      <span
                        className="search-snippet mt-0.5 block text-sm text-muted"
                        dangerouslySetInnerHTML={{ __html: r.snippet }}
                      />
                    )}
                    <span className="mt-0.5 block text-xs text-muted">Edited {relative(r.updatedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
