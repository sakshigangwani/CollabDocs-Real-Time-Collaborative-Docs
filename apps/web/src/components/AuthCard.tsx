import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-blob absolute -top-10 left-1/3 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div
          className="animate-blob absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
          style={{ animationDelay: "-6s" }}
        />
      </div>

      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo size={32} />
          <span className="text-xl font-semibold">CollabDocs</span>
        </Link>

        <div className="rounded-2xl border border-border bg-surface/80 p-7 shadow-xl backdrop-blur">
          <h1 className="text-center text-2xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="mt-1.5 text-center text-sm text-muted">{subtitle}</p>

          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
