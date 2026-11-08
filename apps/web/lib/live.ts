// COVERS_MODE=live wiring. Person A (Nikhil) owns this one file inside apps/web:
// change how LiveService is constructed here (registry search, receipt reader, Ramp) without asking.
import { connect, LiveService } from '@covers/live-service';
import type { CoversService } from '@covers/contract';

export function createLiveService(env: NodeJS.ProcessEnv = process.env): CoversService {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('COVERS_MODE=live needs DATABASE_URL (Postgres connection string). Migrations run separately.');
  return new LiveService({ sql: connect(url) });
}
