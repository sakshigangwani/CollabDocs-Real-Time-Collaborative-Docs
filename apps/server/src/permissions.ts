import type { DocRole, Prisma } from "@prisma/client";
import { prisma } from "./db.js";

export const ROLE_RANK: Record<DocRole, number> = {
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  OWNER: 4,
};

export function roleAtLeast(role: DocRole | null, min: DocRole): role is DocRole {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}

export function bestRole(roles: DocRole[]): DocRole | null {
  if (roles.length === 0) return null;
  return roles.reduce<DocRole>(
    (best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best),
    roles[0],
  );
}

export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  return memberships.map((m) => m.workspaceId);
}

export function aclPrincipalWhere(
  userId: string,
  workspaceIds: string[],
): Prisma.DocumentAclWhereInput {
  return {
    OR: [
      { principalType: "USER", principalId: userId },
      { principalType: "WORKSPACE", principalId: { in: workspaceIds } },
    ],
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
  };
}

export async function getDocRole(userId: string, documentId: string): Promise<DocRole | null> {
  const workspaceIds = await getUserWorkspaceIds(userId);
  const acls = await prisma.documentAcl.findMany({
    where: { documentId, ...aclPrincipalWhere(userId, workspaceIds) },
    select: { role: true },
  });
  return bestRole(acls.map((a) => a.role));
}
