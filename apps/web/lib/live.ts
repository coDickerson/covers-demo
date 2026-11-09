// COVERS_MODE=live wiring. Person A (Nikhil) owns this one file inside apps/web:
// change how LiveService is constructed here (registry search, receipt reader, Ramp) without asking.
//
// createLiveServiceFromEnv wires everything from env (see docs/live-mode.md):
//   DATABASE_URL                       Postgres (on Vercel: Supabase transaction pooler, port 6543)
//   RAMP_CLIENT_ID / RAMP_CLIENT_SECRET real Ramp sandbox funds (else simulated: true)
//   ANTHROPIC_API_KEY                  receipt photos + Pack-lab compiles (else those refuse with invalid_state)
//   COVERS_CACHE=1                     replay recorded responses, no outside calls (stage/video safety net)
// It also runs the database migrations (bundled as code), so the web app can migrate on boot.
import { join } from 'node:path';
import { createLiveServiceFromEnv } from '@covers/live-service';
import type { CoversService } from '@covers/contract';

export async function createLiveService(env: NodeJS.ProcessEnv = process.env): Promise<CoversService> {
  if (!env.DATABASE_URL) throw new Error('COVERS_MODE=live needs DATABASE_URL (Postgres connection string).');
  // Inside the Next bundle the package can't locate the repo's cache/ folder itself; the app runs from apps/web.
  const { service } = await createLiveServiceFromEnv({ ...env, COVERS_CACHE_DIR: env.COVERS_CACHE_DIR ?? join(process.cwd(), '..', '..', 'cache') });
  return service;
}

/** True when live mode is replaying recorded responses: show the "Replaying recorded responses" banner. */
export const isReplaying = (env: NodeJS.ProcessEnv = process.env) =>
  env.COVERS_MODE === 'live' && (env.COVERS_CACHE === '1' || env.COVERS_CACHE === 'replay');
