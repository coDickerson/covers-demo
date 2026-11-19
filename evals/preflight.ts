// Before a live demo: is everything the live site needs reachable? Read-only, spends nothing, sends no messages.
//   pnpm preflight        (from the repo root; reads .env.local itself)
// Checks the database, Ramp's credentials, the Anthropic and Apify keys, and Slack's webhook, then says whether the
// live site on COVERS_APP_URL (default http://localhost:3101) is answering. Never prints a secret.
// Exit code 1 if anything the demo needs is broken.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAMP_SCOPES } from '@covers/integrations';
import { connect } from '@covers/live-service';

const envFile = join(import.meta.dirname, '..', '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const env = process.env;

type Result = { name: string; ok: boolean | 'warn'; detail: string };
const results: Result[] = [];
const TIMEOUT = 10_000;

async function check(name: string, run: () => Promise<{ ok: boolean | 'warn'; detail: string }>) {
  try {
    results.push({ name, ...(await run()) });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}

const timed = (ms = TIMEOUT) => AbortSignal.timeout(ms);

await check('Database', async () => {
  if (!env.DATABASE_URL) return { ok: false, detail: 'DATABASE_URL is not set' };
  const sql = connect(env.DATABASE_URL);
  try {
    const [row] = await Promise.race([
      sql<{ docs: number }[]>`select count(*)::int as docs from docs`,
      new Promise<never>((_, no) => setTimeout(() => no(new Error('no answer in 10 s')), TIMEOUT)),
    ]);
    return { ok: true, detail: `connected, ${row!.docs} stored documents` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = /tenant\/user .* not found|ENOTFOUND/.test(msg) ? ' (Supabase project paused? Restore it in the dashboard.)' : '';
    return { ok: false, detail: msg + hint };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
});

await check('Ramp', async () => {
  if (!env.RAMP_CLIENT_ID || !env.RAMP_CLIENT_SECRET) return { ok: 'warn', detail: 'no credentials: cards will be simulated' };
  const base = (env.RAMP_BASE_URL ?? 'https://demo-api.ramp.com').replace(/\/$/, '');
  const res = await fetch(`${base}/developer/v1/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.RAMP_CLIENT_ID}:${env.RAMP_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: RAMP_SCOPES }).toString(),
    signal: timed(),
  });
  if (!res.ok) return { ok: false, detail: `token request refused (HTTP ${res.status})` };
  return { ok: true, detail: `signed in to ${new URL(base).host} with all ${RAMP_SCOPES.split(' ').length} scopes` };
});

await check('Anthropic', async () => {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, detail: 'ANTHROPIC_API_KEY is not set: receipts and agents will refuse' };
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    signal: timed(),
  });
  return res.ok ? { ok: true, detail: 'key accepted' } : { ok: false, detail: `key refused (HTTP ${res.status})` };
});

await check('Apify', async () => {
  if (!env.APIFY_TOKEN) return { ok: 'warn', detail: 'APIFY_TOKEN is not set: the venue agent will skip' };
  const res = await fetch('https://api.apify.com/v2/users/me', { headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` }, signal: timed() });
  return res.ok ? { ok: true, detail: 'token accepted' } : { ok: false, detail: `token refused (HTTP ${res.status})` };
});

await check('Slack', async () => (env.SLACK_WEBHOOK_URL
  ? { ok: true, detail: 'webhook set (not sent, to avoid a message)' }
  : { ok: 'warn', detail: 'SLACK_WEBHOOK_URL is not set: no pings' }));

await check('Live site', async () => {
  const app = (env.COVERS_APP_URL ?? 'http://localhost:3101').replace(/\/$/, '');
  try {
    const res = await fetch(`${app}/api/covers/listDocuments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: timed(5_000) });
    const body = (await res.json()) as { ok: boolean };
    return body.ok ? { ok: true, detail: `${app} is answering` } : { ok: false, detail: `${app} is up but failing (HTTP ${res.status}); check its terminal` };
  } catch {
    return { ok: 'warn', detail: `nothing answering at ${app} yet` };
  }
});

const mark = (ok: Result['ok']) => (ok === true ? '\x1b[32m✓\x1b[0m' : ok === 'warn' ? '\x1b[33m!\x1b[0m' : '\x1b[31m✗\x1b[0m');
for (const r of results) console.log(`${mark(r.ok)} ${r.name.padEnd(10)} ${r.detail}`);
if (env.COVERS_MODE !== 'live') console.log(`\x1b[33m!\x1b[0m COVERS_MODE in .env.local is "${env.COVERS_MODE ?? 'unset'}": start the site with COVERS_MODE=live for the demo.`);
const failed = results.filter((r) => r.ok === false);
console.log(failed.length ? `\n${failed.length} problem(s). Fix before the demo.` : '\nReady for the live demo.');
process.exit(failed.length ? 1 : 0);
