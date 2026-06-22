import { randomBytes } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { Workspace } from "@prisma/client";
import { prisma } from "./db.js";

function slugify(text: string) {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return base || "workspace";
}

export async function createDefaultWorkspace(userId: string, userName: string) {
  const firstName = userName.trim().split(/\s+/)[0] || "My";
  const name = `${firstName}'s Workspace`;
  const slug = `${slugify(firstName)}-${randomBytes(3).toString("hex")}`;

  return prisma.workspace.create({
    data: {
      name,
      slug,
      ownerId: userId,
      members: { create: { userId, role: "ADMIN" } },
    },
  });
}

export async function getPrimaryWorkspace(userId: string): Promise<Workspace | null> {
  const owned = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
  });
  if (owned) return owned;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, deactivatedAt: null },
    orderBy: { joinedAt: "asc" },
    include: { workspace: true },
  });
  return membership?.workspace ?? null;
}

export async function requireWorkspaceAdmin(
  userId: string,
  workspaceId: string,
  reply: FastifyReply,
): Promise<Workspace | null> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    reply.code(404).send({ error: "Workspace not found." });
    return null;
  }
  if (workspace.ownerId === userId) return workspace;
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member || member.deactivatedAt || member.role !== "ADMIN") {
    reply.code(403).send({ error: "Admin access required." });
    return null;
  }
  return workspace;
}
