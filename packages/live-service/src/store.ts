// Session-scoped document store. Reads are direct; writes go through the gateway.
import type { Ctx } from '@covers/contract';
import type { Sql, Tx } from './db';
import { appendAudit, write } from './gateway';

/** Everything a new visitor starts with. Cole's packages/contract/fixtures will supply the real one. */
export type Seed = Record<string, { id: string; data: unknown }[]>;

export async function getDoc<T>(sql: Sql | Tx, sessionId: string, kind: string, id: string): Promise<T | null> {
  const [row] = await sql<{ data: T }[]>`select data from docs where session_id = ${sessionId} and kind = ${kind} and id = ${id}`;
  return row ? row.data : null;
}

export async function listDocs<T>(sql: Sql | Tx, sessionId: string, kind: string): Promise<T[]> {
  const rows = await sql<{ data: T }[]>`select data from docs where session_id = ${sessionId} and kind = ${kind} order by id`;
  return rows.map((r) => r.data);
}

/** Only call inside gateway.write, so the audit row exists first. */
export async function putDoc(tx: Tx, sessionId: string, kind: string, id: string, data: unknown): Promise<void> {
  await tx`
    insert into docs (session_id, kind, id, data) values (${sessionId}, ${kind}, ${id}, ${tx.json(data as never)})
    on conflict (session_id, kind, id) do update set data = excluded.data, updated_at = now()`;
}

async function copySeed(tx: Tx, sessionId: string, seed: Seed) {
  for (const [kind, rows] of Object.entries(seed)) {
    for (const r of rows) await putDoc(tx, sessionId, kind, r.id, r.data);
  }
}

/** First visit creates the session and copies the seed into it. Concurrent first visits seed once. Returns true if created. */
export async function ensureSession(sql: Sql, ctx: Ctx, seed: Seed): Promise<boolean> {
  return sql.begin(async (tx) => {
    const created = await tx`insert into sessions (id) values (${ctx.sessionId}) on conflict do nothing returning id`;
    if (created.length === 0) return false;
    await appendAudit(tx, ctx, { action: 'session.seeded', input: Object.keys(seed).sort(), detail: 'Session created from seed' });
    await copySeed(tx, ctx.sessionId, seed);
    return true;
  }) as Promise<boolean>;
}

/** Deletes the session's documents and re-seeds them. Audit history is kept (append-only). */
export async function resetSession(sql: Sql, ctx: Ctx, seed: Seed): Promise<void> {
  await write(sql, ctx, { action: 'session.reset', input: {}, detail: 'Session data deleted and re-seeded' }, async (tx) => {
    await tx`insert into sessions (id) values (${ctx.sessionId}) on conflict (id) do update set expires_at = now() + interval '24 hours'`;
    await tx`delete from docs where session_id = ${ctx.sessionId}`;
    await copySeed(tx, ctx.sessionId, seed);
  });
}
