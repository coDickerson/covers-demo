// Set up a dinner that's ready to be charged: a fresh session on the live database, Dr. Ruvane removed, the plan cleared,
// and a real restaurant-restricted card issued in the Ramp sandbox. Prints the card and the watcher command to run next.
// Slack pings (blocked, cleared) go out if SLACK_WEBHOOK_URL is set.
//
//   set -a && . ../../.env.local && set +a && ./node_modules/.bin/tsx scripts/demo-card.ts
import { IDS } from '@covers/contract/fixtures';
import { createLiveServiceFromEnv } from '../src/index';

const env = { ...process.env, COVERS_MODE: 'live', COVERS_CACHE: '0' };
if (!env.RAMP_CLIENT_ID || !env.RAMP_CLIENT_SECRET) { console.error('Set the Ramp sandbox keys in .env.local first.'); process.exit(1); }
const { service, close } = await createLiveServiceFromEnv(env);
const ctx = { sessionId: `demo-${Date.now()}`, actorId: IDS.rep };
try {
  console.log(`1. Checking the plan: ${(await service.evaluatePlan(ctx, IDS.demoPlan)).status}`);
  const { plan } = await service.getPlan(ctx, IDS.demoPlan);
  await service.updatePlan(ctx, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
  console.log(`2. Ruvane removed, checking again: ${(await service.evaluatePlan(ctx, IDS.demoPlan)).status}`);
  const fund = await service.issueFund(ctx, IDS.demoPlan);
  const issued = (await service.listAudit(ctx, { planId: IDS.demoPlan })).find((e) => e.action === 'fund.issued');
  console.log(`3. Card issued: $${(fund.limitCents / 100).toFixed(2)}, ${fund.simulated ? 'SIMULATED (Ramp failed, see the audit log)' : issued?.detail}`);
  if (fund.rampUrl) console.log(`   ${fund.rampUrl}`);
  console.log(`\nNext: ./node_modules/.bin/tsx scripts/watch-charges.ts --session ${ctx.sessionId}`);
} finally {
  await close();
}
