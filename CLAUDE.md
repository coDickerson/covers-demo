# Covers — rules for every Claude Code session

Covers checks medical-device speaker dinners before the card is used and settles them after.
Full plan: docs/implementation.md. Decisions that override it: docs/decisions.md.
Contract: packages/contract (frozen).

## Hard rules
1. Money is integer cents everywhere. Never floats.
2. packages/engine imports nothing that does I/O or calls a model (enforced by lint).
3. Every rule result carries a Citation. A rule that cannot be cited returns 'flag' and goes to compliance.
4. Every write goes through the gateway in packages/live-service, which writes an AuditEvent first.
5. Model calls return Zod-validated facts with a confidence, never free text into the engine.
6. Do not edit packages/contract. Propose changes in a PR labeled contract-change; additive only.
7. Stay in your folders. A: packages/engine, packages/integrations, packages/live-service, evals.
   B: apps/web, design, video. Ask before touching anything else.
8. apps/web uses tokens only: no hard-coded colors, sizes, radii, durations or easings.
9. Run `pnpm test:contract` before every merge to main.
10. Seed doctors are fictional. Never show invented spend next to a real doctor from the NPI registry.
11. Secrets live in environment variables only.

## Commands
pnpm dev | pnpm test | pnpm test:contract | pnpm tokens:pull | pnpm shots
pnpm eval | pnpm breakit | pnpm seed:reset

## Environment
COVERS_MODE=fixtures|live  COVERS_CACHE=0|1  ANTHROPIC_API_KEY
RAMP_BASE_URL  RAMP_CLIENT_ID  RAMP_CLIENT_SECRET  SUPABASE_URL  SUPABASE_SERVICE_KEY
