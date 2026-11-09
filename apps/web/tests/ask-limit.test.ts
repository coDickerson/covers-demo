import { describe, expect, it } from 'vitest';
import { ASK_LIMITS, checkAskLimit, clientKey, counterFromEnv, MemoryCounter } from '../lib/ask-limit';

const day = new Date('2026-11-09T12:00:00Z');
const run = async (c: MemoryCounter, n: number, who: (i: number) => { client: string; sessionId: string }) => {
  let last: string | null = null;
  for (let i = 0; i < n; i++) last = await checkAskLimit(c, who(i), day);
  return last;
};

describe('audit log question limits', () => {
  it('stops a session at its limit', async () => {
    const c = new MemoryCounter();
    expect(await run(c, ASK_LIMITS.perSession, () => ({ client: 'a', sessionId: 's' }))).toBeNull();
    expect(await checkAskLimit(c, { client: 'a', sessionId: 's' }, day)).toMatch(/session/);
  });

  it('still stops someone who clears their cookie for a new session', async () => {
    const c = new MemoryCounter();
    expect(await run(c, ASK_LIMITS.perClientPerDay, (i) => ({ client: 'a', sessionId: `s${i}` }))).toBeNull();
    expect(await checkAskLimit(c, { client: 'a', sessionId: 'fresh' }, day)).toMatch(/You have reached/);
  });

  it('stops everyone at the daily limit, and resets the next day', async () => {
    const c = new MemoryCounter();
    expect(await run(c, ASK_LIMITS.perDay, (i) => ({ client: `c${i}`, sessionId: `s${i}` }))).toBeNull();
    expect(await checkAskLimit(c, { client: 'new', sessionId: 'new' }, day)).toMatch(/today’s limit/);
    expect(await checkAskLimit(c, { client: 'new', sessionId: 'new2' }, new Date('2026-11-10T12:00:00Z'))).toBeNull();
  });

  it('does not let one visitor use up the site-wide limit', async () => {
    const c = new MemoryCounter();
    await run(c, ASK_LIMITS.perDay * 2, (i) => ({ client: 'a', sessionId: `s${i}` }));
    expect(await checkAskLimit(c, { client: 'someone-else', sessionId: 'new' }, day)).toBeNull();
  });

  it('turns questions off on a deployment without a shared store', () => {
    expect(counterFromEnv({ VERCEL: '1' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(counterFromEnv({} as unknown as NodeJS.ProcessEnv)).not.toBeNull();
  });

  it('never keeps the raw address', () => {
    const key = clientKey(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(key).not.toContain('203');
    expect(key).toBe(clientKey(new Headers({ 'x-real-ip': '203.0.113.7' })));
  });
});
