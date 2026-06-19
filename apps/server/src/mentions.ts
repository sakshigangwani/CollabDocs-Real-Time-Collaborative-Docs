const MENTION_RE = /@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)/g;

export function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    ids.add(match[1]);
  }
  return [...ids];
}
