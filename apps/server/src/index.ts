import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import type { User } from "@prisma/client";
import { prisma } from "./db.js";
import { SESSION_COOKIE, validateSession } from "./auth/session.js";
import { authRoutes } from "./routes/auth.js";
import { documentRoutes } from "./routes/documents.js";
import { shareRoutes } from "./routes/shares.js";
import { commentRoutes } from "./routes/comments.js";
import { notificationRoutes } from "./routes/notifications.js";
import { createCollabServer } from "./collab.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true,
});

await app.register(cookie);

app.decorateRequest("user", null);
app.addHook("onRequest", async (req) => {
  req.user = await validateSession(req.cookies[SESSION_COOKIE]);
});

app.get("/health", async () => {
  return { status: "ok", service: "collabdocs-server" };
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

const port = Number(process.env.PORT ?? 4000);
const collabPort = Number(process.env.COLLAB_PORT ?? 4001);

const collab = createCollabServer();

try {
  await app.listen({ port, host: "0.0.0.0" });
  await collab.listen(collabPort);
  console.log(`Server ready at http://localhost:${port}`);
  console.log(`Collab server ready at ws://localhost:${collabPort}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown() {
  collab.hocuspocus.flushPendingStores();
  await collab.destroy();
  await app.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
