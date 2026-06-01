import { useState } from "react";
import {
  FileText,
  Users,
  Star,
  Trash2,
  Plus,
  LogOut,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../auth/AuthContext";

export type View = "all" | "shared" | "favorites" | "trash";

const navItems: { key: View; icon: typeof FileText; label: string }[] = [
  { key: "all", icon: FileText, label: "All documents" },
  { key: "shared", icon: Users, label: "Shared with me" },
  { key: "favorites", icon: Star, label: "Favorites" },
  { key: "trash", icon: Trash2, label: "Trash" },
];

export default function Sidebar({
  onNew,
  active,
  onNavigate,
}: {
  onNew: () => void;
  active: View;
  onNavigate: (view: View) => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  );

  const firstName = (user?.name ?? "My").split(" ")[0];
  const initials = (user?.name ?? "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  }

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <aside
      className={
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex " +
        (collapsed ? "w-16" : "w-64")
      }
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <Logo size={28} />
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <PanelLeft size={18} />
          </button>
        </div>
      ) : (
        <div className="flex h-[60px] items-center gap-2.5 px-4">
          <Logo size={28} />
          <span className="font-semibold">CollabDocs</span>
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
      )}

      <div className={collapsed ? "px-2" : "px-3"}>
        <button
          onClick={onNew}
          title="New document"
          className={
            "flex items-center justify-center gap-2 rounded-xl bg-brand font-medium text-brand-fg shadow-lg shadow-brand/25 transition-colors hover:bg-brand-hover " +
            (collapsed ? "mx-auto h-10 w-10" : "w-full px-4 py-2.5 text-sm")
          }
        >
          <Plus size={18} />
          {!collapsed && "New document"}
        </button>
      </div>

      <nav className={"mt-6 flex-1 space-y-1 " + (collapsed ? "px-2" : "px-3")}>
        {!collapsed && (
          <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {firstName}'s Workspace
          </p>
        )}
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            title={collapsed ? item.label : undefined}
            className={
              "flex items-center rounded-lg text-sm font-medium transition-colors " +
              (collapsed
                ? "mx-auto h-10 w-10 justify-center"
                : "w-full gap-3 px-3 py-2") +
              " " +
              (active === item.key
                ? "bg-brand/10 text-brand"
                : "text-fg hover:bg-surface-muted")
            }
          >
            <item.icon size={17} />
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      <div className={"border-t border-border " + (collapsed ? "p-2" : "p-3")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={user?.name ?? ""}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-sm font-semibold text-white"
            >
              {initials}
            </div>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border transition-colors hover:bg-surface-muted"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-sm font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-muted">{user?.email}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted"
              >
                <LogOut size={15} />
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
