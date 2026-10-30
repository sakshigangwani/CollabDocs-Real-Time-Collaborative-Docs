import Redis, { type RedisOptions } from "ioredis";

export const REDIS_URL = process.env.REDIS_URL;

export const isRedisConfigured = Boolean(REDIS_URL);

export function createRedis(connectionName: string, overrides: RedisOptions = {}) {
  if (!REDIS_URL) return undefined;
  return new Redis(REDIS_URL, {
    connectionName: `collabdocs:${connectionName}`,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...overrides,
  });
}
