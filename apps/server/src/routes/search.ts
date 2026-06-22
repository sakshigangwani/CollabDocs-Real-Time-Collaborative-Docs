import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getUserWorkspaceIds } from "../permissions.js";

type SearchRow = {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: Date;
  snippet: string | null;
  isFavorite: boolean;
};

export async function searchRoutes(app: FastifyInstance) {
  app.get("/api/v1/search", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });

    const q = ((req.query as Record<string, string>).q ?? "").trim();
    const { mine, hasComments, favorites, within } = req.query as Record<string, string>;
    if (!q) return { results: [] };

    const workspaceIds = await getUserWorkspaceIds(user.id);
    const wsClause = workspaceIds.length
      ? Prisma.sql`OR (a."principalType" = 'WORKSPACE' AND a."principalId" IN (${Prisma.join(workspaceIds)}))`
      : Prisma.empty;

    const mineClause = mine
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "DocumentAcl" am WHERE am."documentId" = d.id AND am."principalType" = 'USER' AND am."principalId" = ${user.id} AND am.role = 'OWNER')`
      : Prisma.empty;
    const commentsClause = hasComments
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Comment" c WHERE c."documentId" = d.id AND c."deletedAt" IS NULL)`
      : Prisma.empty;
    const favClause = favorites
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Favorite" ff WHERE ff."userId" = ${user.id} AND ff."documentId" = d.id)`
      : Prisma.empty;
    const days = within === "7" ? 7 : within === "30" ? 30 : null;
    const withinClause = days
      ? Prisma.sql`AND d."updatedAt" > now() - make_interval(days => ${days})`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT d.id, d.title, d.icon, d."updatedAt",
        ts_headline('english', coalesce(d."searchText", ''), websearch_to_tsquery('english', ${q}),
          'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=16, FragmentDelimiter=" … "') AS snippet,
        EXISTS (SELECT 1 FROM "Favorite" f WHERE f."userId" = ${user.id} AND f."documentId" = d.id) AS "isFavorite"
      FROM "Document" d
      WHERE d."deletedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "DocumentAcl" a
          WHERE a."documentId" = d.id
            AND (a."expiresAt" IS NULL OR a."expiresAt" > now())
            AND ((a."principalType" = 'USER' AND a."principalId" = ${user.id}) ${wsClause})
        )
        ${mineClause}
        ${commentsClause}
        ${favClause}
        ${withinClause}
        AND (
          d."searchVector" @@ websearch_to_tsquery('english', ${q})
          OR word_similarity(${q}, d.title) > 0.4
          OR word_similarity(${q}, coalesce(d."searchText", '')) > 0.4
        )
      ORDER BY
        GREATEST(
          ts_rank(d."searchVector", websearch_to_tsquery('english', ${q})),
          word_similarity(${q}, d.title),
          word_similarity(${q}, coalesce(d."searchText", ''))
        ) DESC,
        d."updatedAt" DESC
      LIMIT 40
    `);

    return {
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        icon: r.icon,
        updatedAt: r.updatedAt,
        snippet: r.snippet || null,
        isFavorite: r.isFavorite,
      })),
    };
  });
}
