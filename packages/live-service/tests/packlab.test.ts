// Pack lab end to end with a stub compiler (no model). Needs TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { connect, LiveService, migrate, pastDinners, type PackCompilerPort, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;
const weekendCompiler = (extra: Partial<Awaited<ReturnType<PackCompilerPort['compile']>>['output']> = {}): PackCompilerPort => ({
  async compile() {
    return {
      model: 'stub', promptVersion: 'test',
      output: {
        name: 'Weekend dinners', citationLabel: 'Halden Medical policy (fictional)', conflictsWithExisting: [], unsupported: null,
        rules: [{ id: 'weekend', when: [{ field: 'dayOfWeek', op: 'in', values: ['sat', 'sun'] }], outcome: 'flag', message: 'Weekend dinners need manager approval.' }],
        tests: [
          { name: 'Saturday dinner', facts: { dayOfWeek: 'sat', localHour: 19, estimatedPerPersonCents: 9000, inviteeCount: 5, employeeCount: 1, headcount: 7, topic: 't', venue: 'v' }, expected: 'flag' },
          { name: 'Thursday dinner', facts: { dayOfWeek: 'thu', localHour: 19, estimatedPerPersonCents: 9000, inviteeCount: 5, employeeCount: 1, headcount: 7, topic: 't', venue: 'v' }, expected: 'pass' },
        ],
        ...extra,
      },
    };
  },
});

describe('past dinners', () => {
  it('has 20 dinners including weekends', () => {
    const d = pastDinners();
    expect(d).toHaveLength(20);
    expect(new Set(d.map((p) => p.id)).size).toBe(20);
  });
});

describe.skipIf(!url)('Pack lab', () => {
  let sql: Sql;
  beforeAll(async () => { sql = connect(url!); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });
  const sid = () => `pl-${crypto.randomUUID()}`;

  it('compiles, replays, is promoted by compliance, and changes the next weekend plan', async () => {
    const svc = new LiveService({ sql, compiler: weekendCompiler() });
    const s = sid(); const rep = { sessionId: s, actorId: IDS.rep }; const cmp = { sessionId: s, actorId: IDS.compliance };
    const { pack, tests } = await svc.compilePack(rep, 'Weekend dinners need manager approval');
    expect(pack).toMatchObject({ id: 'P7', status: 'draft' });
    expect(tests.every((t) => t.passed)).toBe(true);

    await expect(svc.promotePack(cmp, 'P7')).rejects.toMatchObject({ code: 'invalid_state' }); // replay first
    const diff = await svc.replayPack(cmp, 'P7');
    expect(diff.mealsReplayed).toBe(20);
    expect(diff.changed.length).toBeGreaterThan(0);
    expect(diff.changed.every((c) => c.why.includes('Weekend'))).toBe(true);

    await expect(svc.promotePack(rep, 'P7')).rejects.toMatchObject({ code: 'forbidden' });
    expect((await svc.promotePack(cmp, 'P7')).status).toBe('live');

    const { plan } = await svc.getPlan(rep, IDS.demoPlan);
    await svc.updatePlan(rep, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane), date: '2026-11-14T19:00:00-08:00' });
    const ev = await svc.evaluatePlan(rep, IDS.demoPlan);
    expect(ev.status).toBe('needs_approval');
    expect(ev.checks.find((c) => c.packId === 'P7')?.outcome).toBe('flag');
  });

  it('blocks promotion when the rule would loosen an existing pack or a test fails', async () => {
    const svc = new LiveService({ sql, compiler: weekendCompiler({ conflictsWithExisting: [{ packId: 'P3', reason: 'raises the $125 cap' }] }) });
    const cmp = { sessionId: sid(), actorId: IDS.compliance };
    const { pack, tests } = await svc.compilePack(cmp, 'Dinners up to $200 are fine');
    expect(tests.find((t) => t.name.startsWith('No conflicts'))?.passed).toBe(false);
    await svc.replayPack(cmp, pack.id);
    await expect(svc.promotePack(cmp, pack.id)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('refuses to compile without a compiler configured', async () => {
    const svc = new LiveService({ sql });
    await expect(svc.compilePack({ sessionId: sid(), actorId: IDS.compliance }, 'x')).rejects.toMatchObject({ code: 'invalid_state' });
  });
});
