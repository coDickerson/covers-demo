// Slack pings from LiveService: blocked before the dinner, cleared with the card, close out once the card is charged,
// settled after it. A failing Slack never breaks a click. Needs TEST_DATABASE_URL; skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { connect, LiveService, migrate, type RampPort, type Sql } from '../src/index';
import type { SlackMessage } from '../src/slack-messages';

const url = process.env.TEST_DATABASE_URL;
const APP = 'https://covers.test';
const json = (m: SlackMessage) => JSON.stringify(m.blocks);
const buttonUrls = (m: SlackMessage) => (m.blocks ?? []).flatMap((b) => ((b as { type: string; elements?: { url?: string }[] }).type === 'actions' ? (b as { elements: { url: string }[] }).elements.map((e) => e.url) : []));

function fakeRamp(charged: () => boolean, cardId: string): RampPort {
  return {
    async createFund() { return { fundId: 'fund-s', cardId, lastFour: '4242', ownerUserId: 'u' }; },
    async lock() {}, async unlock() {},
    async transactions(id) { return charged() && id === cardId ? [{ id: 'tx-s', amountCents: 61_200, state: 'CLEARED', merchantName: 'Alder & Vine', categoryId: 19 }] : []; },
    async setMemo() {},
  };
}

describe.skipIf(!url)('LiveService + Slack pings', () => {
  let sql: Sql;
  beforeAll(async () => { sql = connect(url!); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });
  const ctx = () => ({ sessionId: `slack-${crypto.randomUUID()}`, actorId: IDS.rep });
  const attendance = { planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery], employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep };

  it('pings blocked, cleared, close out (once the card is charged) and settled, with buttons back to Covers', async () => {
    const sent: SlackMessage[] = [];
    let charged = false;
    const svc = new LiveService({
      sql, ramp: fakeRamp(() => charged, `card-${crypto.randomUUID()}`), appUrl: APP, fundUrl: (id) => `https://ramp.test/${id}`,
      notifier: { send: async (m) => { sent.push(m); } },
    });
    const c = ctx();
    await svc.evaluatePlan(c, IDS.demoPlan);
    const { plan } = await svc.getPlan(c, IDS.demoPlan);
    await svc.updatePlan(c, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
    await svc.evaluatePlan(c, IDS.demoPlan);
    await svc.issueFund(c, IDS.demoPlan);

    expect(await svc.sweepCharges()).toEqual([]); // no charge yet, no ping
    charged = true;
    const swept = await svc.sweepCharges();
    expect(swept.filter((s) => s.sessionId === c.sessionId)).toEqual([{ sessionId: c.sessionId, planId: IDS.demoPlan, amountCents: 61_200 }]);
    expect((await svc.sweepCharges()).filter((s) => s.sessionId === c.sessionId)).toEqual([]); // pinged once only

    await svc.submitReceipt(c, IDS.demoPlan, { sampleId: IDS.cleanReceipt });
    await svc.confirmAttendance(c, attendance);

    expect(sent.map((m) => m.text.split(':')[0])).toEqual(['Blocked', 'Cleared', 'Speaker dinner', 'Settled']);
    expect(json(sent[0]!)).toContain('Ruvane');
    expect(buttonUrls(sent[0]!)).toEqual([`${APP}/plans/${IDS.demoPlan}`]);
    expect(json(sent[1]!)).toContain('$875.00');
    expect(buttonUrls(sent[1]!)).toEqual([`${APP}/plans/${IDS.demoPlan}`, 'https://ramp.test/fund-s']);
    expect(sent[2]!.text).toContain('charged $612.00 at Alder & Vine');
    expect(buttonUrls(sent[2]!)).toEqual([`${APP}/m/${IDS.demoPlan}?s=${c.sessionId}`]); // opens this same sandbox on a phone
    expect(json(sent[3]!)).toContain('$102.00');
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'charge.seen')).toBe(true);
  });

  it('shows no buttons when there is no app URL', async () => {
    const sent: SlackMessage[] = [];
    const svc = new LiveService({ sql, notifier: { send: async (m) => { sent.push(m); } } });
    await svc.evaluatePlan(ctx(), IDS.demoPlan);
    expect(buttonUrls(sent[0]!)).toEqual([]);
  });

  it('a failing Slack is logged and never breaks the click', async () => {
    const svc = new LiveService({ sql, notifier: { send: async () => { throw new Error('Slack down'); } } });
    const c = ctx();
    expect((await svc.evaluatePlan(c, IDS.demoPlan)).status).toBe('blocked');
    expect((await svc.listAudit(c, { planId: IDS.demoPlan })).some((e) => e.action === 'slack.failed' && e.detail.includes('Slack down'))).toBe(true);
  });

  it('escapes the plan title in the formatted text, so it cannot mention a channel', async () => {
    const sent: SlackMessage[] = [];
    const svc = new LiveService({ sql, notifier: { send: async (m) => { sent.push(m); } } });
    const c = ctx();
    await svc.updatePlan(c, IDS.demoPlan, { title: '<!channel> dinner', venue: '<!here> bar' });
    await svc.evaluatePlan(c, IDS.demoPlan);
    expect(json(sent[0]!)).toContain('&lt;!here&gt; bar');
    const mrkdwn = (sent[0]!.blocks ?? []).flatMap((b) => JSON.stringify(b).includes('"mrkdwn"') ? [JSON.stringify(b)] : []);
    expect(mrkdwn.join(' ')).not.toMatch(/<!here>|<!channel>/); // header is plain_text, which Slack never parses
  });
});
