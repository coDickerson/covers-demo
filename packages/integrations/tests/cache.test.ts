import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cachedRamp, cachedReader, cacheModeFrom, CacheMissError, createCache } from '../src/cache';

const dir = () => mkdtempSync(join(tmpdir(), 'covers-cache-'));

describe('cache mode', () => {
  it('parses COVERS_CACHE', () => {
    expect(cacheModeFrom('1')).toBe('replay');
    expect(cacheModeFrom('record')).toBe('record');
    expect(cacheModeFrom('0')).toBe('off');
    expect(cacheModeFrom(undefined)).toBe('off');
  });

  it('records once, then replays the same value without calling out', async () => {
    const d = dir();
    let calls = 0;
    const call = async () => { calls += 1; return { lines: 3 }; };
    expect(await createCache({ mode: 'record', dir: d }).read('x', { b: 1, a: 2 }, call)).toEqual({ lines: 3 });
    const replays: string[] = [];
    const replay = createCache({ mode: 'replay', dir: d, onReplay: (ns) => replays.push(ns) });
    expect(await replay.read('x', { a: 2, b: 1 }, call)).toEqual({ lines: 3 }); // key order does not matter
    expect(calls).toBe(1);
    expect(replays).toEqual(['x']);
  });

  it('fails loudly on a replay miss instead of calling the network', async () => {
    let calls = 0;
    await expect(createCache({ mode: 'replay', dir: dir() }).read('x', 1, async () => { calls += 1; return 1; })).rejects.toBeInstanceOf(CacheMissError);
    expect(calls).toBe(0);
  });

  it('off mode always calls and writes nothing', async () => {
    const d = dir();
    let calls = 0;
    const c = createCache({ mode: 'off', dir: d });
    await c.read('x', 1, async () => { calls += 1; return 1; });
    await c.read('x', 1, async () => { calls += 1; return 1; });
    expect(calls).toBe(2);
    expect(readdirSync(d)).toEqual([]);
  });

  it('replays receipt reads by image hash and model', async () => {
    const d = dir();
    const inner = { model: 'm', read: async () => ({ totalCents: 61_200 }) };
    await cachedReader(inner, createCache({ mode: 'record', dir: d }), (b) => `h-${b}`).read({ base64: 'IMG', mime: 'image/png' });
    const dead = { model: 'm', read: async () => { throw new Error('network'); } };
    expect(await cachedReader(dead, createCache({ mode: 'replay', dir: d }), (b) => `h-${b}`).read({ base64: 'IMG', mime: 'image/jpeg' })).toEqual({ totalCents: 61_200 });
  });

  it('Ramp: funds replay across sessions; writes are skipped in replay', async () => {
    const d = dir();
    const log: string[] = [];
    const live = {
      createFund: async () => { log.push('create'); return { fundId: 'f1', cardId: 'c1', lastFour: '5699', ownerUserId: 'u' }; },
      lock: async () => { log.push('lock'); }, unlock: async () => { log.push('unlock'); },
      transactions: async () => [], setMemo: async () => { log.push('memo'); }, attachReceipt: async () => 'r1',
    };
    await cachedRamp(live, createCache({ mode: 'record', dir: d })).createFund({ displayName: 'Dinner', limitCents: 87_500, idempotencyKey: 'session-A' });
    const replay = cachedRamp(live, createCache({ mode: 'replay', dir: d }));
    expect((await replay.createFund({ displayName: 'Dinner', limitCents: 87_500, idempotencyKey: 'session-B' })).fundId).toBe('f1');
    await replay.lock('f1'); await replay.setMemo('t', 'm');
    expect(await replay.attachReceipt({ transactionId: 't', userId: 'u', bytes: new Uint8Array(), mime: 'image/png', idempotencyKey: 'k' })).toBe('replayed-receipt');
    expect(log).toEqual(['create']);
  });
});
