// Cache mode (A9): record every outside call once, then replay with the network off.
//   COVERS_CACHE=record  → call for real and save each response under cache/<namespace>/<hash>.json
//   COVERS_CACHE=1       → never call out: reads come from disk (a miss is a loud error); writes are no-ops
//   COVERS_CACHE=0       → normal
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Hcp } from '@covers/contract';

export type CacheMode = 'off' | 'record' | 'replay';

export function cacheModeFrom(v: string | undefined): CacheMode {
  if (v === '1' || v === 'replay') return 'replay';
  if (v === 'record') return 'record';
  return 'off';
}

export class CacheMissError extends Error {
  constructor(public readonly namespace: string, public readonly key: unknown) {
    super(`No recorded response for ${namespace} ${JSON.stringify(key).slice(0, 160)}. Record it with COVERS_CACHE=record.`);
    this.name = 'CacheMissError';
  }
}

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
};

export function createCache(opts: { mode: CacheMode; dir: string; onReplay?: (namespace: string) => void }) {
  const file = (ns: string, key: unknown) =>
    join(opts.dir, ns, `${createHash('sha256').update(stable(key)).digest('hex').slice(0, 24)}.json`);

  return {
    mode: opts.mode,
    /** A read: recorded by key, replayed from disk. */
    async read<T>(ns: string, key: unknown, call: () => Promise<T>): Promise<T> {
      if (opts.mode === 'off') return call();
      const f = file(ns, key);
      if (opts.mode === 'replay') {
        if (!existsSync(f)) throw new CacheMissError(ns, key);
        opts.onReplay?.(ns);
        return (JSON.parse(readFileSync(f, 'utf8')) as { value: T }).value;
      }
      const value = await call();
      mkdirSync(join(opts.dir, ns), { recursive: true });
      writeFileSync(f, `${JSON.stringify({ namespace: ns, key, value, recordedAt: new Date().toISOString() }, null, 1)}\n`);
      return value;
    },
    /** A write with no meaningful response: performed normally, skipped in replay. */
    async write<T>(ns: string, call: () => Promise<T>, replayValue: T): Promise<T> {
      if (opts.mode === 'replay') { opts.onReplay?.(ns); return replayValue; }
      return call();
    },
  };
}
export type Cache = ReturnType<typeof createCache>;

// ---- Wrappers for each outside dependency (structural types, so this file stays dependency-light) ----

type Image = { base64: string; mime: string };

export function cachedReader<R>(inner: { model: string; read(img: Image): Promise<R> }, cache: Cache, hash: (b64: string) => string) {
  return { model: inner.model, read: (img: Image) => cache.read<R>('receipt-read', { model: inner.model, image: hash(img.base64) }, () => inner.read(img)) };
}

export function cachedCompiler<R>(inner: { model: string; compile(english: string, existing: { id: string; name: string; english: string }[]): Promise<R> }, cache: Cache) {
  return {
    model: inner.model,
    compile: (english: string, existing: { id: string; name: string; english: string }[]) =>
      cache.read<R>('pack-compile', { model: inner.model, english: english.trim(), existing }, () => inner.compile(english, existing)),
  };
}

export function cachedRegistrySearch(inner: (q: string) => Promise<Hcp[]>, cache: Cache) {
  return (q: string) => cache.read<Hcp[]>('nppes-search', q.trim().toLowerCase().replace(/\s+/g, ' '), () => inner(q));
}

type RampLike = {
  createFund(i: { displayName: string; limitCents: number; idempotencyKey: string }): Promise<{ fundId: string; cardId: string; lastFour: string; ownerUserId: string }>;
  lock(fundId: string): Promise<void>;
  unlock(fundId: string): Promise<void>;
  transactions(cardId: string): Promise<{ id: string; amountCents: number; state: string; merchantName: string; at: string }[]>;
  setMemo(transactionId: string, memo: string): Promise<void>;
  attachReceipt(i: { transactionId: string; userId: string; bytes: Uint8Array; mime: string; idempotencyKey: string }): Promise<string>;
};

export function cachedRamp(inner: RampLike, cache: Cache): RampLike {
  return {
    // Keyed without the idempotency key (it contains the visitor's session id) so any session replays the same fund.
    createFund: (i) => cache.read('ramp-create-fund', { displayName: i.displayName, limitCents: i.limitCents }, () => inner.createFund(i)),
    transactions: (cardId) => cache.read('ramp-transactions', cardId, () => inner.transactions(cardId)),
    lock: (id) => cache.write('ramp-lock', () => inner.lock(id), undefined),
    unlock: (id) => cache.write('ramp-unlock', () => inner.unlock(id), undefined),
    setMemo: (tx, memo) => cache.write('ramp-memo', () => inner.setMemo(tx, memo), undefined),
    attachReceipt: (i) => cache.write('ramp-receipt', () => inner.attachReceipt(i), 'replayed-receipt'),
  };
}

/** Stand-in for a client that must not be called (replay mode without credentials). */
export const offline = (what: string) => async (): Promise<never> => {
  throw new Error(`${what} is offline in replay mode (COVERS_CACHE=1).`);
};
