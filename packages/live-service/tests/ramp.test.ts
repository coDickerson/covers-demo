// LiveService with a fake Ramp: real funds when cleared, lock on edit, reuse on re-clear, memo after dinner,
// and a labeled simulated fallback when Ramp fails. Needs TEST_DATABASE_URL; skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { connect, LiveService, migrate, type RampPort, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;

function fakeRamp(opts: { failCreate?: boolean; charges?: boolean } = {}) {
  const log: string[] = [];
  const memos: string[] = [];
  const keys = new Set<string>();
  let n = 0;
  const ramp: RampPort = {
    async createFund(i) {
      if (opts.failCreate) throw new Error('Ramp down');
      if (keys.has(i.idempotencyKey)) throw new Error('RampError: Idempotency key already exists'); // what the real sandbox does
      keys.add(i.idempotencyKey);
      n += 1; log.push(`create ${i.limitCents}`);
      return { fundId: `fund-${n}`, cardId: `card-${n}`, lastFour: '1273', ownerUserId: 'u-biz' };
    },
    async lock(id) { log.push(`lock ${id}`); },
    async unlock(id) { log.push(`unlock ${id}`); },
    async transactions() { return opts.charges === false ? [] : [{ id: 'tx-1', amountCents: 61_200, state: 'CLEARED', merchantName: 'Alder & Vine', categoryId: 19, categoryName: 'Restaurants' }]; },
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

  it('issues a real fund again after "Start this demo over" (a new idempotency key, not a simulated fallback)', async () => {
    const f = fakeRamp(); const svc = new LiveService({ sql, ramp: f.ramp }); const c = ctx();
    await clear(svc, c);
    expect((await svc.issueFund(c, IDS.demoPlan)).simulated).toBe(false);
    await svc.reset(c);
    await clear(svc, c);
    const again = await svc.issueFund(c, IDS.demoPlan);
    expect(again).toMatchObject({ fundId: 'fund-2', simulated: false });
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'ramp.failed')).toBe(false);
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
    // The dinner is over, so the card is locked after the memo is written: what's left on the fund can't be spent.
    expect(f.log.at(-1)).toBe('lock fund-1');
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'fund.locked' && e.detail.startsWith('Dinner closed out'))).toBe(true);
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
    expect(st.charge).toBeUndefined();
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'ramp.no_transaction')).toBe(true);
  });

  it('sets the "View in Ramp" link on a real fund', async () => {
    const f = fakeRamp(); const c = ctx();
    const svc = new LiveService({ sql, ramp: f.ramp, fundUrl: (id) => `https://demo.ramp.com/funds/${id}` });
    await clear(svc, c);
    expect(await svc.issueFund(c, IDS.demoPlan)).toEqual({ fundId: 'fund-1', limitCents: 87_500, rampUrl: 'https://demo.ramp.com/funds/fund-1', simulated: false });
  });

  const settleWith = async (svc: LiveService, c: ReturnType<typeof ctx>) => {
    await clear(svc, c);
    await svc.issueFund(c, IDS.demoPlan);
    await svc.submitReceipt(c, IDS.demoPlan, { sampleId: IDS.cleanReceipt });
    return svc.confirmAttendance(c, {
      planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery],
      employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
    });
  };

  it('records the Ramp charge on the settlement and checks it against the printed total', async () => {
    const st = await settleWith(new LiveService({ sql, ramp: fakeRamp().ramp }), ctx());
    expect(st.charge).toEqual({ amountCents: 61_200, source: 'ramp', transactionId: 'tx-1', merchantName: 'Alder & Vine', categoryId: 19, categoryName: 'Restaurants' });
    expect(st.checks.find((x) => x.ruleId === 'P6.card-charge')?.outcome).toBe('pass');
    expect(st.checks.find((x) => x.ruleId === 'P6.card-merchant')?.outcome).toBe('pass');
  });

  it('flags a card charge that does not match the receipt', async () => {
    const f = fakeRamp(); f.ramp.transactions = async () => [{ id: 'tx-2', amountCents: 64_000, state: 'CLEARED' }];
    const st = await settleWith(new LiveService({ sql, ramp: f.ramp }), ctx());
    const check = st.exceptions.find((x) => x.ruleId === 'P6.card-charge');
    expect(check?.outcome).toBe('flag');
    expect(check?.message).toContain('$640');
  });

  it('flags a dinner charge that was not at a restaurant', async () => {
    const f = fakeRamp(); f.ramp.transactions = async () => [{ id: 'tx-3', amountCents: 61_200, state: 'CLEARED', merchantName: '305 Fitness', categoryId: 15, categoryName: 'Clothing' }];
    const st = await settleWith(new LiveService({ sql, ramp: f.ramp }), ctx());
    const check = st.exceptions.find((x) => x.ruleId === 'P6.card-merchant');
    expect(check?.outcome).toBe('flag');
    expect(check?.message).toContain('305 Fitness');
  });

  it('with several charges on the card, uses the one closest to the printed total and logs the choice', async () => {
    const f = fakeRamp();
    f.ramp.transactions = async () => [
      { id: 'tx-a', amountCents: 2_311, state: 'CLEARED', categoryId: 31 },
      { id: 'tx-b', amountCents: 61_150, state: 'CLEARED', categoryId: 19 },
      { id: 'tx-c', amountCents: 61_200, state: 'DECLINED', categoryId: 19 },
    ];
    const c = ctx();
    const svc = new LiveService({ sql, ramp: f.ramp });
    const st = await settleWith(svc, c);
    expect(st.charge?.transactionId).toBe('tx-b');
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'ramp.charge_chosen')).toBe(true);
  });

  it('without Ramp, labels the printed total as a simulated charge', async () => {
    const st = await settleWith(new LiveService({ sql }), ctx());
    expect(st.charge).toEqual({ amountCents: 61_200, source: 'simulated' });
    expect(st.checks.some((x) => x.ruleId === 'P6.card-charge')).toBe(false);
  });
});

