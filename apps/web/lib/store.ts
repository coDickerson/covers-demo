// Where FixtureService keeps each visitor's sandbox.
// Upstash Redis when its env vars are present (Vercel), plain memory otherwise (laptop, tests).
// Sessions expire after 24 hours either way.
import { Redis } from '@upstash/redis';

export const SESSION_TTL_SECONDS = 60 * 60 * 24;

export interface SessionStore {
  get<T>(sessionId: string): Promise<T | null>;
  set<T>(sessionId: string, value: T): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export class MemoryStore implements SessionStore {
  private readonly data = new Map<string, { json: string; expires: number }>();

  async get<T>(sessionId: string): Promise<T | null> {
    const hit = this.data.get(sessionId);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.data.delete(sessionId);
      return null;
    }
    return JSON.parse(hit.json) as T;
  }

  async set<T>(sessionId: string, value: T): Promise<void> {
    // Round-trip through JSON so memory behaves exactly like Redis (no shared references, no undefined).
    this.data.set(sessionId, { json: JSON.stringify(value), expires: Date.now() + SESSION_TTL_SECONDS * 1000 });
  }

  async delete(sessionId: string): Promise<void> {
    this.data.delete(sessionId);
  }
}

export class UpstashStore implements SessionStore {
  constructor(private readonly redis: Redis) {}
  private key = (sessionId: string) => `covers:fixture:${sessionId}`;

  async get<T>(sessionId: string): Promise<T | null> {
    return (await this.redis.get<T>(this.key(sessionId))) ?? null;
  }

  async set<T>(sessionId: string, value: T): Promise<void> {
    await this.redis.set(this.key(sessionId), value, { ex: SESSION_TTL_SECONDS });
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }
}

/** Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*. */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): SessionStore {
  const redis = redisFromEnv(env);
  return redis ? new UpstashStore(redis) : memoryStore();
}

export function redisFromEnv(env: NodeJS.ProcessEnv = process.env): Redis | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

// One memory store per server process, kept on globalThis so dev hot-reloads don't wipe sessions.
const g = globalThis as typeof globalThis & { __coversMemoryStore?: MemoryStore };
export function memoryStore(): MemoryStore {
  return (g.__coversMemoryStore ??= new MemoryStore());
}
