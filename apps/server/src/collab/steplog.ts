import type Redis from "ioredis";
import { createRedis } from "../redis.js";

// One accepted step, as JSON, tagged with the client that authored it.
export type StepEntry = { step: unknown; clientID: number };

// Messages fanned out between server instances that hold the same document.
export type BusMessage =
  | { kind: "steps"; from: number; entries: StepEntry[] }
  | { kind: "presence"; peer: unknown }
  | { kind: "leave"; clientID: number };

export type BusHandler = (docId: string, origin: string, msg: BusMessage) => void;

// The step log is the single source of ordering for a document. An instance
// may only append when it is at the log's head version, which is what makes
// the server an OT authority: every accepted step was validated against
// exactly the document state it will be applied to everywhere.
export interface StepLog {
  // Makes sure the log's head is at least `version` (the version persisted in Postgres).
  init(docId: string, version: number): Promise<void>;
  // Appends `entries` if the head is `version`; returns false if someone else got there first.
  append(docId: string, version: number, entries: StepEntry[]): Promise<boolean>;
  // Entries from `version` to the head, or null if they are no longer retained.
  since(docId: string, version: number): Promise<StepEntry[] | null>;
  publish(docId: string, msg: BusMessage): Promise<void>;
  subscribe(docId: string): Promise<void>;
  unsubscribe(docId: string): Promise<void>;
  onMessage(handler: BusHandler): void;
  close(): Promise<void>;
}

// Steps kept per document for reconnecting clients, cross-instance catch-up and
// comment-anchor mapping. Postgres is persisted every few seconds, so this only
// has to cover the unpersisted tail plus clients that were briefly offline.
const RETAIN = 10000;

class MemoryStepLog implements StepLog {
  private logs = new Map<string, { head: number; entries: StepEntry[] }>();

  async init(docId: string, version: number) {
    const log = this.logs.get(docId);
    if (!log || log.head < version) this.logs.set(docId, { head: version, entries: [] });
  }

  async append(docId: string, version: number, entries: StepEntry[]) {
    const log = this.logs.get(docId);
    if (!log || log.head !== version) return false;
    log.entries.push(...entries);
    log.head += entries.length;
    if (log.entries.length > RETAIN) log.entries.splice(0, log.entries.length - RETAIN);
    // Keep recently used documents at the end so the oldest can be evicted.
    this.logs.delete(docId);
    this.logs.set(docId, log);
    if (this.logs.size > 1000) this.logs.delete(this.logs.keys().next().value!);
    return true;
  }

  async since(docId: string, version: number) {
    const log = this.logs.get(docId);
    if (!log) return null;
    const first = log.head - log.entries.length;
    if (version < first || version > log.head) return null;
    return log.entries.slice(version - first);
  }

  async publish() {}
  async subscribe() {}
  async unsubscribe() {}
  onMessage() {}
  async close() {}
}

const TTL_SECONDS = 7 * 24 * 3600;

// KEYS: head, log, channel. ARGV: expected version, publish payload, retain, ttl, ...entries.
// Returns {1, newHead} on success or {0, head} when the caller is stale.
const APPEND = `
local head = tonumber(redis.call('GET', KEYS[1]) or '-1')
if head ~= tonumber(ARGV[1]) then return {0, head} end
local n = #ARGV - 4
for i = 5, #ARGV do redis.call('RPUSH', KEYS[2], ARGV[i]) end
redis.call('LTRIM', KEYS[2], -tonumber(ARGV[3]), -1)
redis.call('SET', KEYS[1], head + n, 'EX', ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('PUBLISH', KEYS[3], ARGV[2])
return {1, head + n}
`;

// KEYS: head, log. ARGV: version persisted in Postgres, ttl.
const INIT = `
local head = tonumber(redis.call('GET', KEYS[1]) or '-1')
if head < tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[2])
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
end
return 1
`;

// KEYS: head, log. ARGV: version. Returns {head, entries...} or {-1} if not retained.
const SINCE = `
local head = tonumber(redis.call('GET', KEYS[1]) or '-1')
local len = redis.call('LLEN', KEYS[2])
local v = tonumber(ARGV[1])
if head < 0 or v > head or v < head - len then return {-1} end
local out = redis.call('LRANGE', KEYS[2], v - (head - len), -1)
table.insert(out, 1, head)
return out
`;

class RedisStepLog implements StepLog {
  private handlers: BusHandler[] = [];

  constructor(
    private cmd: Redis,
    private sub: Redis,
    private origin: string,
  ) {
    sub.on("messageBuffer", (channel: Buffer, message: Buffer) => {
      const docId = channel.toString().slice(PREFIX.length, -CHANNEL.length);
      let parsed: { origin: string; msg: BusMessage };
      try {
        parsed = JSON.parse(message.toString());
      } catch {
        return;
      }
      if (parsed.origin === this.origin) return;
      for (const h of this.handlers) h(docId, parsed.origin, parsed.msg);
    });
  }

  private keys(docId: string) {
    const base = `${PREFIX}${docId}`;
    return { head: `${base}:head`, log: `${base}:log`, channel: `${base}${CHANNEL}` };
  }

  async init(docId: string, version: number) {
    const k = this.keys(docId);
    await this.cmd.eval(INIT, 2, k.head, k.log, version, TTL_SECONDS);
  }

  async append(docId: string, version: number, entries: StepEntry[]) {
    const k = this.keys(docId);
    const payload = JSON.stringify({ origin: this.origin, msg: { kind: "steps", from: version, entries } });
    const [ok] = (await this.cmd.eval(
      APPEND, 3, k.head, k.log, k.channel,
      version, payload, RETAIN, TTL_SECONDS,
      ...entries.map((e) => JSON.stringify(e)),
    )) as [number, number];
    return ok === 1;
  }

  async since(docId: string, version: number) {
    const k = this.keys(docId);
    const out = (await this.cmd.eval(SINCE, 2, k.head, k.log, version)) as (string | number)[];
    if (out[0] === -1) return null;
    return out.slice(1).map((e) => JSON.parse(e as string) as StepEntry);
  }

  async publish(docId: string, msg: BusMessage) {
    await this.cmd.publish(this.keys(docId).channel, JSON.stringify({ origin: this.origin, msg }));
  }

  async subscribe(docId: string) {
    await this.sub.subscribe(this.keys(docId).channel);
  }

  async unsubscribe(docId: string) {
    await this.sub.unsubscribe(this.keys(docId).channel);
  }

  onMessage(handler: BusHandler) {
    this.handlers.push(handler);
  }

  async close() {
    this.sub.disconnect();
    this.cmd.disconnect();
  }
}

const PREFIX = "collabdocs:ot:";
const CHANNEL = ":bus";

export function createStepLog(origin: string): StepLog {
  const cmd = createRedis("ot-cmd");
  const sub = createRedis("ot-sub");
  if (!cmd || !sub) return new MemoryStepLog();
  return new RedisStepLog(cmd, sub, origin);
}
