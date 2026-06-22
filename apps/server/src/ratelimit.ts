import Redis from "ioredis";

export const rateLimitRedis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
    })
  : undefined;

export const rateLimitOptions = {
  global: true,
  max: 300,
  timeWindow: "1 minute",
  ...(rateLimitRedis ? { redis: rateLimitRedis } : {}),
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: "Too many requests. Please slow down.",
  }),
};

export const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
