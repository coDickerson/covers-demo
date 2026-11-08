# Live mode: switching apps/web from FixtureService to LiveService

For C2 (flip to live on a preview deploy). Everything on A's side is in `packages/live-service`; the web app only
needs one server-side function call. Verified Nov 7: LiveService passes the shared contract suite against our Supabase
database, through both of Supabase's poolers.

## 1. One function call (server only)

```ts
// apps/web/lib/service.ts — server-only module
import 'server-only';
import type { CoversService } from '@covers/contract';
import { createLiveServiceFromEnv } from '@covers/live-service';
import { FixtureService } from './fixture-service';

let live: ReturnType<typeof createLiveServiceFromEnv> | undefined; // one pool per server instance

export async function getService(): Promise<{ service: CoversService; replaying: boolean }> {
  if (process.env.COVERS_MODE !== 'live') return { service: fixtureService, replaying: false };
  live ??= createLiveServiceFromEnv();
  const { service, cacheMode } = await live;
  return { service, replaying: cacheMode === 'replay' }; // replaying → show "Replaying recorded responses"
}
const fixtureService = new FixtureService();
```

- **Node runtime only.** The database client does not run on the Edge runtime: keep `export const runtime = 'nodejs'`
  (the default) on routes and server actions that call the service.
- `ctx.sessionId` = the visitor's session cookie; `ctx.actorId` = the header's role switch (`rep-jordan-lee` /
  `cmp-priya-shah`). `getProof()` takes no ctx.
- The first call for a new session copies the seed (one query). Sessions expire after 24 h.

## 2. Errors → HTTP

Refusals throw `CoversError` (from `@covers/contract`). Send them to the browser as `CoversErrorBody`:

| `code` | HTTP | Examples |
|---|---|---|
| `not_found` | 404 | unknown plan or pack |
| `forbidden` | 403 | rep approves own exception; non-rep confirms attendance; rep promotes a rule |
| `invalid_state` | 409 | fund on an uncleared plan; approving a block; promote before replay; feature needs a key |
| `validation` | 422 | duplicate receipt photo; unreadable receipt; bad plan input |
| `rate_limited` | 429 | the session used its 20 receipt reads |

```ts
catch (e) { if (e instanceof CoversError) return Response.json({ code: e.code, message: e.message }, { status: STATUS[e.code] }); throw e; }
```

## 3. next.config.ts

```ts
const nextConfig: NextConfig = {
  // Workspace packages export TypeScript source.
  transpilePackages: ['@covers/contract', '@covers/engine', '@covers/integrations', '@covers/live-service'],
  // Only needed for replay mode on Vercel: ship the recorded responses with the functions.
  outputFileTracingIncludes: { '/**': ['../../cache/**/*'] },
};
```

Add `"@covers/live-service": "workspace:*"` to `apps/web/package.json`. Migrations and `proof/proof.json` are bundled
as code, so nothing else needs to be shipped as files. (Check the `outputFileTracingIncludes` key against the Next 16
docs; it was a top-level option in Next 15.)

## 4. Environment variables

| Variable | Local | Vercel | What it turns on |
|---|---|---|---|
| `COVERS_MODE` | `live` | `live` | LiveService instead of fixtures |
| `DATABASE_URL` | Supabase session pooler (`:5432`) or local Postgres | Supabase **transaction pooler** (same URL, `:6543`) | Required. Characters like `$` or `@` in the password must be written as `%24` / `%40` |
| `COVERS_DB_MAX_CONNECTIONS` | (5) | `2` | The free Supabase session pooler allows 15 clients in total |
| `RAMP_CLIENT_ID`, `RAMP_CLIENT_SECRET`, `RAMP_BASE_URL` | set | set | Real Ramp sandbox funds; without them funds are `simulated: true` |
| `ANTHROPIC_API_KEY` | set | set | Uploading receipt photos and compiling Pack-lab rules; without it those refuse with `invalid_state`, and the sample receipts still work |
| `COVERS_CACHE` | `0` | `0`, or `1` for the stage | `1` = replay recorded responses with no outside calls; `record` = record them |
| `COVERS_CACHE_DIR` | (auto) | absolute path of the shipped `cache/` | Replay only |
| `COVERS_MAX_READS_PER_SESSION` | (20) | (20) | Receipt reads per visitor |

Send `DATABASE_URL` and the keys privately (not in GitHub). Set the API key's monthly spend limit in the Anthropic Console.

**Region:** put the Vercel functions in **`pdx1` (Portland)**. The database is in us-west-2 (Oregon). A click makes
3–9 queries (budgets in `tests/query-budget.test.ts`); from the default `iad1` each costs ~70 ms, from `pdx1` a few ms.

## 5. What is real in each setup

| Feature | No keys | + Ramp | + Anthropic | `COVERS_CACHE=1` |
|---|---|---|---|---|
| Rule engine, caps, split, Open Payments draft | ✅ | ✅ | ✅ | ✅ |
| Real-doctor NPI search | ✅ (public API) | ✅ | ✅ | recorded searches only |
| Card fund | simulated | real sandbox fund, lock/unlock | – | recorded fund |
| Memo + receipt on the Ramp charge | – | ✅ when a charge exists | photo needs an upload | skipped |
| Uploaded receipt photo | refuses | refuses | ✅ (~1¢ each) | recorded photos only |
| Pack lab compile | refuses | refuses | ✅ (~2¢ each) | recorded rules only |
| Break-It (15 cases) | ✅ | ✅ | ✅ | ✅ |
| Proof page | ✅ bundled `proof/proof.json` | ✅ | ✅ | ✅ |

## 6. Stage and video checklist

1. `pnpm --filter @covers/evals demo:record` with all keys (about $0.04): records the scripted demo into `cache/`.
2. Commit `cache/`, deploy, set `COVERS_CACHE=1` on the stage deployment, and check the banner shows.
3. Rehearse the demo with the network off: `pnpm --filter @covers/evals demo:replay` must print the same results.
4. To show a memo landing in Ramp: create a $612 charge on the fund's card with Ramp's sandbox demo tool
   (⌘D → Demo tools form → Create transactions; Card uuid = the fund's card) **before** confirming attendance.

## 7. Commands

| Command | What it does |
|---|---|
| `pnpm --filter @covers/live-service test` | 65 tests; set `TEST_DATABASE_URL` to run the database ones |
| `pnpm --filter @covers/evals receipts:eval` | the reader over 25 synthetic receipts (~$0.28) |
| `pnpm --filter @covers/evals proof` | regenerates `proof/proof.json` (no API calls; needs a database) |
| `pnpm --filter @covers/evals demo:record` / `demo:replay` | record / replay the scripted demo |
