# Covers — decisions log

Decisions made after `docs/implementation.md` was written. Where they differ, this file wins.
Newest at the bottom. Agreed by Cole (B) and Nikhil (A) unless marked otherwise.

## Sat Nov 7 — before C0

**Roles.** Cole is Person B (design, web, motion, video). Nikhil is Person A (engine, integrations, live service, evals).

**Stack versions (pinned).** Next 16.4.5 · React 19.3 · Tailwind 4.3 · Zod 4.6.7 · TypeScript 6.0.3 · Vitest 4.1.12 · pnpm 10.33.2 · Node ≥22.
TypeScript 7 and Vitest 5 skipped on purpose: both too new for a 3-day sprint.

**Seed roster: six invitees, plus the speaker.** Six fictional HCPs are invited (Dr. Ruvane and Dr. Kinsale among them). Dr. Patel, the speaker, is *not* in `inviteeNpis`.
The story then reconciles exactly:
- 6 invited → Dr. Ruvane blocked and removed → 5 invited.
- Dr. Kinsale no-shows → 4 HCPs attend.
- 4 HCPs + Dr. Patel + Jordan (rep) = **6 who ate** = the clean receipt's 6 covers: **$612 ÷ 6 = $102 each**, under the $125 cap.

**The speaker is part of the split.** Dr. Patel ate, so he is in the denominator, gets an Open Payments food-and-beverage row, and his meal counts toward his annual total. Speaker fees are out of scope. ⚠️ Verify speaker-meal reporting with Kaley / Cole's dad.

**Per-person value includes tax and tip.** Per-person value = printed total (food + beverage + tax + tip) ÷ everyone who ate. The $110 estimate and the $125 cap are all-in too. ⚠️ Verify against CMS guidance (goes with the P6 check).

**Headcount.**
- Before dinner (fund cap): `inviteeNpis.length + 1 (speaker) + employeeCount`. `employeeCount` includes the rep (seed = 1). Scripted plan after Dr. Ruvane is removed: 5 + 1 + 1 = 7 → fund cap 7 × $125 = **$875**.
- After dinner (settlement): `attendedNpis.length + employeesPresent + extraGuests`. `attendedNpis` **includes the speaker's NPI**, so a speaker no-show is possible.

**Annual cap.** One company setting ($2,000) applied to each doctor separately. `CapStatus.capCents` is per NPI so overrides are possible; every seed doctor gets $2,000. "Near" = above 80% ($1,600). Dr. Ruvane: $1,940 + $110 = $2,050 → over → blocked, $60 from her limit.

