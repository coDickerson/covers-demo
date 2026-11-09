// Every query is a network round trip to a remote database. These budgets keep the demo's key clicks fast.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { IDS } from '@covers/contract/fixtures';
import { LiveService, migrate, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('query budget per action', () => {
  let n = 0;
  let sql: Sql;
  beforeAll(async () => { sql = postgres(url!, { max: 2, onnotice: () => {}, debug: () => { n++; }, prepare: !/:6543\//.test(url!) }); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });

  it('stays within budget through the scripted demo', async () => {
    const svc = new LiveService({ sql });
    const c = { sessionId: `qb-${crypto.randomUUID()}`, actorId: IDS.rep };
    const count = async (f: () => Promise<unknown>) => { n = 0; await f(); return n; };
    expect(await count(() => svc.listPlans(c))).toBeLessThanOrEqual(6); // first visit copies the seed
    expect(await count(() => svc.getPlan(c, IDS.demoPlan))).toBeLessThanOrEqual(2);
    expect(await count(() => svc.evaluatePlan(c, IDS.demoPlan))).toBeLessThanOrEqual(8);
    const { plan } = await svc.getPlan(c, IDS.demoPlan);
    expect(await count(() => svc.updatePlan(c, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((x) => x !== IDS.ruvane) }))).toBeLessThanOrEqual(5);
    await svc.evaluatePlan(c, IDS.demoPlan);
    expect(await count(() => svc.issueFund(c, IDS.demoPlan))).toBeLessThanOrEqual(6);
    expect(await count(() => svc.submitReceipt(c, IDS.demoPlan, { sampleId: IDS.cleanReceipt }))).toBeLessThanOrEqual(6);
    expect(await count(() => svc.confirmAttendance(c, {
      planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery], employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
    }))).toBeLessThanOrEqual(9);
    expect(await count(() => svc.getLedger(c))).toBeLessThanOrEqual(3);
  });
});
