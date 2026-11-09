// Slack pings from LiveService: blocked before the dinner, cleared with the card, settled after it.
// A failing Slack never breaks a click. Needs TEST_DATABASE_URL; skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { connect, LiveService, migrate, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('LiveService + Slack pings', () => {
  let sql: Sql;
  beforeAll(async () => { sql = connect(url!); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });
  const ctx = () => ({ sessionId: `slack-${crypto.randomUUID()}`, actorId: IDS.rep });

  it('pings when the plan is blocked, when it clears with a card, and when it settles', async () => {
    const sent: string[] = [];
    const svc = new LiveService({ sql, notifier: { send: async (t) => { sent.push(t); } } });
    const c = ctx();
    await svc.evaluatePlan(c, IDS.demoPlan);
    const { plan } = await svc.getPlan(c, IDS.demoPlan);
    await svc.updatePlan(c, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
    await svc.evaluatePlan(c, IDS.demoPlan);
    await svc.issueFund(c, IDS.demoPlan);
    await svc.submitReceipt(c, IDS.demoPlan, { sampleId: IDS.cleanReceipt });
    await svc.confirmAttendance(c, {
      planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery],
      employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
    });
    expect(sent).toHaveLength(3);
    expect(sent[0]).toMatch(/^Blocked: /);
    expect(sent[0]).toContain('Ruvane');
    expect(sent[1]).toMatch(/^Cleared: /);
    expect(sent[1]).toContain('$875.00');
    expect(sent[2]).toMatch(/^Settled: /);
    expect(sent[2]).toContain('$102.00 each');
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).filter((e) => e.action === 'slack.sent')).toHaveLength(3);
  });

  it('a failing Slack is logged and never breaks the click', async () => {
    const svc = new LiveService({ sql, notifier: { send: async () => { throw new Error('Slack down'); } } });
    const c = ctx();
    expect((await svc.evaluatePlan(c, IDS.demoPlan)).status).toBe('blocked');
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'slack.failed' && e.detail.includes('Slack down'))).toBe(true);
  });

  it('escapes the plan title, so a title cannot mention a channel', async () => {
    const sent: string[] = [];
    const svc = new LiveService({ sql, notifier: { send: async (t) => { sent.push(t); } } });
    const c = ctx();
    await svc.updatePlan(c, IDS.demoPlan, { title: '<!channel> dinner' });
    await svc.evaluatePlan(c, IDS.demoPlan);
    expect(sent[0]).toContain('&lt;!channel&gt; dinner');
    expect(sent[0]).not.toContain('<!channel>');
  });
});
