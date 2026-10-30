import { createRedis } from "./redis.js";

export const rateLimitRedis = createRedis("ratelimit", {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

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
