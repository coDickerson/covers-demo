// Builds LiveService from environment variables (COVERS_MODE=live). Used by apps/web's server code.
import { createNppesClient, createPackCompiler, createRampClient, createReceiptReader } from '@covers/integrations';
import { connect, migrate } from './db';
import { LiveService } from './service';

export async function createLiveServiceFromEnv(env: Record<string, string | undefined> = process.env) {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for COVERS_MODE=live');
  const sql = connect(url);
  await migrate(sql);
  const ramp = env.RAMP_CLIENT_ID && env.RAMP_CLIENT_SECRET
    ? createRampClient({
      baseUrl: env.RAMP_BASE_URL ?? 'https://demo-api.ramp.com', clientId: env.RAMP_CLIENT_ID, clientSecret: env.RAMP_CLIENT_SECRET,
      ...(env.RAMP_FUND_OWNER_USER_ID ? { fundOwnerUserId: env.RAMP_FUND_OWNER_USER_ID } : {}),
    })
    : undefined; // no Ramp credentials → simulated funds, labeled as such
  const nppes = createNppesClient();
  // Receipt photos are read only when an API key is configured; otherwise uploads refuse and samples still work.
  const reader = env.ANTHROPIC_API_KEY ? createReceiptReader(env.COVERS_RECEIPT_MODEL ? { model: env.COVERS_RECEIPT_MODEL } : {}) : undefined;
  const compiler = env.ANTHROPIC_API_KEY ? createPackCompiler(env.COVERS_PACK_MODEL ? { model: env.COVERS_PACK_MODEL } : {}) : undefined;
  const maxReads = env.COVERS_MAX_READS_PER_SESSION ? Number(env.COVERS_MAX_READS_PER_SESSION) : undefined;
  const service = new LiveService({
    sql, searchRegistry: (q) => nppes.searchHcps(q), ...(ramp ? { ramp } : {}), ...(reader ? { reader } : {}), ...(compiler ? { compiler } : {}),
    ...(maxReads ? { maxReadsPerSession: maxReads } : {}),
  });
  return { service, close: () => sql.end() };
}