describe.skipIf(!url)('LiveService: the close-out notice (checkForCharge)', () => {
  let sql: Sql;
  beforeAll(async () => { sql = connect(url!); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });

  it('is null until the card is charged, then records the charge once and shows it on getPlan', async () => {
    let charged = false;
    const f = fakeRamp();
    f.ramp.transactions = async () => (charged ? [{ id: 'tx-9', amountCents: 61_200, state: 'CLEARED', merchantName: 'Alder & Vine' }] : []);
    const svc = new LiveService({ sql, ramp: f.ramp });
    const c = { sessionId: `charge-${crypto.randomUUID()}`, actorId: IDS.rep };
    const { plan } = await svc.getPlan(c, IDS.demoPlan);
    await svc.updatePlan(c, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((x) => x !== IDS.ruvane) });
    await svc.evaluatePlan(c, IDS.demoPlan);
    expect(await svc.checkForCharge(c, IDS.demoPlan)).toBeNull(); // no card yet
    await svc.issueFund(c, IDS.demoPlan);
    expect(await svc.checkForCharge(c, IDS.demoPlan)).toBeNull(); // card, no charge
    expect((await svc.getPlan(c, IDS.demoPlan)).closeOut).toBeNull();

    charged = true;
    const seen = await svc.checkForCharge(c, IDS.demoPlan);
    expect(seen).toMatchObject({ chargedCents: 61_200, merchantName: 'Alder & Vine', transactionId: 'tx-9' });
    expect(await svc.checkForCharge(c, IDS.demoPlan)).toEqual(seen); // same record, not a new one
    expect((await svc.getPlan(c, IDS.demoPlan)).closeOut).toEqual(seen);
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).filter((e) => e.action === 'charge.seen')).toHaveLength(1);
  });

  it('is null for a simulated card', async () => {
    const svc = new LiveService({ sql });
    const c = { sessionId: `charge-${crypto.randomUUID()}`, actorId: IDS.rep };
    const { plan } = await svc.getPlan(c, IDS.demoPlan);
    await svc.updatePlan(c, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((x) => x !== IDS.ruvane) });
    await svc.evaluatePlan(c, IDS.demoPlan);
    expect((await svc.issueFund(c, IDS.demoPlan)).simulated).toBe(true);
    expect(await svc.checkForCharge(c, IDS.demoPlan)).toBeNull();
  });
});
