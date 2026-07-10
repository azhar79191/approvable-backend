import Redis from "ioredis";
import { env } from "./env";

// Lazy initialize Redis connection only when needed
let _redisConnection: Redis | null = null;

export function getRedisConnection(): Redis | null {
  if (!_redisConnection) {
    try {
      _redisConnection = new Redis(env.redisUrl, {
        maxRetriesPerRequest: null, // required by BullMQ
        retryStrategy: (times) => {
          // Only retry a few times, then stop to avoid spamming errors
          if (times > 3) return null;
          return Math.min(times * 500, 2000);
        }
      });

      _redisConnection.on("error", (err) => {
        // eslint-disable-next-line no-console
        console.warn("[redis] connection error:", err.message);
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[redis] failed to initialize connection:", (err as Error).message);
      return null;
    }
  }
  return _redisConnection;
}

/**
 * BullMQ bundles its own copy of ioredis, which can have a structurally
 * different (if version-mismatched) `Redis` type than the one used here.
 * Passing plain connection options avoids that type conflict entirely and
 * lets each Queue/Worker manage its own client internally.
 */
const parsedUrl = new URL(env.redisUrl);
export const bullConnectionOptions = {
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port || 6379),
  password: parsedUrl.password || undefined,
  tls: parsedUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null as null,
};
