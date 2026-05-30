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

# 2. Point the server at a Postgres database
cp apps/server/.env.example apps/server/.env
#   then edit DATABASE_URL inside it (see "Database" below)

# 3. Create the tables, then add a little demo data
pnpm --filter @collabdocs/server db:migrate
pnpm --filter @collabdocs/server db:seed

# 4. Run both apps together
pnpm dev
```

Then open:
- **Frontend:** http://localhost:5173
- **Backend health:** http://localhost:4000/health
- **DB health:** http://localhost:4000/health/db  → should show `"users": 1`

If the dot on the homepage is green, the frontend reached the backend. ✅

## Database

Uses **PostgreSQL** via **Prisma**. Schema lives in `apps/server/prisma/schema.prisma`.

```bash
pnpm --filter @collabdocs/server db:migrate    # apply schema changes
pnpm --filter @collabdocs/server db:seed       # reset + add demo data
pnpm --filter @collabdocs/server db:studio     # visual table browser
```

Tables so far: `User`, `Workspace`, `WorkspaceMember`, `Document`, `DocumentAcl`.
More get added as features land (comments, versions, notifications…).

## Run just one app

```bash
pnpm web      # frontend only
pnpm server   # backend only
```

## Tech stack

React 18 · Vite · Tailwind v4 · TypeScript · Fastify · pnpm workspaces

(Postgres, Yjs realtime collab, auth, and the rest get added step by step — see the plan.)