**Rounding.** Leftover cents from largest-remainder splitting go to people in ascending order of their id, so the result is identical every run. *(Claude's call, not objected to.)*

**Plan doc.** Moved to `docs/implementation.md`. B5 corrected: the re-flow unticks **Dr. Kinsale** (not Dr. Ruvane).

**Deploy.** Cole connects the GitHub repo to Vercel from the dashboard.

**Figma.** Cole is on Figma Education (200 MCP calls/day, 10/min). Calls are scarce: anything Cole can do quickly by hand in Figma, Cole does. Calls go to what only Claude Code can do (reading screens, screenshot comparison).
- Design file (source of truth): https://www.figma.com/design/amtGh7fESBeXnQx49BDXDj/Covers-Design
- Make file (three throwaway Plan-screen variants only; its code is not shipped): https://www.figma.com/make/tYG3H3EXGODg6BFbMgbjWz/Covers
- Variables live in **one collection, `Covers tokens`**, light mode only. Names use full slash paths (`color/status/over`), which map 1:1 to CSS (`--color-status-over`).

**Token pipeline uses a plugin JSON export, not `get_variable_defs`.** Cole exports the collection with a variables-export plugin to `design/tokens.json`; `pnpm tokens:pull` converts it to `apps/web/styles/tokens.css`. Zero MCP calls, and it captures motion variables, which `get_variable_defs` would miss because nothing is bound to them.

**Fake NPIs start with 9 and fail the NPI checksum.** Real NPIs start with 1 or 2 and pass the checksum, so a seed NPI can never collide with a real doctor. *(Prefix: Claude's call; checksum: Nikhil's review.)*

**Repeat attendance (P5).** `sameTopicCount12mo` counts *prior* programs on the same topic. Flag when it is ≥ 2, i.e. this dinner would be the third. Dr. Ruvane has 2. *(Claude's call, matches Break-It #14.)*

**Seed actors.** `rep-jordan-lee` (rep), `cmp-priya-shah` (compliance), `mgr-morgan-reyes` (Jordan's manager, added because `Rep.managerId` needs a value). *(Claude's call.)*

## Sat Nov 7 — Nikhil's C0 review (all accepted)

**Seed doctors renamed** to names with zero matches in the real NPI registry, nationwide (checked against the NPPES API). The old names matched real clinicians (e.g. Ana Ruiz: 35 nationwide). The roles are unchanged:

| Old | New | Role in the story |
|---|---|---|
| Dr. Ana Ruiz | **Dr. Ana Ruvane** | $60 from her cap, blocked and removed before the dinner |
| Dr. Grace Kim | **Dr. Grace Kinsale** | the no-show after the dinner |
| Dr. Lena Ortiz | **Dr. Lena Ortwell** | speaker with expired training |
| Dr. Mei Chen | **Dr. Mei Lindqvist** | invitee |
| Sofia Alvarez, NP | **Sofia Brennick, NP** | invitee (nurse practitioner) |
| Dr. Robert Haas | **Dr. Robert Ellery** | invitee |
| Dr. Marcus Patel, Dr. Daniel Okafor | unchanged | already zero matches |

`docs/implementation.md` (including the voiceover) is updated. `IDS` keys in `@covers/contract/fixtures` were renamed to match (`IDS.ruvane`, `IDS.kinsale`, `IDS.ortwell`, `IDS.lindqvist`, `IDS.brennick`, `IDS.ellery`; speaker `spk-ortwell`). **Nikhil: update any references on a/main.**

**Contract changes:**
- `updatePlan` takes `PlanPatch` (= `Partial<PlanInput>`): status and fundId can't be set directly. **Any edit sets status back to `draft`**, so a cleared plan has to be re-evaluated.
- `CheckResult.approval?: { by, note, at }` records an approved flag.
- `getPlan(id)` returns `PlanView = { plan, evaluation | null }`: the latest stored evaluation, without re-evaluating or writing an audit event.
- `getReceipt(planId)` returns `Receipt | null`.
- `CoversErrorBody = { code, message }` is what refusals look like across the server→browser boundary. `CoversError` stays for throwing on the server. `forbidden` = wrong actor; `invalid_state` = not allowed right now (fund on an uncleared plan, approving a block).

**Approvals.** Blocks are never approvable (bad speaker, over the per-person cap *before* the dinner, over an HCP's annual cap). Flags are approvable by anyone except the plan's rep. **After the dinner, an actual per-person cost over the cap is a flag (exception to compliance), not a block**, because the money is already spent and compliance has to be able to close it out.

## Sat Nov 7 — visual direction

**Ramp-based palette, sleek and streamlined.** Colors are taken from ramp.com's own stylesheet (warm off-white `#F4F2F0`, black `#1A1919`, "solar" lime `#E4F222`, "smolder" green `#17332D`, warm grays). Status colors are ours, tuned to sit with it; every text color passes WCAG AA (4.5:1). The lime is **fill only** (text on it uses `color/on-accent`). No Ramp logo anywhere; the cap bar and stamp stay ours.

**One font: Inter Tight** (closest free font to Ramp's Lausanne). **No serif**: the wordmark is Inter Tight in a heavier weight. This replaces the plan's "one serif for the wordmark and video titles."

**Variables are in Figma** (`Covers tokens`, mode `Light`, 38 variables), created by Claude Code in one call and read back to verify. Each has its CSS name set as its Web code syntax (`var(--color-status-over)`). Accent names: `color/accent` (lime fill), `color/on-accent` (text on lime), `color/accent-strong` (dark green for links and selected states). Code-only tokens (motion, `stamp/rotation`) are hidden from Figma's property pickers.

## Sat Nov 7 — B2

**Fixture-mode storage: Upstash Redis** (via Vercel → Storage), one JSON document per session with a 24 h expiry; plain memory on a laptop. Chosen over a table in A's Supabase so fixture mode survives anything that breaks live mode (resets, migrations, credentials). SpacetimeDB considered and rejected (built for real-time multiplayer; would move the logic into DB modules).

**One API route.** The browser calls every method through `POST /api/covers/<method>`; ctx always comes from cookies, never the request body. Details in `docs/handoff-b.md`.

**C1 merged early.** `a/main` merged into `main` at Nikhil's request (it touches only A's folders).

**Live-mode wiring lives in `apps/web/lib/live.ts`, which A owns.** Env var `DATABASE_URL`.

## Sun Nov 8 — deadline, video, and the storyboard direction

**Deadline: Tue Nov 10, 11:59 PM PT** (the plan said noon). B9–B10 can run later on Tuesday.

**Video: about 3 minutes.** No written length limit found; 3 min is a first target (moa's winning video ran 3:09). Structure: real-headline cold open → one dinner end to end → quick tour → "try it yourself".

**Deploy is live** in fixture mode: https://covers-demo-flame.vercel.app (Vercel project `covers-demo`, root `apps/web`, `COVERS_MODE=fixtures`, Upstash connected). Upstash is on the free plan, so keep smoke tests to a few targeted calls.

**The storyboard leads the design: `design/storyboard.html`.** 14 frames from plan to proof, each with who is looking, the one question the screen answers, what clicking opens, and the voiceover line. Frame 0 holds the problem, the solution and the workflow map. Principles taken from moa's video:
- **One question per screen.** Details open in a side panel instead of crowding the page.
- **Progress as a chain** of small cards: Plan → Checks → Card → Receipt → Settled.
- **Findings cards:** the number in the headline sentence, a short table, policy clause chips, evidence chips, and options with one marked *Recommended*.
- Only the people who need action carry a **"Needs your OK"** tag; everyone else stays quiet.

This replaces the Figma Plan screen from B1. **Code leads; Figma now does the video pieces (B8)** and stays the source for variables. The old Plan screen, cap bar and stamp in Figma are archived.

**Look: "Ledger".** Thin divider lines, square corners (`radius/control` and `radius/card` = 0), and lime only on the one action to take.
- **Fonts:** Inter Tight, plus **JetBrains Mono** for amounts, IDs and policy clauses (`type/family/mono`).
- **Palette:**
  - page `#FBFAF8`, ink `#141414`, secondary `#4A4744`, muted `#7A7672`, lines `#E2DED9`
  - status: over `#D93A26`, near `#A86A00`, ok `#2B7A4B`
- **Type sizes:** heading 22, verdict 26, display 40, micro 11. Bold 700 for the verdict lines.
- **Shapes:** cap bar 4 px. Stamp flat (`stamp/rotation` = 0).

## Pending

- ~~Vercel connection and the Upstash integration (Cole, dashboard).~~ Done Nov 8.

## Additions to the contract at C0 (please review, Nikhil)

These go beyond the plan's TypeScript and can't be renamed after the freeze:
- **`CoversError`** with `code: 'not_found' | 'forbidden' | 'invalid_state' | 'validation' | 'rate_limited'`. Every refusal (rep approves own exception, fund on an uncleared plan, wrong person confirms attendance) rejects with one, so the UI can show the right message.
- Named schemas for results the plan wrote inline: `PlanInput`, `FundResult`, `ReceiptImage`, `CompileResult`, `BreakItResult`. Same shapes.
- `getProof()` takes no `ctx`, as in the plan.
