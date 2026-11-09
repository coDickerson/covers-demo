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

/** Upserts many documents in one statement. Only call inside gateway.write. */
export async function putDocs(tx: Tx, sessionId: string, rows: { kind: string; id: string; data: unknown }[]): Promise<void> {
  if (rows.length === 0) return;
  // Last write wins within one batch, like sequential putDoc calls.
  const unique = [...new Map(rows.map((r) => [`${r.kind}\u0000${r.id}`, r])).values()];
  const values = unique.map((r) => ({ session_id: sessionId, kind: r.kind, id: r.id, data: tx.json(r.data as never) }));
  await tx`
    insert into docs ${tx(values, 'session_id', 'kind', 'id', 'data')}
    on conflict (session_id, kind, id) do update set data = excluded.data, updated_at = now()`;
}

/** Reads the documents with this id across several kinds in one query. Kinds with no document are absent from the map. */
export async function getDocsById(sql: Sql | Tx, sessionId: string, kinds: string[], id: string): Promise<Map<string, unknown>> {
  const rows = await sql<{ kind: string; data: unknown }[]>`
    select kind, data from docs where session_id = ${sessionId} and id = ${id} and kind = any(${kinds})`;
  return new Map(rows.map((r) => [r.kind, r.data]));
}

/** Reads every document of the given kinds in one query, grouped by kind. */
export async function loadKinds(sql: Sql | Tx, sessionId: string, kinds: string[]): Promise<Map<string, unknown[]>> {
  const rows = await sql<{ kind: string; data: unknown }[]>`
    select kind, data from docs where session_id = ${sessionId} and kind = any(${kinds}) order by kind, id`;
  const out = new Map<string, unknown[]>(kinds.map((k) => [k, []]));
  for (const r of rows) out.get(r.kind)!.push(r.data);
  return out;
}

async function copySeed(tx: Tx, sessionId: string, seed: Seed) {
  await putDocs(tx, sessionId, Object.entries(seed).flatMap(([kind, rows]) => rows.map((r) => ({ kind, id: r.id, data: r.data }))));
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
