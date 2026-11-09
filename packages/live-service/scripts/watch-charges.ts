// The morning-after notice, without a browser open. Every few seconds, look at every issued Ramp fund whose dinner isn't
// settled; the first time its card has a charge, record it (getPlan's closeOut, what the phone page shows) and, as a
// backup, ping Slack. The phone page does the same check itself with checkForCharge while it's open.
//
// Uses the same settings as the live site (DATABASE_URL, Ramp keys, SLACK_WEBHOOK_URL, COVERS_APP_URL), so for the video:
//   1. Clear a plan and issue its card on the live site.
//   2. Run this from packages/live-service:
//        set -a && . ../../.env.local && set +a && ./node_modules/.bin/tsx scripts/watch-charges.ts
//   3. In Ramp's sandbox, ⌘J → Add transactions on that card. The close-out ping arrives within a few seconds.
// Add --once to check one time and exit, and --session <id> to watch only that visitor's dinners.
import { createLiveServiceFromEnv } from '../src/index';

const env = { ...process.env, COVERS_MODE: 'live', COVERS_CACHE: '0' };
if (!env.SLACK_WEBHOOK_URL) console.log('No SLACK_WEBHOOK_URL: charges are recorded for the phone page, no Slack pings.');
if (!env.RAMP_CLIENT_ID || !env.RAMP_CLIENT_SECRET) { console.error('Set the Ramp sandbox keys in .env.local first.'); process.exit(1); }

const everyMs = Number(process.env.WATCH_EVERY_MS ?? 5000);
const at = process.argv.indexOf('--session');
const sessionId = at > 0 ? process.argv[at + 1] : undefined;
const { service, close } = await createLiveServiceFromEnv(env);

async function tick() {
  const pinged = await service.sweepCharges(sessionId ? { sessionId } : {});
  for (const p of pinged) console.log(`${new Date().toLocaleTimeString()}  pinged: ${p.planId} (session ${p.sessionId.slice(0, 12)}…), charge $${(p.amountCents / 100).toFixed(2)}`);
}

if (process.argv.includes('--once')) {
  await tick();
  await close();
} else {
  console.log(`Watching Ramp cards every ${everyMs / 1000}s${sessionId ? ` for session ${sessionId}` : ''}. Ctrl-C to stop.`);
  await tick();
  const timer = setInterval(() => { tick().catch((e) => console.error('sweep failed:', e instanceof Error ? e.message : e)); }, everyMs);
  process.on('SIGINT', async () => { clearInterval(timer); await close(); process.exit(0); });
}
