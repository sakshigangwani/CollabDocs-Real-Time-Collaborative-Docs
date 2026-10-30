# syntax=docker/dockerfile:1
# Build from the repo root. Vite bakes the API/collab URLs in at build time:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.example.com \
#     --build-arg VITE_COLLAB_URL=wss://api.example.com/collab \
#     -t collabdocs-web .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @collabdocs/web...
COPY apps/web apps/web
ARG VITE_API_URL
ARG VITE_COLLAB_URL
RUN pnpm --filter @collabdocs/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
