import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAudit } from "../audit.js";
import { getPrimaryWorkspace, requireWorkspaceAdmin } from "../workspace.js";

function publicWorkspace(ws: {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logoUrl: string | null;
  defaultRole: string;
  allowedDomains: string[];
  auditRetentionDays: number | null;
}) {
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    plan: ws.plan,
    logoUrl: ws.logoUrl,
    defaultRole: ws.defaultRole,
    allowedDomains: ws.allowedDomains,
    auditRetentionDays: ws.auditRetentionDays,
  };
}

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/api/v1/workspace", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws) return reply.code(404).send({ error: "No workspace." });

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
    });
    const isOwner = ws.ownerId === user.id;
    const memberCount = await prisma.workspaceMember.count({ where: { workspaceId: ws.id } });

    return {
      workspace: publicWorkspace(ws),
      myRole: isOwner ? "ADMIN" : member?.role ?? "MEMBER",
      isOwner,
      isAdmin: isOwner || member?.role === "ADMIN",
      memberCount,
    };
  });

  app.patch("/api/v1/workspace", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws) return reply.code(404).send({ error: "No workspace." });
    if (!(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;

    const parsed = z
      .object({
        name: z.string().min(1).max(80).optional(),
        logoUrl: z.string().url().nullable().optional(),
        defaultRole: z.enum(["EDITOR", "COMMENTER", "VIEWER"]).optional(),
        allowedDomains: z.array(z.string().min(1)).max(20).optional(),
        auditRetentionDays: z.number().int().min(1).max(3650).nullable().optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid settings." });

    const updated = await prisma.workspace.update({ where: { id: ws.id }, data: parsed.data });
    await writeAudit({ actorId: user.id, action: "workspace.update", targetType: "workspace", targetId: ws.id });
    return { workspace: publicWorkspace(updated) };
  });

  app.get("/api/v1/workspace/members", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: ws.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return {
      members: members.map((m) => ({
        ...m.user,
        role: m.role,
        active: m.deactivatedAt === null,
        isOwner: ws.ownerId === m.userId,
        isYou: m.userId === user.id,
      })),
    };
  });

  app.post("/api/v1/workspace/members", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;

    const parsed = z
      .object({ email: z.string().email(), role: z.enum(["ADMIN", "MEMBER", "GUEST"]).default("MEMBER") })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid email or role." });

    const target = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    if (!target) return reply.code(404).send({ error: "No CollabDocs user with that email." });

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: target.id } },
    });
    if (existing) return reply.code(400).send({ error: "Already a member." });

    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: target.id, role: parsed.data.role },
    });
    await writeAudit({
      actorId: user.id,
      action: "workspace.member_invite",
      targetType: "user",
      targetId: target.id,
      metadata: { role: parsed.data.role },
    });
    return reply.code(201).send({
      member: { ...target, role: parsed.data.role, active: true, isOwner: false, isYou: false },
    });
  });

  app.patch("/api/v1/workspace/members/:userId", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { userId } = req.params as { userId: string };
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;
    if (userId === ws.ownerId) return reply.code(400).send({ error: "Can't modify the owner." });

    const parsed = z
      .object({
        role: z.enum(["ADMIN", "MEMBER", "GUEST"]).optional(),
        deactivated: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid update." });

    const data: { role?: "ADMIN" | "MEMBER" | "GUEST"; deactivatedAt?: Date | null } = {};
    if (parsed.data.role) data.role = parsed.data.role;
    if (parsed.data.deactivated !== undefined) data.deactivatedAt = parsed.data.deactivated ? new Date() : null;

    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: ws.id, userId } },
      data,
    });
    await writeAudit({ actorId: user.id, action: "workspace.member_update", targetType: "user", targetId: userId, metadata: parsed.data });
    return { ok: true };
  });

  app.delete("/api/v1/workspace/members/:userId", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const { userId } = req.params as { userId: string };
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;
    if (userId === ws.ownerId) return reply.code(400).send({ error: "Can't remove the owner." });

    await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId } });
    await writeAudit({ actorId: user.id, action: "workspace.member_remove", targetType: "user", targetId: userId });
    return { ok: true };
  });

  app.post("/api/v1/workspace/transfer", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws) return reply.code(404).send({ error: "No workspace." });
    if (ws.ownerId !== user.id) return reply.code(403).send({ error: "Only the owner can transfer ownership." });

    const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid user." });
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: parsed.data.userId } },
    });
    if (!target) return reply.code(404).send({ error: "Not a workspace member." });

    await prisma.$transaction([
      prisma.workspace.update({ where: { id: ws.id }, data: { ownerId: parsed.data.userId } }),
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: ws.id, userId: parsed.data.userId } },
        data: { role: "ADMIN", deactivatedAt: null },
      }),
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
        data: { role: "ADMIN" },
      }),
    ]);
    await writeAudit({ actorId: user.id, action: "workspace.transfer", targetType: "user", targetId: parsed.data.userId });
    return { ok: true };
  });

  app.get("/api/v1/workspace/audit", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;

    const { action } = req.query as { action?: string };
    const docIds = (
      await prisma.document.findMany({ where: { workspaceId: ws.id }, select: { id: true } })
    ).map((d) => d.id);

    const events = await prisma.auditEvent.findMany({
      where: {
        OR: [{ documentId: { in: docIds } }, { targetType: "workspace", targetId: ws.id }],
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const actorIds = [...new Set(events.map((e) => e.actorId))];
    const eventDocIds = [...new Set(events.map((e) => e.documentId).filter((x): x is string => Boolean(x)))];
    const [actors, docs] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }),
      prisma.document.findMany({ where: { id: { in: eventDocIds } }, select: { id: true, title: true } }),
    ]);
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const docById = new Map(docs.map((d) => [d.id, d]));
    return {
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        documentTitle: e.documentId ? docById.get(e.documentId)?.title ?? null : null,
        metadata: e.metadata,
        createdAt: e.createdAt,
        actor: actorById.get(e.actorId) ?? null,
      })),
    };
  });
}
