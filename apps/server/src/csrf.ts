import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

const CSRF_COOKIE = "csrf";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/signup",
  "/api/v1/webhooks/stripe",
]);
const EXEMPT_PREFIX = ["/api/v1/auth/google", "/api/v1/auth/github"];

function csrfCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: false,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    secure: isProd,
    path: "/",
  };
}

export function registerCsrf(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    if (!req.cookies[CSRF_COOKIE]) {
      const token = randomBytes(18).toString("base64url");
      reply.setCookie(CSRF_COOKIE, token, csrfCookieOptions());
      (req as { freshCsrf?: string }).freshCsrf = token;
    }
  });

  app.addHook("preHandler", async (req, reply) => {
    if (!MUTATING.has(req.method)) return;
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/v1")) return;
    if (EXEMPT.has(path) || EXEMPT_PREFIX.some((p) => path.startsWith(p))) return;

    const cookie = req.cookies[CSRF_COOKIE] ?? (req as { freshCsrf?: string }).freshCsrf;
    const header = req.headers["x-csrf-token"];
    if (!cookie || !header || header !== cookie) {
      return reply.code(403).send({ error: "Invalid CSRF token." });
    }
  });
}
