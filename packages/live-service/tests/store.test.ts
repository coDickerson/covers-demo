// Runs against a real Postgres. Set TEST_DATABASE_URL (e.g. postgres://localhost:5433/covers_test); skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditEvent } from '@covers/contract';
import { connect, ensureSession, getDoc, hashInput, listAudit, listDocs, migrate, putDoc, resetSession, write, type Seed, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;
const seed: Seed = { hcp: [{ id: 'n1', data: { name: 'Dr. A' } }, { id: 'n2', data: { name: 'Dr. B' } }], plan: [{ id: 'p1', data: { title: 'Dinner' } }] };
const ctx = (sessionId: string, actorId = 'rep-jordan') => ({ sessionId, actorId });
const sid = () => `test-${Math.random().toString(36).slice(2)}`;

describe.skipIf(!url)('live-service store (Postgres)', () => {
  let sql: Sql;
  beforeAll(async () => { sql = connect(url!); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });

  it('migrations are idempotent', async () => {
    expect(await migrate(sql)).toEqual([]);
  });

  it('first visit copies the seed once; later visits do not re-seed', async () => {
    const s = sid();
    expect(await ensureSession(sql, ctx(s), seed)).toBe(true);
    await write(sql, ctx(s), { action: 'plan.updated', planId: 'p1', input: { t: 'x' }, detail: 'edit' },
      (tx) => putDoc(tx, s, 'plan', 'p1', { title: 'Edited' }));
    expect(await ensureSession(sql, ctx(s), seed)).toBe(false);
    expect(await getDoc(sql, s, 'plan', 'p1')).toEqual({ title: 'Edited' });
    expect(await listDocs(sql, s, 'hcp')).toHaveLength(2);
  });

  it('concurrent first visits seed exactly once', async () => {
    const s = sid();
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureSession(sql, ctx(s), seed)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await listAudit(sql, s)).filter((e) => e.action === 'session.seeded')).toHaveLength(1);
  });

  it('sessions are isolated from each other', async () => {
    const a = sid(); const b = sid();
    await ensureSession(sql, ctx(a), seed); await ensureSession(sql, ctx(b), seed);
    await write(sql, ctx(a), { action: 'plan.updated', input: 1, detail: 'x' }, (tx) => putDoc(tx, a, 'plan', 'p1', { title: 'A only' }));
    expect(await getDoc(sql, b, 'plan', 'p1')).toEqual({ title: 'Dinner' });
    expect(await listAudit(sql, b)).toHaveLength(1);
  });

  it('reset re-seeds the data but keeps the audit history', async () => {
    const s = sid();
    await ensureSession(sql, ctx(s), seed);
    await write(sql, ctx(s), { action: 'plan.updated', input: 1, detail: 'x' }, (tx) => putDoc(tx, s, 'plan', 'p9', { title: 'New' }));
    await resetSession(sql, ctx(s), seed);
    expect(await getDoc(sql, s, 'plan', 'p9')).toBeNull();
    expect(await getDoc(sql, s, 'plan', 'p1')).toEqual({ title: 'Dinner' });
    expect((await listAudit(sql, s)).map((e) => e.action)).toEqual(['session.seeded', 'plan.updated', 'session.reset']);
  });

  it('the audit row is written first and rolls back with a failed mutation', async () => {
    const s = sid();
    await ensureSession(sql, ctx(s), seed);
    await expect(write(sql, ctx(s), { action: 'plan.updated', input: 1, detail: 'x' }, async (tx) => {
      const [row] = await tx<{ n: number }[]>`select count(*)::int as n from audit_events where session_id = ${s}`;
      expect(row?.n).toBe(2); // seed event + this one, already inserted before the mutation runs
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await listAudit(sql, s)).toHaveLength(1);
  });

  it('audit events cannot be updated or deleted', async () => {
    const s = sid();
    await ensureSession(sql, ctx(s), seed);
    await expect(sql`update audit_events set detail = 'tampered' where session_id = ${s}`).rejects.toThrow(/append-only/);
    await expect(sql`delete from audit_events where session_id = ${s}`).rejects.toThrow(/append-only/);
    expect(await listAudit(sql, s)).toHaveLength(1);
  });

  it('expired sessions are purged with their audit rows', async () => {
    const s = sid();
    await ensureSession(sql, ctx(s), seed);
    await sql`update sessions set expires_at = now() - interval '1 minute' where id = ${s}`;
    await sql`select purge_expired_sessions()`;
    expect(await listDocs(sql, s, 'hcp')).toEqual([]);
    expect(await listAudit(sql, s)).toEqual([]);
  });

  it('audit events match the contract and hash inputs stably', async () => {
    const s = sid();
    await ensureSession(sql, ctx(s), seed);
    for (const e of await listAudit(sql, s)) expect(() => AuditEvent.parse(e)).not.toThrow();
    expect(hashInput({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(hashInput({ a: [1, { d: 2 }], b: 1 }));
  });
});
