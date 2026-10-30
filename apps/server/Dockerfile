# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/server/Dockerfile -t collabdocs-server .
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @collabdocs/server...
COPY apps/server apps/server
RUN pnpm --filter @collabdocs/server exec prisma generate \
 && pnpm --filter @collabdocs/server build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000 COLLAB_PORT=4001
WORKDIR /repo
# The Prisma CLI stays in the image so the same image runs `prisma migrate deploy` as a Job.
COPY --from=build --chown=node:node /repo /repo
WORKDIR /repo/apps/server
USER node
EXPOSE 4000 4001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
