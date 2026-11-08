// The scripted demo, end to end through LiveService. Used to record the cache and to prove replay works offline.
//   COVERS_CACHE=record DATABASE_URL=... pnpm --filter @covers/evals demo:record   (real calls, ~$0.04)
//   COVERS_CACHE=1      DATABASE_URL=... pnpm --filter @covers/evals demo:replay   (no network, no keys needed)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDS } from '@covers/contract/fixtures';
import { createLiveServiceFromEnv } from '@covers/live-service';

const here = dirname(fileURLToPath(import.meta.url));
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL };
const { service: svc, cacheMode, close } = await createLiveServiceFromEnv(env);
const s = `demo-${cacheMode}-${Date.now()}`;
const rep = { sessionId: s, actorId: IDS.rep };
const cmp = { sessionId: s, actorId: IDS.compliance };
const log = (k: string, v: unknown) => console.log(`${k.padEnd(22)} ${typeof v === 'string' ? v : JSON.stringify(v)}`);

log('cache mode', cacheMode);
log('1. evaluate', (await svc.evaluatePlan(rep, IDS.demoPlan)).status);
const { plan } = await svc.getPlan(rep, IDS.demoPlan);
await svc.updatePlan(rep, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
log('2. remove Ruvane', (await svc.evaluatePlan(rep, IDS.demoPlan)).status);
log('3. issue fund', await svc.issueFund(rep, IDS.demoPlan));

const img = readFileSync(join(here, '..', 'receipts', 'out', 'r01-seed-clean', 'degraded.jpg')).toString('base64');
const receipt = await svc.submitReceipt(rep, IDS.demoPlan, { base64: img, mime: 'image/jpeg' });
log('4. read receipt', { total: receipt.totalCents, covers: receipt.printedCovers, lines: receipt.lines.length, alcohol: receipt.lines.filter((l) => l.category === 'alcohol').map((l) => l.text) });

const st = await svc.confirmAttendance(rep, {
  planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery],
  employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
});
log('5. settle', { headcount: st.headcount, perPerson: st.perPersonCents, openPaymentsRows: st.openPayments.length, exceptions: st.exceptions.map((e) => e.ruleId) });

const { pack, tests } = await svc.compilePack(cmp, 'Weekend dinners need manager approval');
log('6. compile rule', { id: pack.id, tests: `${tests.filter((t) => t.passed).length}/${tests.length}` });
log('7. replay', `${(await svc.replayPack(cmp, pack.id)).changed.length} of 20 dinners change`);
log('8. promote', (await svc.promotePack(cmp, pack.id)).status);
log('9. registry search', (await svc.searchHcps(rep, 'John Smith CA')).length + ' real clinicians');

const ramp = (await svc.listAudit(cmp, { planId: IDS.demoPlan })).filter((e) => e.action.startsWith('ramp.') || e.action === 'fund.issued').map((e) => `${e.action}: ${e.detail}`);
log('ramp audit', ramp);
await close();
