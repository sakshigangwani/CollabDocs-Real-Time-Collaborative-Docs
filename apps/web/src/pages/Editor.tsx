import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import DocEditor from "../components/DocEditor";
import { api, type FullDocument } from "../lib/api";

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<FullDocument | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">(
    "loading"
  );

  useEffect(() => {
    if (!id) return;
    setStatus("loading");
    api.documents
      .get(id)
      .then((d) => {
        setDoc(d);
        setStatus("ready");
      })
      .catch(() => setStatus("notfound"));
  }, [id]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (status === "notfound" || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-xl font-semibold">Document not found</h1>
        <p className="text-sm text-muted">
          It may have been deleted or you don't have access.
        </p>
        <button
          onClick={() => navigate("/home")}
          className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover"
        >
          Back to documents
        </button>
      </div>
    );
  }

  return <DocEditor doc={doc} />;
}
