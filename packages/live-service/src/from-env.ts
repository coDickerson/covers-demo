// Builds LiveService from environment variables (COVERS_MODE=live). Used by apps/web's server code.
//   COVERS_CACHE=0       normal: real Claude, Ramp sandbox and NPI registry calls
//   COVERS_CACHE=record  same, and every response is saved under COVERS_CACHE_DIR (default <repo>/cache)
//   COVERS_CACHE=1       replay: no outside calls at all; the site should show "Replaying recorded responses"
import { join } from 'node:path';
import {
  cachedCompiler, cachedRamp, cachedReader, cachedRegistrySearch, cacheModeFrom, createCache, createNppesClient,
  createPackCompiler, createRampClient, createReceiptReader, hashImage, offline,
} from '@covers/integrations';
import { connect, migrate } from './db';
import { LiveService } from './service';

export async function createLiveServiceFromEnv(env: Record<string, string | undefined> = process.env) {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for COVERS_MODE=live');
  const sql = connect(url);
  await migrate(sql);

  const mode = cacheModeFrom(env.COVERS_CACHE);
  const replay = mode === 'replay';
  const cache = createCache({ mode, dir: env.COVERS_CACHE_DIR ?? join(import.meta.dirname, '..', '..', '..', 'cache') });

  // Ramp: real with credentials; in replay, served from recordings even without credentials.
  const rampLive = env.RAMP_CLIENT_ID && env.RAMP_CLIENT_SECRET
    ? createRampClient({
      baseUrl: env.RAMP_BASE_URL ?? 'https://demo-api.ramp.com', clientId: env.RAMP_CLIENT_ID, clientSecret: env.RAMP_CLIENT_SECRET,
      ...(env.RAMP_FUND_OWNER_USER_ID ? { fundOwnerUserId: env.RAMP_FUND_OWNER_USER_ID } : {}),
    })
    : replay
      ? { createFund: offline('Ramp'), lock: offline('Ramp'), unlock: offline('Ramp'), transactions: offline('Ramp'), setMemo: offline('Ramp'), attachReceipt: offline('Ramp') }
      : undefined; // no Ramp credentials → simulated funds, labeled as such
  const ramp = rampLive ? cachedRamp(rampLive, cache) : undefined;

  const nppes = createNppesClient();
  const searchRegistry = cachedRegistrySearch(replay ? offline('NPI registry') : (q: string) => nppes.searchHcps(q), cache);

  // Claude: real with an API key; in replay, recordings only.
  const claude = !!env.ANTHROPIC_API_KEY || replay;
  const readerModel = env.COVERS_RECEIPT_MODEL ? { model: env.COVERS_RECEIPT_MODEL } : {};
  const packModel = env.COVERS_PACK_MODEL ? { model: env.COVERS_PACK_MODEL } : {};
  const reader = claude
    ? cachedReader(replay ? { model: createReceiptReader(readerModel).model, read: offline('Claude') } : createReceiptReader(readerModel), cache, hashImage)
    : undefined;
  const compiler = claude
    ? cachedCompiler(replay ? { model: createPackCompiler(packModel).model, compile: offline('Claude') } : createPackCompiler(packModel), cache)
    : undefined;

  const maxReads = env.COVERS_MAX_READS_PER_SESSION ? Number(env.COVERS_MAX_READS_PER_SESSION) : undefined;
  const service = new LiveService({
    sql, searchRegistry, ...(ramp ? { ramp } : {}), ...(reader ? { reader } : {}), ...(compiler ? { compiler } : {}),
    ...(maxReads ? { maxReadsPerSession: maxReads } : {}),
  });
  return { service, cacheMode: mode, close: () => sql.end() };
}
