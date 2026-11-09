// Run the phone page's check once for a session: has the dinner's card been charged?
//   set -a && . ../../.env.local && set +a && ./node_modules/.bin/tsx scripts/check-charge.ts <sessionId> [planId]
import { IDS } from '@covers/contract/fixtures';
import { createLiveServiceFromEnv } from '../src/index';

const [sessionId, planId = IDS.demoPlan] = process.argv.slice(2);
if (!sessionId) { console.error('Usage: check-charge.ts <sessionId> [planId]'); process.exit(1); }
const { service, close } = await createLiveServiceFromEnv({ ...process.env, COVERS_MODE: 'live', COVERS_CACHE: '0' });
try {
  const ctx = { sessionId, actorId: IDS.rep };
  console.log('checkForCharge →', JSON.stringify(await service.checkForCharge(ctx, planId)));
  console.log('getPlan.closeOut →', JSON.stringify((await service.getPlan(ctx, planId)).closeOut));
} finally { await close(); }
