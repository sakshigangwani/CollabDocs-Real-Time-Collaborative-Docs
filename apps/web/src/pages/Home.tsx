import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../auth/AuthContext";

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="font-semibold">CollabDocs</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {user?.name}! 👋
        </h1>
        <p className="mt-2 text-muted">
          You're signed in as{" "}
          <span className="font-medium text-fg">{user?.email}</span>.
        </p>

        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center">
          <p className="text-muted">
            Your documents will appear here. The workspace and editor are the
            next things we'll build.
          </p>
        </div>
      </main>
    </div>
  );
}
