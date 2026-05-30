import { useEffect, useState } from "react";
import ThemeToggle from "./components/ThemeToggle";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export default function App() {
  const [serverStatus, setServerStatus] = useState<"checking" | "ok" | "down">(
    "checking"
  );

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setServerStatus(data.status === "ok" ? "ok" : "down"))
      .catch(() => setServerStatus("down"));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <h1 className="text-xl font-semibold">CollabDocs</h1>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 space-y-6">
        <div>
          <p className="text-muted">
            Real-time collaborative document editor. Use the button in the top
            right to switch between light and dark mode.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h2 className="font-semibold">Surfaces &amp; text</h2>
          <div className="rounded-lg bg-surface-muted p-4">
            <p className="text-fg">Primary text on a muted surface.</p>
            <p className="text-muted text-sm">Muted secondary text.</p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h2 className="font-semibold">Buttons</h2>
          <div className="flex gap-3">
            <button className="rounded-lg bg-brand px-4 py-2 font-medium text-brand-fg transition-colors hover:bg-brand-hover">
              Primary
            </button>
            <button className="rounded-lg border border-border bg-surface px-4 py-2 font-medium transition-colors hover:bg-surface-muted">
              Secondary
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h2 className="font-semibold">Status colors</h2>
          <div className="flex gap-4 text-sm font-medium">
            <span className="text-success">Success</span>
            <span className="text-warn">Warning</span>
            <span className="text-danger">Danger</span>
          </div>
        </section>

        <div className="flex items-center gap-2 text-sm">
          <span
            className={
              "inline-block h-2.5 w-2.5 rounded-full " +
              (serverStatus === "ok"
                ? "bg-success"
                : serverStatus === "down"
                  ? "bg-danger"
                  : "bg-warn")
            }
          />
          <span className="text-muted">
            {serverStatus === "checking" && "Checking server…"}
            {serverStatus === "ok" && "Backend connected"}
            {serverStatus === "down" && "Backend not reachable"}
          </span>
        </div>
      </main>
    </div>
  );
}
