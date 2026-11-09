# Live mode: switching apps/web from FixtureService to LiveService

For C2 (flip to live on a preview deploy). Everything on A's side is in `packages/live-service`; the web app only
needs one server-side function call. Verified Nov 7: LiveService passes the shared contract suite against our Supabase
database, through both of Supabase's poolers.

## 0. C2 checklist (Sun Nov 8, 10 pm)

Checked Nov 8, 1:20 pm on a production build (`next build` + `next start`, `COVERS_MODE=live`, `COVERS_CACHE=1`,
Supabase): plan-demo → blocked (P4, P5), `issueFund` → 409, `getProof` → 15/15, recorded registry search replays,
an unrecorded one → 409 "Replaying recorded responses…".

1. Vercel → `covers-demo` → Settings → Environment Variables, **Preview only** (leave Production on fixtures until C3):
   `COVERS_MODE=live`, `DATABASE_URL` (transaction pooler, `:6543`), `COVERS_DB_MAX_CONNECTIONS=2`,
   `RAMP_BASE_URL`, `RAMP_CLIENT_ID`, `RAMP_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `COVERS_CACHE=0`.
   Nikhil sends the values privately.
2. Settings → Functions → Function Region: **`pdx1`** (the database is in us-west-2).
3. Push any branch (or redeploy) to get a preview URL; open it logged out.
4. Smoke test on the preview: the landing page loads; `evaluatePlan("plan-demo")` → blocked; `issueFund` on it → 409;
   a real NPI search (e.g. "John Smith CA") returns registry doctors with no spend.
5. Each person fixes mismatches on their own side; the contract suite is the referee.

## 1. Already wired (Nov 8)

Cole's app picks the service in `apps/web/lib/service.ts`; live mode goes through **`apps/web/lib/live.ts`** (A's one
file in `apps/web`), which now calls `createLiveServiceFromEnv()`: Postgres + migrations, NPI registry, Ramp,
receipt reader, Pack-lab compiler and cache mode all come from env. `isReplaying()` in the same file tells the UI
when to show "Replaying recorded responses".

- Pages call `POST /api/covers/<method>` with `{ "args": [...] }`; ctx comes from the `covers_sid` / `covers_role`
  cookies (see `docs/handoff-b.md`). Errors come back as `{ ok: false, error: { code, message } }`.
- Migrations are bundled as code, so live mode migrates itself on first use (the old "migrations run separately" note
  no longer applies).
- Verified on a production build (`next build` + `next start`, `COVERS_MODE=live`, `COVERS_CACHE=1`): evaluatePlan →
  blocked, issueFund → 409 invalid_state, Break-It #15 passes, getProof → 15/15, replayed registry search → 7 results.

## 2. Errors → HTTP (Cole's route)

| `code` | HTTP | Examples |
|---|---|---|
| `not_found` | 404 | unknown plan or pack |
| `forbidden` | 403 | rep approves own exception; non-rep confirms attendance; rep promotes a rule |
| `invalid_state` | 409 | fund on an uncleared plan; approving a block; promote before replay; feature needs a key |
| `validation` | 400 | duplicate receipt photo; unreadable receipt; bad input (Zod errors too) |
| `rate_limited` | 429 | the session used its 20 receipt reads |

## 3. next.config.ts (done)

`transpilePackages` includes `@covers/integrations`; `outputFileTracingIncludes` ships `cache/` with the API route for
replay mode; `postgres` stays in `serverExternalPackages`. `live.ts` points `COVERS_CACHE_DIR` at the repo's `cache/`
(relative to `apps/web`), because inside the Next bundle the package cannot find it on its own.

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
| `RAMP_FUND_URL` | (auto) | (auto) | "View in Ramp" link template with `{fundId}`; default `https://demo.ramp.com/funds/issued#/d/funds/{fundId}` |
| `SLACK_WEBHOOK_URL` | optional | only while recording | Slack pings: blocked, cleared (with the card), close out (once the card is charged), settled. Off when unset and always off in replay. Every judge click on the public site would ping, so leave it unset there |
| `COVERS_APP_URL` | optional | the site's URL | Buttons in the Slack pings: "Open in Covers" → `/plans/{id}`, "Close it out" → `/m/{id}`. No buttons when unset |

**The morning-after ping, live.** Nothing in the app knows when dinner happened, so a small watcher checks Ramp:
`packages/live-service/scripts/watch-charges.ts` looks at every issued, unsettled Ramp fund every 5 seconds and, the first
time its card has a charge, pings the rep to close out. For the video: issue a card on the site, start the watcher, then
create a charge on that card in Ramp's sandbox (⌘J → Add transactions); the ping arrives within seconds.

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
