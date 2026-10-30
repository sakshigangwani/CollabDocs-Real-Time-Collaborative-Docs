import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import type { User } from "@prisma/client";
import { rateLimitOptions } from "./ratelimit.js";
import { registerCsrf } from "./csrf.js";
import { prisma } from "./db.js";
import { SESSION_COOKIE, validateSession } from "./auth/session.js";
import { authRoutes } from "./routes/auth.js";
import { documentRoutes } from "./routes/documents.js";
import { shareRoutes } from "./routes/shares.js";
import { commentRoutes } from "./routes/comments.js";
import { notificationRoutes } from "./routes/notifications.js";
import { versionRoutes } from "./routes/versions.js";
import { searchRoutes } from "./routes/search.js";
import { discoveryRoutes } from "./routes/discovery.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { billingRoutes } from "./routes/billing.js";
import { fileRoutes } from "./routes/files.js";
import { aiRoutes } from "./routes/ai.js";
import { scheduleDigests } from "./digest.js";
import { scheduleMaintenance } from "./maintenance.js";
import { createCollabServer, INSTANCE_ID } from "./collab.js";
import { isRedisConfigured } from "./redis.js";
import { storageDriver } from "./storage.js";
import { isAiConfigured } from "./ai.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
    rawBody?: Buffer;
  }
}

const app = Fastify({ logger: true });

app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
  (req as { rawBody?: Buffer }).rawBody = body as Buffer;
  try {
    const text = (body as Buffer).toString("utf8");
    done(null, text ? JSON.parse(text) : {});
  } catch (err) {
    done(err as Error, undefined);
  }
});

const isProd = process.env.NODE_ENV === "production";

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  },
  hsts: isProd,
  noSniff: true,
  frameguard: { action: "deny" },
  referrerPolicy: { policy: "no-referrer" },
});

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true,
  allowedHeaders: ["content-type", "x-csrf-token"],
});

await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
await app.register(rateLimit, rateLimitOptions);
registerCsrf(app);

app.decorateRequest("user", null);
app.addHook("onRequest", async (req) => {
  req.user = await validateSession(req.cookies[SESSION_COOKIE]);
});

app.get("/health", async () => {
  return {
    status: "ok",
    service: "collabdocs-server",
    instance: INSTANCE_ID,
    redis: isRedisConfigured ? "connected" : "disabled",
    collabSync: isRedisConfigured ? "redis" : "single-instance",
    storage: storageDriver,
    ai: isAiConfigured() ? "enabled" : "disabled",
  };
});

app.get("/health/db", async () => {
  const users = await prisma.user.count();
  return { status: "ok", database: "connected", users };
});

await app.register(authRoutes);
await app.register(documentRoutes);
await app.register(shareRoutes);
await app.register(commentRoutes);
await app.register(notificationRoutes);
await app.register(versionRoutes);
await app.register(searchRoutes);
await app.register(discoveryRoutes);
await app.register(workspaceRoutes);
await app.register(billingRoutes);
await app.register(fileRoutes);
await app.register(aiRoutes);

const port = Number(process.env.PORT ?? 4000);
const collabPort = Number(process.env.COLLAB_PORT ?? 4001);

const collab = createCollabServer();

try {
  await app.listen({ port, host: "0.0.0.0" });
  await collab.listen(collabPort);
  scheduleDigests();
  scheduleMaintenance();
  console.log(`Server ready at http://localhost:${port}`);
  console.log(`Collab server ready at ws://localhost:${collabPort}`);
  console.log(
    isRedisConfigured
      ? `Collab sync via Redis (instance ${INSTANCE_ID})`
      : "Collab sync is single-instance (set REDIS_URL to run more than one)",
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown() {
  await collab.destroy();
  await app.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
