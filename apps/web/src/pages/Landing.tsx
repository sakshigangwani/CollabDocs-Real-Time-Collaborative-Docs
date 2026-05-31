import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Users,
  MessageSquare,
  History,
  Share2,
  CloudOff,
  Sparkles,
} from "lucide-react";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const features = [
  {
    icon: Users,
    title: "Real-time editing",
    description:
      "See teammates' cursors and edits appear instantly — character by character, no refresh.",
  },
  {
    icon: MessageSquare,
    title: "Comments & suggestions",
    description:
      "Discuss inline, propose tracked changes, and resolve threads without leaving the doc.",
  },
  {
    icon: History,
    title: "Version history",
    description:
      "Every change is saved automatically. Compare versions and restore with one click.",
  },
  {
    icon: Share2,
    title: "Sharing & permissions",
    description:
      "Share by link or invite people directly. Owner, Editor, Commenter, and Viewer roles.",
  },
  {
    icon: CloudOff,
    title: "Works offline",
    description:
      "Keep writing with no connection. Your changes sync automatically when you're back online.",
  },
  {
    icon: Sparkles,
    title: "AI assistance",
    description:
      "Rewrite, summarize, translate, fix grammar, and ask questions about your documents.",
  },
];

function useTypewriter(text: string, speed = 70) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return shown;
}

export default function Landing() {
  const typed = useTypewriter("Q3 Product Roadmap");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-canvas/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-lg font-semibold">CollabDocs</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button className="hidden rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-muted sm:block">
              Sign in
            </button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg shadow-lg shadow-brand/25 transition-colors hover:bg-brand-hover"
            >
              Get started
            </motion.button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="bg-grid absolute inset-0 opacity-70"
            style={{
              maskImage:
                "radial-gradient(ellipse at center, black, transparent 72%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at center, black, transparent 72%)",
            }}
          />
          <div className="animate-blob absolute -top-16 left-1/4 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
          <div
            className="animate-blob absolute top-8 right-1/4 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-3xl px-6 pt-20 pb-20 text-center"
        >
          <motion.span
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur"
          >
            <span className="h-1.5 w-1.5 animate-caret rounded-full bg-success" />
            Real-time · Conflict-free · Built on CRDTs
          </motion.span>

          <motion.h1
            variants={fadeUp}
            className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl"
          >
            Write together,
            <br />
            <span className="text-gradient">in real time.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-xl text-lg text-muted"
          >
            CollabDocs is a collaborative document editor where your whole team
            can write, comment, and edit the same doc at once — so working
            together feels as smooth as a single person typing.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-9 flex items-center justify-center gap-3"
          >
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl bg-brand px-6 py-3 font-medium text-brand-fg shadow-xl shadow-brand/30 transition-colors hover:bg-brand-hover"
            >
              Get started — it's free
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl border border-border bg-surface px-6 py-3 font-medium transition-colors hover:bg-surface-muted"
            >
              Sign in
            </motion.button>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="relative mx-auto mt-16 max-w-lg rounded-2xl border border-border bg-surface/80 p-6 text-left shadow-2xl shadow-black/5 backdrop-blur"
          >
            <div className="mb-5 flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
            </div>

            <div className="text-lg font-semibold">
              {typed}
              <span className="animate-caret text-brand">|</span>
            </div>

            <div className="mt-5 space-y-3">
              <div className="h-2.5 w-full rounded bg-surface-muted" />
              <div className="h-2.5 w-11/12 rounded bg-surface-muted" />
              <div className="h-2.5 w-4/5 rounded bg-surface-muted" />
            </div>

            <motion.span
              animate={{ x: [0, 14, -6, 0], y: [0, 8, -4, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute left-10 top-24 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-medium text-brand-fg shadow"
            >
              Priya
            </motion.span>
            <motion.span
              animate={{ x: [0, -10, 6, 0], y: [0, -6, 5, 0] }}
              transition={{
                duration: 7,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              }}
              className="absolute right-12 top-32 rounded-md bg-success px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
            >
              Marco
            </motion.span>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to{" "}
            <span className="text-gradient">collaborate</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            A complete document workspace — from the first keystroke to the
            final shared version.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map(({ icon: Icon, title, description }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              className="group rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-xl hover:shadow-brand/5"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand/15 to-accent/15 text-brand transition-transform group-hover:scale-110">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{description}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand to-accent px-8 py-16 text-center">
          <div className="bg-grid absolute inset-0 opacity-20" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to write together?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-white/80">
              Create a workspace, invite your team, and start your first
              document in seconds.
            </p>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="mt-8 rounded-xl bg-white px-6 py-3 font-semibold text-brand shadow-xl"
            >
              Get started, it's free
            </motion.button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span>© {new Date().getFullYear()} CollabDocs</span>
          </div>
          <span>Built with React, Yjs, and PostgreSQL.</span>
        </div>
      </footer>
    </div>
  );
}
