// Walk the scripted Dr. Patel dinner through the real LiveService and print what backend needs 1-3, 5 and 6 do.
// Uses your local Postgres (TEST_DATABASE_URL) and a fake Ramp, so nothing leaves your machine.
//
// From packages/live-service, with Postgres.app running:
//   set -a && . ../../.env.local && set +a && ./node_modules/.bin/tsx scripts/try-it.ts        card charged $612, matching
//   set -a && . ../../.env.local && set +a && ./node_modules/.bin/tsx scripts/try-it.ts 640    card charged $640, flagged
import { IDS } from '@covers/contract/fixtures';
import type { CheckResult, Ctx } from '@covers/contract';
import { createSlackNotifier } from '@covers/integrations';
import { connect, LiveService, migrate, type RampPort } from '../src/index';

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error('Set TEST_DATABASE_URL (it is in .env.local).'); process.exit(1); }
const chargeDollars = Number(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 612);

const B = '\x1b[1m', D = '\x1b[2m', R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', X = '\x1b[0m';
const color = (s: string) => (s === 'blocked' || s === 'block' ? R : s === 'cleared' || s === 'closed' || s === 'pass' ? G : Y) + s + X;
const step = (n: number, title: string) => console.log(`\n${B}${n}. ${title}${X}`);
const line = (s: string) => console.log(`   ${s}`);
const checkLine = (c: CheckResult) => line(`${color(c.outcome).padEnd(14)} ${c.id}  ${D}${c.message}${X}` +
  (c.approval ? `  ${G}approved by ${c.approval.by}${X}` : '') + (c.denial ? `  ${R}denied by ${c.denial.by}: "${c.denial.note}"${X}` : ''));
const refused = async (p: Promise<unknown>) => p.then(() => 'allowed (unexpected)', (e: { code?: string; message?: string }) => `refused: ${e.code} (${e.message})`);

const ramp: RampPort = {
  async createFund() { return { fundId: 'fund-demo-1', cardId: 'card-demo-1', lastFour: '1273', ownerUserId: 'u-demo' }; },
  async lock() {}, async unlock() {},
  async transactions() { return [{ id: 'tx-demo-1', amountCents: Math.round(chargeDollars * 100), state: 'CLEARED' }]; },
  async setMemo() {},
};

// Slack pings go out only when you ask for them: add --slack and have SLACK_WEBHOOK_URL in .env.local.
const slack = process.argv.includes('--slack') && process.env.SLACK_WEBHOOK_URL
  ? createSlackNotifier({ webhookUrl: process.env.SLACK_WEBHOOK_URL }) : undefined;
if (process.argv.includes('--slack') && !slack) console.log('--slack given but SLACK_WEBHOOK_URL is not set; no pings.');

const sql = connect(url);
await migrate(sql);
const svc = new LiveService({ sql, ramp, fundUrl: (id) => `https://demo.ramp.com/funds/issued#/d/funds/${id}`, ...(slack ? { notifier: slack } : {}) });
const sessionId = `try-${Date.now()}`;
const rep: Ctx = { sessionId, actorId: IDS.rep };
const priya: Ctx = { sessionId, actorId: IDS.compliance };

try {
  step(1, 'Jordan checks the scripted plan');
  const first = await svc.evaluatePlan(rep, IDS.demoPlan);
  line(`status ${color(first.status)}`);
  first.checks.filter((c) => c.outcome !== 'pass').forEach(checkLine);

  step(2, 'Need 2: Priya denies the repeat-attendance flag (Jordan cannot)');
  const flag = first.checks.find((c) => c.packId === 'P5' && c.outcome === 'flag')!;
  line(`Jordan tries to deny it: ${await refused(svc.denyException(rep, IDS.demoPlan, flag.id, 'self'))}`);
  const denied = await svc.denyException(priya, IDS.demoPlan, flag.id, 'Third program on this topic');
  checkLine(denied.checks.find((c) => c.id === flag.id)!);

  step(3, 'Jordan removes Dr. Ruvane and checks again');
  const { plan } = await svc.getPlan(rep, IDS.demoPlan);
  await svc.updatePlan(rep, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
  line(`status ${color((await svc.evaluatePlan(rep, IDS.demoPlan)).status)}`);

  step(4, 'Need 3: every evaluation round is kept');
  (await svc.listEvaluations(priya, IDS.demoPlan)).forEach((r, i) =>
    line(`round ${i + 1}: ${color(r.status)}  ${D}${r.checks.filter((c) => c.outcome !== 'pass').length} non-passing check(s)${X}`));

  step(5, 'Need 6: the $875 card, with a "View in Ramp" link (fake Ramp)');
  const fund = await svc.issueFund(rep, IDS.demoPlan);
  line(`limit $${fund.limitCents / 100}, simulated ${fund.simulated}, rampUrl ${fund.rampUrl}`);

  step(6, `Need 5: the dinner happens; the card is charged $${chargeDollars.toFixed(2)}; Dr. Kinsale doesn't come`);
  await svc.submitReceipt(rep, IDS.demoPlan, { sampleId: IDS.cleanReceipt });
  const st = await svc.confirmAttendance(rep, {
    planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery],
    employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
  });
  line(`$612.00 split over ${st.headcount} = $${(st.perPersonCents / 100).toFixed(2)} each`);
  line(`charge: ${JSON.stringify(st.charge)}`);
  const cardCheck = st.checks.find((c) => c.ruleId === 'P6.card-charge');
  if (cardCheck) checkLine(cardCheck);
  line(`exceptions for compliance: ${st.exceptions.length}`);
  st.exceptions.forEach(checkLine);
  line(`plan status ${color((await svc.getPlan(rep, IDS.demoPlan)).plan.status)}`);

  step(7, 'Need 1: Priya decides the exceptions after the dinner');
  const wine = st.exceptions.find((c) => c.packId === 'P5' && c.subject.kind === 'line');
  if (wine) {
    line(`Jordan tries to approve the wine: ${await refused(svc.approveException(rep, IDS.demoPlan, wine.id, 'self'))}`);
    await svc.denyException(priya, IDS.demoPlan, wine.id, 'Rep reimburses the wine');
  }
  for (const c of st.exceptions.filter((x) => x.id !== wine?.id)) await svc.approveException(priya, IDS.demoPlan, c.id, 'Reviewed');
  const after = await svc.getSettlement(priya, IDS.demoPlan);
  after!.exceptions.forEach(checkLine);
  line(`plan status ${color((await svc.getPlan(priya, IDS.demoPlan)).plan.status)}; still $${(after!.perPersonCents / 100).toFixed(2)} each`);

  step(8, 'The audit trail for this dinner');
  for (const e of await svc.listAudit(priya, { planId: IDS.demoPlan })) line(`${D}${e.actorId.padEnd(16)}${X} ${e.action.padEnd(22)} ${D}${e.detail.slice(0, 90)}${X}`);
  console.log(`\n${D}Session ${sessionId} in your local database. Run again for a fresh one.${X}\n`);
} finally {
  await sql.end();
}
