import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { DocRole } from "@prisma/client";
import { prisma } from "../db.js";
import { getDocRole, roleAtLeast } from "../permissions.js";
import { writeAudit } from "../audit.js";
import { CHAT_MODEL, complete, isAiConfigured } from "../ai.js";
import { TOP_K, embedDocument, isStale, retrieve, type Span } from "../rag.js";

export const aiRateLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

const ASK_SYSTEM = `You are a research assistant answering questions about the user's own documents.

You are given numbered excerpts from those documents. Follow these rules exactly:
- Answer ONLY from the excerpts. Never use outside knowledge.
- Cite every claim with bracketed excerpt numbers like [1] or [2][5]. Put the citation right after the sentence it supports.
- Never cite a number that is not in the excerpts.
- If the excerpts do not contain the answer, reply exactly: "I couldn't find that in your documents." and cite nothing.
- Be concise. Prefer 1-4 sentences unless the question needs a list.`;

const ACTIONS = {
  rewrite: "Rewrite the text so it is clearer and reads better. Keep the meaning and roughly the length.",
  summarize: "Summarise the text in at most three sentences.",
  grammar: "Fix spelling, grammar and punctuation. Change nothing else.",
  shorten: "Make the text noticeably shorter while keeping every key point.",
  lengthen: "Expand the text with more detail and explanation, keeping the same voice.",
  professional: "Rewrite the text in a professional, businesslike tone.",
  friendly: "Rewrite the text in a warm, friendly, conversational tone.",
  translate: "Translate the text into the requested language.",
} as const;

type ActionKey = keyof typeof ACTIONS;

const ACTION_SYSTEM = `You are a careful writing assistant embedded in a document editor.
Return ONLY the resulting text. No preamble, no explanation, no quotation marks around the whole answer, no markdown code fences.`;

async function requireDoc(
  userId: string,
  documentId: string,
  min: DocRole,
  reply: FastifyReply,
): Promise<DocRole | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true },
  });
  if (!doc) {
    reply.code(404).send({ error: "Document not found." });
    return null;
  }
  const role = await getDocRole(userId, documentId);
  if (!roleAtLeast(role, "VIEWER")) {
    reply.code(404).send({ error: "Document not found." });
    return null;
  }
  if (!roleAtLeast(role, min)) {
    reply.code(403).send({ error: "You don't have permission to do that." });
    return null;
  }
  return role;
}

function buildContext(spans: Span[]) {
  return spans
    .map((s, i) => `[${i + 1}] (from "${s.documentTitle}")\n${s.text}`)
    .join("\n\n");
}

function citedIndexes(answer: string, max: number) {
  const found = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= max) found.add(n);
  }
  return found;
}

export async function aiRoutes(app: FastifyInstance) {
  app.get("/api/v1/ai", async () => {
    return { configured: isAiConfigured(), model: isAiConfigured() ? CHAT_MODEL : null, topK: TOP_K };
  });

  app.post("/api/v1/documents/:id/ai/ask", aiRateLimit, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    if (!isAiConfigured()) {
      return reply.code(503).send({ error: "The AI assistant is not configured." });
    }
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "VIEWER", reply))) return;

    const parsed = z
      .object({
        question: z.string().min(1).max(1000),
        scope: z.enum(["document", "workspace"]).default("document"),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Ask a question first." });
    const { question, scope } = parsed.data;

    if (await isStale(id)) {
      await embedDocument(id).catch((err) => app.log.error(err, "embed failed"));
    }

    const spans = await retrieve(user.id, question, {
      documentId: scope === "document" ? id : undefined,
      limit: TOP_K,
    });

    if (spans.length === 0) {
      return {
        answer: "I couldn't find that in your documents.",
        citations: [],
        model: CHAT_MODEL,
        retrieved: 0,
      };
    }

    const answer = await complete(
      ASK_SYSTEM,
      `Excerpts:\n\n${buildContext(spans)}\n\nQuestion: ${question}`,
    );

    const used = citedIndexes(answer, spans.length);
    const citations = spans
      .map((span, i) => ({ ...span, n: i + 1 }))
      .filter((span) => used.has(span.n))
      .map((span) => ({
        n: span.n,
        documentId: span.documentId,
        documentTitle: span.documentTitle,
        ord: span.ord,
        text: span.text,
        similarity: Number(Number(span.similarity).toFixed(4)),
      }));

    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "ai.ask",
      targetType: "document",
      targetId: id,
      metadata: { scope, retrieved: spans.length, cited: citations.length, model: CHAT_MODEL },
    });

    return { answer, citations, model: CHAT_MODEL, retrieved: spans.length };
  });

  app.post("/api/v1/documents/:id/ai/action", aiRateLimit, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    if (!isAiConfigured()) {
      return reply.code(503).send({ error: "The AI assistant is not configured." });
    }
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "EDITOR", reply))) return;

    const parsed = z
      .object({
        action: z.enum(Object.keys(ACTIONS) as [ActionKey, ...ActionKey[]]),
        text: z.string().min(1).max(8000),
        language: z.string().min(1).max(40).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      const badAction = parsed.error.issues.some((i) => i.path[0] === "action");
      return reply
        .code(400)
        .send({ error: badAction ? "Unknown AI action." : "Select some text first." });
    }
    const { action, text, language } = parsed.data;

    if (action === "translate" && !language) {
      return reply.code(400).send({ error: "Choose a language to translate into." });
    }

    const instruction =
      action === "translate" ? `${ACTIONS.translate} Language: ${language}.` : ACTIONS[action];

    const result = await complete(ACTION_SYSTEM, `${instruction}\n\nText:\n${text}`, {
      temperature: 0.4,
      maxTokens: 1200,
    });

    await writeAudit({
      documentId: id,
      actorId: user.id,
      action: "ai.action",
      targetType: "document",
      targetId: id,
      metadata: { action, chars: text.length, model: CHAT_MODEL },
    });

    return { result, model: CHAT_MODEL };
  });

  app.post("/api/v1/documents/:id/ai/reindex", aiRateLimit, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    if (!isAiConfigured()) {
      return reply.code(503).send({ error: "The AI assistant is not configured." });
    }
    const { id } = req.params as { id: string };
    if (!(await requireDoc(user.id, id, "EDITOR", reply))) return;

    const result = await embedDocument(id, { force: true });
    return { ok: true, chunks: result.chunks };
  });
}
