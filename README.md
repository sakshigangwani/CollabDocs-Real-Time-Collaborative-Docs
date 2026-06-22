# CollabDocs

A real-time collaborative document editor — think Google Docs, rebuilt from scratch.
Multiple people can open the same document and edit it together, see each other's
cursors live, leave comments, share with fine-grained permissions, browse version
history, and search across everything.

## Features

### ✍️ Rich editing
- A clean, distraction-free editor built on **Tiptap / ProseMirror** — headings,
  lists, tables, task lists, code blocks, text color and highlighting.
- Slash menu and formatting toolbar, an editable title, and a bubble menu on
  selected text.
- Pasted HTML is sanitized before it enters the document.

### 👥 Real-time collaboration
- Multiple people edit the **same document at the same time**, with changes merged
  conflict-free using **Yjs (CRDTs)** synced over a **Hocuspocus** WebSocket server.
- **Live presence**: colored cursors with name labels, an avatar stack showing who's
  active / idle / away, a typing indicator, and a "follow" mode that scrolls you to a
  collaborator's cursor.
- **Offline-friendly** — edits are cached locally (IndexedDB) and sync when you
  reconnect, with a "connection lost" banner while you're offline.

### 🔐 Sharing & permissions
- Role-based access with a clear hierarchy: **Owner > Editor > Commenter > Viewer**.
- Invite people by email, or generate **share links** with a chosen role, an expiry,
  and an optional password.
- A "Shared with me" view collects documents others have shared with you.
- Every sensitive action is recorded to an **audit log**.

### 💬 Comments
- Anchored comments and **threaded replies** tied to a span of text (they stay put as
  the document changes).
- **@mentions** with autocomplete, emoji **reactions**, and resolve / reopen.
- Filter the comments drawer by All / Open / Resolved / @You / Yours.

### 🕘 Version history
- Automatic snapshots while you edit, plus **named versions** you save on demand.
- A version timeline with **inline word-diff** and **side-by-side** comparison,
  color-coded by author.
- **Restore** any earlier version, and **export** to HTML, Markdown, PDF, or Word.

### 🔔 Notifications
- In-app notification bell for mentions, replies, shares, and version restores.
- **Email notifications** (via Resend) — instant or batched into **daily / weekly
  digests**.
- Per-document subscription levels (all activity / mentions only / muted) and
  per-user email preferences.

### 🔎 Search & discovery
- Full-text search across all your documents (**Postgres FTS**) with **typo
  tolerance** (trigram matching) and highlighted snippets.
- Facets: mine, has comments, favorites, and time window.
- **Favorites** (star) and a **Recent** view, plus in-document **find & replace**
  (Cmd/Ctrl+F) with regex support.

### 🏢 Admin & workspaces
- Workspaces with member management — invite, change roles, deactivate, remove, and
  **transfer ownership**.
- Workspace settings: logo, default role for new docs, allowed email domains, and
  audit-log retention.
- An admin audit view, and **billing** via Stripe (test mode) with a free / pro plan.

### 🛡️ Security
- Session-cookie auth with **email + password** (Argon2id) and **Google / GitHub
  OAuth**.
- **CSRF** protection (double-submit), **rate limiting** (stricter on login/signup),
  and security headers via Helmet (CSP, HSTS, and more).

## Tech stack

**Frontend** (`apps/web`, deploys to Vercel)
React 18 · Vite · Tailwind v4 · TypeScript · Tiptap · Yjs · React Router

**Backend** (`apps/server`, deploys to Railway)
Fastify · Prisma · PostgreSQL · Redis · Hocuspocus · Resend · Stripe · node-cron

A pnpm monorepo: two apps that run independently and talk over HTTP.

```
apps/
  web/      React + Vite frontend
  server/   Fastify backend (+ Hocuspocus collab server)
```

## Getting started

```bash
# 1. Install dependencies for both apps (run once)
pnpm install

# 2. Point the server at a Postgres database
cp apps/server/.env.example apps/server/.env
#   then edit DATABASE_URL inside it

# 3. Create the tables, then add a little demo data
pnpm --filter @collabdocs/server db:migrate
pnpm --filter @collabdocs/server db:seed

# 4. Run both apps together
pnpm dev
```

Then open:
- **Frontend:** http://localhost:5173
- **Backend health:** http://localhost:4000/health
- **DB health:** http://localhost:4000/health/db

### Run just one app

```bash
pnpm web      # frontend only
pnpm server   # backend only
```

## Database

Uses **PostgreSQL** via **Prisma**. The schema lives in
`apps/server/prisma/schema.prisma`.

```bash
pnpm --filter @collabdocs/server db:migrate    # apply schema changes
pnpm --filter @collabdocs/server db:studio     # visual table browser
pnpm --filter @collabdocs/server db:seed       # reset + add demo data
```

## Configuration

Most integrations are **optional in development** — they no-op or fall back when their
keys are unset:

| Variable | What it enables |
| --- | --- |
| `DATABASE_URL` | Postgres connection (required) |
| `REDIS_URL` | Redis-backed rate limiting (else in-memory) |
| `COLLAB_JWT_SECRET` / `COLLAB_PORT` | Real-time collaboration server |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email notifications (else logged, not sent) |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PRO` / `STRIPE_WEBHOOK_SECRET` | Billing |
| Google / GitHub OAuth client IDs + secrets | Social login |
