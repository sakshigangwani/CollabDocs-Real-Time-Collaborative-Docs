import OpenAI from "openai";

const key = process.env.OPENAI_API_KEY;
const client = key ? new OpenAI({ apiKey: key }) : null;

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

export function isAiConfigured() {
  return client !== null;
}

function getClient(): OpenAI {
  if (!client) throw new Error("The AI assistant is not configured.");
  return client;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

export async function complete(
  system: string,
  user: string,
  { maxTokens = 800, temperature = 0.2 } = {},
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: CHAT_MODEL,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}
