import { SignJWT, jwtVerify } from "jose";
import type { DocRole } from "@prisma/client";

const secret = new TextEncoder().encode(
  process.env.COLLAB_JWT_SECRET ?? "dev-collab-secret-change-me-in-production",
);

const TTL = "2h";

export type CollabClaims = {
  sub: string;
  name: string;
  color: string;
  docId: string;
  role: DocRole;
};

const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
];

export function colorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export async function mintCollabToken(claims: CollabClaims) {
  return new SignJWT({
    name: claims.name,
    color: claims.color,
    docId: claims.docId,
    role: claims.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret);
}

export async function verifyCollabToken(token: string): Promise<CollabClaims> {
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: payload.sub as string,
    name: payload.name as string,
    color: payload.color as string,
    docId: payload.docId as string,
    role: payload.role as DocRole,
  };
}
