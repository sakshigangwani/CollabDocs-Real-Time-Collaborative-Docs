import { randomBytes } from "node:crypto";
import type { CookieSerializeOptions } from "@fastify/cookie";
import { prisma } from "../db.js";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { id: token, userId, expiresAt } });
  return { token, expiresAt };
}

export async function validateSession(token: string | undefined) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: token } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function deleteSession(token: string) {
  await prisma.session.delete({ where: { id: token } }).catch(() => {});
}

export function sessionCookieOptions(expires: Date): CookieSerializeOptions {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
    expires,
  };
}
