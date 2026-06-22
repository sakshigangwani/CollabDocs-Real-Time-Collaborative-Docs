import type { FastifyInstance } from "fastify";
import { generateState, generateCodeVerifier } from "arctic";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  sessionCookieOptions,
} from "../auth/session.js";
import { getGoogle, getGitHub, oauthCookieOptions } from "../auth/oauth.js";
import { createDefaultWorkspace } from "../workspace.js";
import { writeAudit } from "../audit.js";
import { authRateLimit } from "../ratelimit.js";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

const signupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function upsertOAuthUser(
  provider: string,
  providerUserId: string,
  email: string,
  name: string,
  avatarUrl: string | null
) {
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: true },
  });
  if (linked) return linked.user;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.oAuthAccount.create({
      data: { provider, providerUserId, userId: existing.id },
    });
    return existing;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      avatarUrl,
      oauthAccounts: { create: { provider, providerUserId } },
    },
  });
  await createDefaultWorkspace(user.id, user.name);
  return user;
}

export async function authRoutes(app: FastifyInstance) {

  app.post("/api/v1/auth/signup", authRateLimit, async (req, reply) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Please check your details and try again." });
    }
    const { email, name, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "An account with this email already exists." });
    }

    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
    await createDefaultWorkspace(user.id, user.name);

    const { token, expiresAt } = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    await writeAudit({ actorId: user.id, action: "auth.signup", targetType: "user", targetId: user.id });
    return reply.send({ user: publicUser(user) });
  });

  app.post("/api/v1/auth/login", authRateLimit, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Please enter a valid email and password." });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    const invalid = { error: "Incorrect email or password." };
    if (!user || !user.passwordHash) return reply.code(401).send(invalid);

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) return reply.code(401).send(invalid);

    const { token, expiresAt } = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    await writeAudit({ actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id });
    return reply.send({ user: publicUser(user) });
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (req.user) {
      await writeAudit({ actorId: req.user.id, action: "auth.logout", targetType: "user", targetId: req.user.id });
    }
    if (token) await deleteSession(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/v1/auth/me", async (req) => {

    const user = req.user;
    return { user: user ? publicUser(user) : null };
  });

  app.get("/api/v1/auth/google", async (req, reply) => {
    const google = getGoogle();
    if (!google) return reply.code(503).send({ error: "Google login is not configured." });

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = google.createAuthorizationURL(state, codeVerifier, [
      "openid",
      "profile",
      "email",
    ]);

    reply.setCookie("google_state", state, oauthCookieOptions());
    reply.setCookie("google_verifier", codeVerifier, oauthCookieOptions());
    return reply.redirect(url.toString());
  });

  app.get("/api/v1/auth/google/callback", async (req, reply) => {
    const google = getGoogle();
    if (!google) return reply.code(503).send({ error: "Google login is not configured." });

    const query = req.query as { code?: string; state?: string };
    const storedState = req.cookies["google_state"];
    const verifier = req.cookies["google_verifier"];
    if (!query.code || !query.state || query.state !== storedState || !verifier) {
      return reply.code(400).send({ error: "Login failed. Please try again." });
    }

    const tokens = await google.validateAuthorizationCode(query.code, verifier);
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    const profile = (await res.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    const user = await upsertOAuthUser(
      "google",
      profile.sub,
      profile.email,
      profile.name ?? profile.email,
      profile.picture ?? null
    );

    const { token, expiresAt } = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return reply.redirect(`${WEB_ORIGIN}/home`);
  });

  app.get("/api/v1/auth/github", async (req, reply) => {
    const github = getGitHub();
    if (!github) return reply.code(503).send({ error: "GitHub login is not configured." });

    const state = generateState();
    const url = github.createAuthorizationURL(state, ["read:user", "user:email"]);

    reply.setCookie("github_state", state, oauthCookieOptions());
    return reply.redirect(url.toString());
  });

  app.get("/api/v1/auth/github/callback", async (req, reply) => {
    const github = getGitHub();
    if (!github) return reply.code(503).send({ error: "GitHub login is not configured." });

    const query = req.query as { code?: string; state?: string };
    const storedState = req.cookies["github_state"];
    if (!query.code || !query.state || query.state !== storedState) {
      return reply.code(400).send({ error: "Login failed. Please try again." });
    }

    const tokens = await github.validateAuthorizationCode(query.code);
    const headers = {
      Authorization: `Bearer ${tokens.accessToken()}`,
      "User-Agent": "CollabDocs",
    };

    const profile = (await (
      await fetch("https://api.github.com/user", { headers })
    ).json()) as { id: number; name?: string; login: string; avatar_url?: string };

    const emails = (await (
      await fetch("https://api.github.com/user/emails", { headers })
    ).json()) as { email: string; primary: boolean; verified: boolean }[];
    const primary = emails.find((e) => e.primary && e.verified) ?? emails[0];

    const user = await upsertOAuthUser(
      "github",
      String(profile.id),
      primary.email,
      profile.name ?? profile.login,
      profile.avatar_url ?? null
    );

    const { token, expiresAt } = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return reply.redirect(`${WEB_ORIGIN}/home`);
  });
}
