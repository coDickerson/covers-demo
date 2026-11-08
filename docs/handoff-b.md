# Handoff from B (Cole) — Sat Nov 7, ~4:30 pm

Cole is away for a couple of hours. Everything below is on `main`. Nothing on B's side should block A.

## What's on main now
- **C1 merged:** `a/main` (engine, NPPES client, LiveService, eval set) is in `main`. All your tests pass there (LiveService's contract run skips without `TEST_DATABASE_URL`).
- **B2 (app skeleton):**
  - `FixtureService` (`apps/web/lib/fixtures/`) passes the full contract suite (25/25) on the memory store. It uses its own stub rule math and never imports `@covers/engine`.
  - Session store: Upstash Redis on Vercel, memory on a laptop (`apps/web/lib/store.ts`).
  - `proxy.ts` sets `covers_sid` (per-visitor sandbox, 24 h) and `covers_role` (`rep` | `compliance`) cookies. No login.
  - **One API route for every method:** `POST /api/covers/<method>` with body `{ "args": [...] }` (no ctx; the server builds it from cookies). It returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. HTTP status by code: not_found 404, forbidden 403, invalid_state 409, validation 400, rate_limited 429. Zod errors become `validation`.
  - Token pipeline: `design/tokens.json` → `pnpm tokens:pull` → `apps/web/styles/tokens.css`. Page at `/styleguide`.

## Testing your LiveService through the real web app (C2 prep, no need to wait for Cole)
```bash
pnpm install
cd apps/web
COVERS_MODE=live DATABASE_URL=postgres://... pnpm dev      # run your migrations first; the web app does not migrate
# in another terminal (use a cookie jar so you keep one session):
curl -s -c /tmp/j -o /dev/null localhost:3000/
curl -s -b /tmp/j -X POST -H 'content-type: application/json' -d '{"args":["plan-demo"]}' localhost:3000/api/covers/evaluatePlan
```
Switch roles by setting the cookie `covers_role=compliance`.

## The one file in apps/web that is yours
**`apps/web/lib/live.ts`** constructs `LiveService` for live mode. Right now it's `new LiveService({ sql: connect(DATABASE_URL) })`. Wire in the NPPES search, the receipt reader and Ramp there as they land, without asking. Everything else in `apps/web` is still B's.

Notes:
- The env var name is **`DATABASE_URL`** (the plan said `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`; you use a Postgres URL, so I went with that). Rename it in `live.ts` if you prefer.
- `next.config.ts` transpiles `@covers/live-service` and `@covers/engine` and keeps `postgres` external. If you add a package that live mode needs, add it to `transpilePackages` there (or tell Cole).
- `migrate()` reads SQL files from disk, which doesn't work inside the Next bundle, so run migrations from your package, not at web boot.

## Known gaps on B's side (not blocking you)
- Fixture mode refuses uploaded receipt photos (`invalid_state`, "needs live mode"); only sample receipts work. Pack lab and Break-It are `invalid_state` in fixtures too, same as yours today.
- `/proof` will read `proof/proof.json` once you write it; until then the placeholder in `packages/contract/fixtures` is used.
- Vercel isn't connected yet; Cole is doing that from the dashboard.
