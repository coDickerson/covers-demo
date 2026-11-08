// LiveService with a fake Ramp: real funds when cleared, lock on edit, reuse on re-clear, memo after dinner,
// and a labeled simulated fallback when Ramp fails. Needs TEST_DATABASE_URL; skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { connect, LiveService, migrate, type RampPort, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;

function fakeRamp(opts: { failCreate?: boolean; charges?: boolean } = {}) {
  const log: string[] = [];
  const memos: string[] = [];
  let n = 0;
  const ramp: RampPort = {
    async createFund(i) {
      if (opts.failCreate) throw new Error('Ramp down');
      n += 1; log.push(`create ${i.limitCents}`);
      return { fundId: `fund-${n}`, cardId: `card-${n}`, lastFour: '1273', ownerUserId: 'u-biz' };
    },
    async lock(id) { log.push(`lock ${id}`); },
    async unlock(id) { log.push(`unlock ${id}`); },
    async transactions() { return opts.charges === false ? [] : [{ id: 'tx-1', amountCents: 61_200, state: 'CLEARED' }]; },
    async setMemo(_tx, memo) { memos.push(memo); },
  };
  return { ramp, log, memos };
}

describe.skipIf(!url)('LiveService + Ramp', () => {
  let sql: Sql;
  beforeAll(async () => { sql = connect(url!); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });

  const ctx = () => ({ sessionId: `ramp-${crypto.randomUUID()}`, actorId: IDS.rep });
  const clear = async (svc: LiveService, c: ReturnType<typeof ctx>) => {
    const { plan } = await svc.getPlan(c, IDS.demoPlan);
    await svc.updatePlan(c, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((x) => x !== IDS.ruvane) });
    expect((await svc.evaluatePlan(c, IDS.demoPlan)).status).toBe('cleared');
  };

  it('issues a real Ramp fund for a cleared plan', async () => {
    const f = fakeRamp(); const svc = new LiveService({ sql, ramp: f.ramp }); const c = ctx();
    await clear(svc, c);
    const fund = await svc.issueFund(c, IDS.demoPlan);
    expect(fund).toEqual({ fundId: 'fund-1', limitCents: 87_500, simulated: false });
    expect(f.log).toEqual(['create 87500']);
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'fund.issued' && e.detail.includes('…1273'))).toBe(true);
  });

  it('locks the fund when the plan is edited, and unlocks the same fund when it clears again', async () => {
    const f = fakeRamp(); const svc = new LiveService({ sql, ramp: f.ramp }); const c = ctx();
    await clear(svc, c);
    await svc.issueFund(c, IDS.demoPlan);
    await svc.updatePlan(c, IDS.demoPlan, { venue: 'Elsewhere' });
    expect((await svc.evaluatePlan(c, IDS.demoPlan)).status).toBe('cleared');
    expect((await svc.issueFund(c, IDS.demoPlan)).fundId).toBe('fund-1');
    expect(f.log).toEqual(['create 87500', 'lock fund-1', 'unlock fund-1']);
  });

  it('creates a new fund and locks the old one when the cap changes', async () => {
    const f = fakeRamp(); const svc = new LiveService({ sql, ramp: f.ramp }); const c = ctx();
    await clear(svc, c);
    await svc.issueFund(c, IDS.demoPlan);
    await svc.updatePlan(c, IDS.demoPlan, { employeeCount: 2 });
    await svc.evaluatePlan(c, IDS.demoPlan);
    expect((await svc.issueFund(c, IDS.demoPlan))).toMatchObject({ fundId: 'fund-2', limitCents: 100_000 });
    expect(f.log).toEqual(['create 87500', 'lock fund-1', 'lock fund-1', 'create 100000']);
  });

  it('falls back to a simulated fund, and audits why, when Ramp fails', async () => {
    const f = fakeRamp({ failCreate: true }); const svc = new LiveService({ sql, ramp: f.ramp }); const c = ctx();
    await clear(svc, c);
    expect((await svc.issueFund(c, IDS.demoPlan)).simulated).toBe(true);
    const failed = (await svc.listAudit(c, { planId: IDS.demoPlan })).find((e) => e.action === 'ramp.failed');
    expect(failed?.detail).toContain('Ramp down');
  });

  it('writes the attendee memo onto the Ramp charge after the dinner', async () => {
    const f = fakeRamp(); const svc = new LiveService({ sql, ramp: f.ramp }); const c = ctx();
    await clear(svc, c);
    await svc.issueFund(c, IDS.demoPlan);
    await svc.submitReceipt(c, IDS.demoPlan, { sampleId: IDS.cleanReceipt });
    await svc.confirmAttendance(c, {
      planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery],
      employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
    });
    expect(f.memos).toHaveLength(1);
    expect(f.memos[0]).toContain('6 ate');
    expect(f.memos[0]).toContain('$102.00 per person');
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'ramp.memo_written')).toBe(true);
  });

  it('records when there is no charge yet instead of failing the settlement', async () => {
    const f = fakeRamp({ charges: false }); const svc = new LiveService({ sql, ramp: f.ramp }); const c = ctx();
    await clear(svc, c);
    await svc.issueFund(c, IDS.demoPlan);
    await svc.submitReceipt(c, IDS.demoPlan, { sampleId: IDS.cleanReceipt });
    const st = await svc.confirmAttendance(c, {
      planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor], employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
    });
    expect(st.headcount).toBe(3);
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'ramp.no_transaction')).toBe(true);
  });
});
