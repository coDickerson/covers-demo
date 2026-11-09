// Spending limits for audit log questions. Each question costs real API money and the site is a public link, so the
// counts live in a shared store a visitor cannot reset. See docs/decisions.md (Mon Nov 9).
import { createHash } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import { redisFromEnv } from './store';

export { HISTORY_LIMITS } from './ask-limits';
export const ASK_LIMITS = { perDay: 200, perClientPerDay: 40, perSession: 20 };
const TTL_SECONDS = 60 * 60 * 48;

export interface Counter { bump(keys: string[], ttlSeconds: number): Promise<number[]> }

export class RedisCounter implements Counter {
  constructor(private readonly redis: Redis) {}
  async bump(keys: string[], ttlSeconds: number): Promise<number[]> {
    const p = this.redis.pipeline();
    for (const k of keys) { p.incr(k); p.expire(k, ttlSeconds); }
    const results = await p.exec<number[]>();
    return results.filter((_, i) => i % 2 === 0);
  }
}

export class MemoryCounter implements Counter {
  private readonly counts = new Map<string, number>();
  async bump(keys: string[]): Promise<number[]> {
    return keys.map((k) => { const n = (this.counts.get(k) ?? 0) + 1; this.counts.set(k, n); return n; });
  }
}

const localCounter = new MemoryCounter();

/** Upstash when configured. Memory only on a laptop: a deployment without Upstash returns null, and questions stay off. */
export function counterFromEnv(env: NodeJS.ProcessEnv = process.env): Counter | null {
  const redis = redisFromEnv(env);
  if (redis) return new RedisCounter(redis);
  return env.VERCEL ? null : localCounter;
}

/** Vercel sets these headers itself. The address is hashed so it is never stored. */
export function clientKey(headers: Headers): string {
  const ip = headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

/** Counts this question. Returns the message to show if it is over any limit, otherwise null. */
export async function checkAskLimit(counter: Counter, who: { client: string; sessionId: string }, now = new Date()): Promise<string | null> {
  const day = now.toISOString().slice(0, 10);
  const [total, client, session] = await counter.bump([`covers:ask:day:${day}`, `covers:ask:client:${day}:${who.client}`, `covers:ask:session:${who.sessionId}`], TTL_SECONDS);
  if (total! > ASK_LIMITS.perDay) return 'Questions have reached today’s limit. Try again tomorrow.';
  if (client! > ASK_LIMITS.perClientPerDay) return 'You have reached today’s question limit. Try again tomorrow.';
  if (session! > ASK_LIMITS.perSession) return 'This session has used its questions.';
  return null;
}
