import { randomBytes } from "node:crypto";
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
