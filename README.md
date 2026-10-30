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
- **Images** — drag-and-drop, paste, or pick from the toolbar. Files go to S3, not
  into the document.
- Pasted HTML is sanitized before it enters the document.

### 👥 Real-time collaboration
- Multiple people edit the **same document at the same time**, kept consistent with
  **operational transformation (OT)**: the server is the single authority that orders
  every ProseMirror step. A client whose steps were based on an old version gets them
  rejected, rebases (transforms) them over the steps it missed, and resends —
  the `prosemirror-collab` model, over a plain WebSocket protocol.
- The server validates every step against the document schema before accepting it, so
  a buggy or malicious client can't corrupt the document.
- **Live presence**: colored cursors with name labels, an avatar stack showing who's
  active / idle / away, a typing indicator, and a "follow" mode that scrolls you to a
  collaborator's cursor.
- **Survives reconnects** — unconfirmed edits stay in the editor while you're offline
  (with a "connection lost" banner) and are rebased and sent when you reconnect; the
  server replays only the steps you missed.
- Document state is persisted as **ProseMirror JSON + an OT version** in Postgres
  (debounced), which also keeps full-text search and AI embeddings current.
- **Comment anchors follow the text**: they are stored as positions at an OT version and
  mapped forward through every step.
- **Scales past one server.** With `REDIS_URL` set, the step log lives in **Redis**: an
  atomic compare-and-append (Lua) gives every document one global order of steps across
  instances, and pub/sub fans steps and presence out, so two people on different
  servers still edit the same document and see each other's cursors.
- Documents created before the switch from Yjs are converted to OT on first open.

### 📦 Object storage
- Uploads live in **S3** (or any S3-compatible service — Cloudflare
  R2, MinIO, Backblaze B2 — by setting `S3_ENDPOINT`).
- The bucket stays **private**: files are served through short-lived **presigned URLs**,
  and every request is permission-checked against the document's ACL first.
- With no S3 credentials configured the same code writes to `apps/server/.storage/`,
  so the feature works out of the box in development.

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

### ✨ AI assistant
- **Ask your documents** — questions are answered from your own content, retrieved as
  the **top-8 most relevant spans** by vector similarity (**pgvector**, OpenAI
  embeddings) rather than from the model's own knowledge.
- **Every claim is cited.** Answers carry `[1]`-style markers; click one to jump to
  the exact span it came from. If the answer isn't in your documents, it says so
  instead of guessing.
- Search **this document** or **everything you can access** — retrieval is filtered by
  the same ACL as the rest of the app, so it can never surface a document you
  couldn't already open.
- **Inline writing actions** on any selection: improve, fix grammar, shorten, lengthen,
  summarise, change tone, translate.
- Documents are re-embedded on demand when you ask, plus a background sweep every
  10 minutes. Without `OPENAI_API_KEY` the AI routes return 503 and the UI hides itself.

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
React 18 · Vite · Tailwind v4 · TypeScript · Tiptap · prosemirror-collab (OT) · React Router

**Backend** (`apps/server`, deploys to Railway)
Fastify · Prisma · PostgreSQL · pgvector · Redis · ws (OT authority) · S3 · OpenAI · Resend ·
Stripe · node-cron

A pnpm monorepo: two apps that run independently and talk over HTTP.

```
apps/
  web/      React + Vite frontend
  server/   Fastify backend (+ OT collaboration server)
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

## Deploying to Kubernetes

Dockerfiles live in `apps/server` and `apps/web`; manifests (kustomize) in `deploy/k8s`.
See [`deploy/k8s/README.md`](deploy/k8s/README.md) for the build → migrate → apply steps.

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
| `REDIS_URL` | Shared OT step log + rate limiting across instances (else in-memory, single instance) |
| `COLLAB_JWT_SECRET` / `COLLAB_PORT` | Real-time collaboration server |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email notifications (else logged, not sent) |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PRO` / `STRIPE_WEBHOOK_SECRET` | Billing |
| Google / GitHub OAuth client IDs + secrets | Social login |
