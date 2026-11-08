// The one place that picks which CoversService answers. Server-only.
//   COVERS_MODE=fixtures (default) → FixtureService on Upstash (Vercel) or memory (laptop)
//   COVERS_MODE=live               → Person A's LiveService (lib/live.ts)
import type { CoversService } from '@covers/contract';
import { FixtureService } from './fixtures/fixture-service';
import { storeFromEnv } from './store';

export type CoversMode = 'fixtures' | 'live';

export const coversMode = (): CoversMode => (process.env.COVERS_MODE === 'live' ? 'live' : 'fixtures');

const g = globalThis as typeof globalThis & { __coversService?: { mode: CoversMode; svc: Promise<CoversService> } };

export function getService(): Promise<CoversService> {
  const mode = coversMode();
  if (g.__coversService?.mode !== mode) {
    const svc =
      mode === 'live'
        ? import('./live').then((m) => m.createLiveService())
        : Promise.resolve<CoversService>(new FixtureService(storeFromEnv()));
    g.__coversService = { mode, svc };
  }
  return g.__coversService.svc;
}
