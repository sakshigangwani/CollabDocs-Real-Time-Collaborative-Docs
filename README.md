# CollabDocs

Real-time collaborative document editor.

📋 Full build plan: [`docs/CollabDocs-1-Month-Plan.md`](docs/CollabDocs-1-Month-Plan.md)

## Project layout

```
apps/
  web/      React + Vite frontend  (deploys to Vercel)
  server/   Fastify backend        (deploys to Railway)
```

Two apps in one repo ("monorepo"), managed by pnpm. They run independently
and talk over HTTP.

## Getting started

```bash
# 1. Install dependencies for both apps (run once)
pnpm install

# 2. Set up env vars (optional for now — defaults work locally)
cp .env.example .env

# 3. Run both apps together
pnpm dev
```

Then open:
- **Frontend:** http://localhost:5173
- **Backend health check:** http://localhost:4000/health

If the dot on the homepage is green, the frontend successfully reached the backend. ✅

## Run just one app

```bash
pnpm web      # frontend only
pnpm server   # backend only
```

## Tech stack

React 18 · Vite · Tailwind v4 · TypeScript · Fastify · pnpm workspaces

(Postgres, Yjs realtime collab, auth, and the rest get added step by step — see the plan.)
