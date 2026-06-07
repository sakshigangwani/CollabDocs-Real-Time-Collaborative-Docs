import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, Lock, FileText } from "lucide-react";
import { api, type SharedLinkInfo } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

export default function SharedLink() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [info, setInfo] = useState<SharedLinkInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.shared
      .get(token)
      .then((d) => {
        setInfo(d);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e.message);
        setStatus("error");
      });
  }, [token]);

  async function claim(e?: React.FormEvent) {
    e?.preventDefault();
    if (!token) return;
    setClaiming(true);
    setError(null);
    try {
      const docId = await api.shared.claim(
        token,
        info?.requiresPassword ? password : undefined
      );
      navigate(`/d/${docId}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setClaiming(false);
    }
  }

  useEffect(() => {
    if (status === "ready" && info && user && !info.requiresPassword) {
      claim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, info, user]);

  if (status === "loading" || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (status === "error" || !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-xl font-semibold">Can't open this link</h1>
        <p className="text-sm text-muted">{error ?? "This link is no longer valid."}</p>
        <button
          onClick={() => navigate("/home")}
          className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover"
        >
          Go to your documents
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white">
          <FileText size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{info.document.title || "Untitled"}</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to open this shared document.
          </p>
        </div>
        <button
          onClick={() =>
            navigate(`/login?next=${encodeURIComponent(location.pathname)}`)
          }
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover"
        >
          Sign in to continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white">
        <FileText size={22} />
      </div>
      <div>
        <h1 className="text-xl font-semibold">{info.document.title || "Untitled"}</h1>
        <p className="mt-1 text-sm text-muted">
          You'll get {info.role.toLowerCase()} access to this document.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {info.requiresPassword ? (
        <form onSubmit={claim} className="flex w-full max-w-xs flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Lock size={15} className="text-muted" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Link password"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={claiming || !password}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {claiming ? "Opening…" : "Open document"}
          </button>
        </form>
      ) : (
        <Loader2 size={20} className="animate-spin text-muted" />
      )}
    </div>
  );
}
