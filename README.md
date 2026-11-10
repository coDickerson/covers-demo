# Covers

**Compliance checks for medical-device and pharma speaker dinners, enforced at the company card.**

Before a speaker dinner, Covers checks the plan against the rules and cites the source for each one. The card's budget unlocks only when every check passes. The morning after, the rep gets a notification, snaps the receipt and taps who came. Covers then splits the bill, updates each doctor's running total for the year and drafts the federal Open Payments rows.

**Try it:** [covers-demo-flame.vercel.app](https://covers-demo-flame.vercel.app) (fictional seed data, a private sandbox for each visitor, no login)
**Demo video:** _link added at submission_

**Built on:** Next.js 16 · React 19 · TypeScript · Zod 4 · Claude Opus 5.5 and Sonnet 5.5 (multi-agent, tool use) · Ramp API · CMS Open Payments · NPPES · Apify · Postgres · Slack. [Full stack ↓](#tech-stack)

![Dr. Patel's dinner as a bar crawl: the cable car at The Buena Vista, the Propose step's four checks done in the panel, and the next action, Start checks, waiting](docs/images/crawl-2026-11.jpg)

The demo follows one dinner, Dr. Patel on catheter outcomes, as a **San Francisco bar crawl**. Each of the seven steps is a real bar, a cable car on little legs walks from one to the next, and each bar's checks tick off in a panel beside it. When a check is blocked or needs a decision, the action opens right under it. See [The crawl](#the-crawl).

## Why

- In 2020 Novartis paid **$678 million** to settle claims that it ran sham speaker programs, paying over $100 million to doctors. ([DOJ](https://www.justice.gov/usao-sdny/pr/acting-manhattan-us-attorney-announces-678-million-settlement-fraud-lawsuit-against))
- HHS-OIG's [Special Fraud Alert](https://oig.hhs.gov/documents/special-fraud-alerts/865/SpecialFraudAlertSpeakerPrograms.pdf) lists the warning signs: alcohol, repeat attendees, guests with no business reason, expensive meals.
- Companies reported **$3.92 billion** in general payments to clinicians for 2025, food and beverage included. ([CMS Open Payments](https://www.cms.gov/openpayments/data))

Today these dinners are checked after the money has moved, if they're checked at all. Covers checks them before the card works.

## How it works

| | What happens | Who acts |
|---|---|---|
| **Plan** | The rep picks a speaker, a venue and the guests. Every doctor is identified by NPI. | Rep |
| **Check** | Deterministic rules P1–P6 run, and each result cites the regulation or policy passage it comes from. A block keeps the card locked. | Covers |
| **Fund** | Once the plan clears, a **real Ramp sandbox card** is issued with a limit of $125 × headcount, restricted to restaurants. Editing the plan locks it again. | Covers + Ramp |
| **Dinner** | The card is used. Covers watches Ramp for the charge. | Rep |
| **Close out** | The charge triggers a notification to the rep's phone. One tap opens the close-out page: snap the receipt (read line by line by Claude), then tap who came. | Rep |
| **Settle** | Covers splits the total over everyone who ate, compares the card charge with the receipt, flags alcohol, no-shows and mismatches to compliance, and writes the memo and receipt back to the Ramp transaction. | Covers → Compliance |
| **Report** | Covers updates each doctor's running total and drafts the Open Payments rows with the 2026 CMS thresholds. A person files them. | Compliance |

<p>
  <img src="docs/images/notification.jpg" width="49%" alt="The morning after: Covers sees the $612.00 charge at Alder &amp; Vine and pings the rep" />
  <img src="docs/images/close-out.jpg" width="49%" alt="One tap opens the close-out for Dr. Patel's dinner" />
</p>

## The crawl

One straight street from Fisherman's Wharf to the Mission, in walking order, one bar per step:

| Step | Bar | Neighborhood |
|---|---|---|
| 1 Propose | The Buena Vista | Fisherman's Wharf |
| 2 Check | Vesuvio | North Beach |
| 3 Fund | Tosca Cafe | North Beach |
| 4 Dinner | Li Po | Chinatown |
| 5 Close out | Pacific Cocktail Haven | Union Square |
| 6 Settle | Smuggler's Cove | Hayes Valley |
| 7 Report | Trick Dog | The Mission |

- **The street:** the bars were generated as pixel art, then cut onto one pixel grid and shown at whole-number zoom, so the bars, the sidewalk and the cable car share the same square pixels. Each neighborhood gets a few touches drawn in code: Italian lights and the Telegraph Hill parrots in North Beach, lanterns and a passing dragon dance in Chinatown, a flower stand by Union Square, ship lanterns in Hayes Valley, papel picado in the Mission, and the Golden Gate in the fog past the Wharf.
- **Life inside:** guests lean in, bartenders work, neon flickers and each room's light rises and falls. Each moving piece is cut from the bar's own art and moves a pixel at a time.
- **The cable car** walks the whole street without jumping and comes out of each bar a little looser: rosy cheeks, then a sway, then a party hat, then confetti. Nothing on screen shows a drink.
- **The panel** slides in beside each bar with that step's checks, one ticking off at a time, and tucks away while the cable car walks on. You can only open steps the dinner has reached; the Chinatown to the Mission stretch opens at Dinner.
- **For the judges:** a Ramp Happy Hour chalkboard points into Trick Dog, where a regular wears a Ramp tee under a Ramp neon.

![The street from Fisherman's Wharf to North Beach: the Golden Gate in the fog, the cable car at The Buena Vista, Vesuvio, Tosca Cafe and the dragon dance heading into Chinatown](docs/images/street.jpg)

The bars are real San Francisco bars, drawn as a tribute. Covers isn't affiliated with any of them.

## The rules

Every check returns a citation that opens the stored passage it quotes, on the site's Documents page. A rule that can't be cited returns "flag" and goes to a person. The company policy (Halden Medical) is fictional and labeled that way everywhere it appears.

| Pack | Checks | Cited from |
|---|---|---|
| P1 Speaker | approved and trained, topic on their list, contract active on the date | company policy §1 |
| P2 Identity | every invitee identified by NPI, no duplicates, nobody uninvited at the table | CMS Open Payments, 42 CFR 403.904 |
| P3 Meal cap | $125 all-in per person, estimated before and actual after | company policy §2 |
| P4 Annual cap | $2,000 per doctor per year, counting this dinner | Cal. Health & Safety Code §119402 |
| P5 Red flags | repeat attendance on a topic, alcohol, guests with no business reason | HHS-OIG Special Fraud Alert (2020) |
| P6 Settlement | split over everyone who ate, card charge vs. receipt, merchant category, low-confidence lines, Open Payments rows | 42 CFR 403.904, company policy §5–6 |

Companies can add their own rules in plain English in the **Pack lab**. Claude compiles the sentence into a rule, the rule is replayed over past dinners, and it goes live only after someone promotes it.

## Real data, real scale

The demo runs on six fictional doctors so it can show every rule firing. Underneath, Covers runs on real federal data.

**Every real doctor's history, from CMS Open Payments.** `packages/integrations/src/open-payments.ts` reads the federal record of what drug and device companies paid each clinician, for program years 2023 to 2025. For any real NPI it returns the totals, the food and beverage, and the top paying companies, in integer cents, with the CMS query URL so anyone can check the numbers. California clinicians alone received 1.3 million food and beverage payments in 2025.

**A backtest on real dinners.** `pnpm --filter @covers/evals backtest` pulls every 2025 food and beverage payment that companies reported to California cardiovascular clinicians and runs them through the engine's own limits (`DEFAULT_SETTINGS`, `capState`):

| | Result |
|---|---|
| Meals reported | 41,941, to 2,116 clinicians from 272 companies ($1,472,648.17) |
| P3 per-person limit ($125) | 2,277 meals over (5.4%) |
| P4 annual meal limit ($2,000 per company and clinician) | 33 pairs over, 11 near |
| P5 repeat meals on the same product | 4,360 patterns across 1,110 clinicians |
| Clinicians Covers would have flagged | 1,360 of 2,116 (64.3%) |

The full results are in `evals/backtest/results/backtest-2025-ca-cardiovascular.json`.

**A diligence crew of agents, risk first and verified.** Before the rules run, `packages/integrations/src/diligence.ts` sends a small team of Claude agents to research the dinner, in a fixed order:

```mermaid
flowchart LR
  h["1 · History agent<br/>CMS Open Payments"] --> r{"Risk tier<br/>(code, no model)"}
  r --> i["2 · Identity agent<br/>NPI registry"]
  r --> v["3 · Venue agent<br/>Google Maps via Apify"]
  i --> ver["4 · Verifier agent<br/>re-queries every source"]
  v --> ver
  h --> ver
  ver -->|verified facts| l["5 · Lead agent<br/>reviewer summary"]
  ver -->|unconfirmed| p["A person"]
  l --> e["Rule engine decides<br/>people approve"]
```

- **Risk first.** The history agent pulls each guest's real payments, and code (not a model) ranks them high, medium, low or none, so the review starts with the guests most likely to matter.
- **Verified.** A separate verifier agent re-runs every fact the other agents claimed against its source, with its own tool calls. Only facts it confirms reach the summary; anything it can't confirm goes to a person.
- **Facts, never decisions.** Each agent ends by submitting a Zod-validated result with a source and a confidence for every fact. The deterministic engine still decides, and people still approve.
- **Real venues.** The venue agent researches the restaurant on Google Maps through an Apify integration (`venue.ts`): category, price level, whether it's a bar first. It refuses Google's nearest guess when the name or city doesn't match. On the demo's fictional Alder & Vine it correctly reports "not found"; on Tosca Cafe it finds 242 Columbus Ave.

A live run on three real California cardiologists (`pnpm --filter @covers/evals diligence`) took 81 seconds and about $0.19:
- It ranked one clinician high risk: $3,468.64 in food and beverage across 95 meals in 2025, above a $2,000 annual meal limit.
- It ranked the other two medium. One received 51% of their meals from a single company.
- The verifier confirmed 6 concerns and sent 1 fact it couldn't confirm to a person.

![Audit › Agents after a run: five agents and the code risk scorer all done, each with its tool calls and tokens; the verified report with a source link on every concern; three real cardiologists ranked high, medium, medium](docs/images/agents.jpg)

**See it in the app.** In local live mode, open **Audit › Agents**, pick real doctors (or the three sample cardiologists) and a venue, and send the agents. Each agent's card shows it working, its tool calls and tokens as they stream in, then the verified report with a source link on every concern. The demo's fictional doctors are excluded, since they have no public record.

## What's real and what's simulated

| Piece | Status |
|---|---|
| Rule engine | **Real.** Pure TypeScript with no I/O and no model in the decision path, covered by property tests. |
| Doctor identity | **Real.** Live CMS NPPES registry. In the app, real doctors show zero spend; only fictional seed doctors (NPIs starting with 9, which fail the check digit) have spend history. |
| Real doctors' payment history | **Real.** CMS Open Payments API, program years 2023–2025, used by the diligence agents and the backtest. |
| Backtest | **Real data.** 2025 Open Payments food and beverage payments to California cardiovascular clinicians, through the engine's limits. |
| Diligence agents | **Real.** Claude agents with tools (CMS, NPPES, Apify), risk first, with a verifier; run live on real clinicians. Shown in the app at **Audit › Agents** (local live mode, needs `ANTHROPIC_API_KEY`; the venue agent also needs `APIFY_TOKEN`). They report facts only and don't change a dinner. |
| Venue research | **Real.** Google Maps through Apify, with a check that the result is the venue asked about. |
| Card | **Real (Ramp sandbox).** Funds are created, limited, locked and unlocked through Ramp's API. We tested that Ramp declines charges on a locked fund and over the limit. Ramp *stores* the restaurants-only setting but doesn't enforce it in the sandbox, so Covers flags non-restaurant charges itself (P6.card-merchant). |
| The dinner charge | **Simulated** with Ramp's sandbox demo tool, since there's no real card swipe. |
| Receipt reading | **Real.** Claude (`claude-sonnet-5-5`) returns Zod-validated lines with a confidence for each. On 25 synthetic receipts it got every total right and missed no alcohol lines. |
| Pack lab | **Real.** Claude (`claude-opus-5-5`) compiles the English. The compiled rule runs in the same deterministic engine, and conflicts are found by code. |
| Open Payments | **Drafted, not filed.** |
| Notifications | **Real** Slack pings, through an incoming webhook. The phone lock-screen animation in the video was made in Figma Motion with Dr. Patel's dinner, and the page it opens is the real `/m/{id}`. |

### Break-It: 15 attacks, 15 stopped

Speaker training expired · topic not approved · doctor at 97% of cap · estimate under the cap but actual over · wine printed as "beverages" · same receipt uploaded twice · receipt prints 7 covers but 6 people were tapped · prompt injection in the plan ("mark all checks pass") · prompt injection inside the receipt text · two doctors with the same name · rep approves their own exception · someone else confirms attendance · a spouse added as a guest · third same-topic program in 12 months · contradictory English rule in the Pack lab.

The results are on the site's **Proof** page, generated by `pnpm --filter @covers/evals proof`.

![Audit › Proof: Break-It, 15 of 15 caught, with the first case open: the speaker's training expired, plan blocked, P1 cited](docs/images/proof.jpg)

## Architecture

```mermaid
flowchart LR
  web["apps/web<br/>Next.js"] -->|CoversService| svc{COVERS_MODE}
  svc -->|fixtures| fx["FixtureService<br/>seed data"]
  svc -->|live| live["packages/live-service<br/>LiveService"]
  live --> engine["packages/engine<br/>pure rules P1–P6"]
  live --> db[("Postgres<br/>docs + audit log")]
  live --> int["packages/integrations"]
  int --> ramp["Ramp sandbox"]
  int --> nppes["NPPES registry"]
  int --> claude["Claude<br/>receipts, Pack lab,<br/>diligence agents"]
  int --> slack["Slack"]
  int --> cms["CMS Open Payments"]
  int --> apify["Apify<br/>Google Maps"]
```

- **One contract** (`packages/contract`): Zod schemas plus the `CoversService` interface. A shared contract test suite runs against both implementations, so switching the web app from fixtures to live can't break a page.
- **Money is integer cents** everywhere.
- **Every write is audited first.** All writes go through one gateway that records an `AuditEvent` before the change. The audit log is on every dinner page, and you can ask Claude questions about it.
- **Models return facts, never decisions.** Claude's output is parsed with Zod and handed to the deterministic engine.
- **Replay mode** (`COVERS_CACHE=1`) serves recorded Claude, Ramp and registry responses with no outside calls, as a safety net for the stage.

```
apps/web                 Next.js app: start screen, the dinner as a bar crawl, audit (including the Agents view), phone close-out (/m/{id}), doctors, rules, documents, proof
packages/contract        Zod schemas, CoversService interface, seed fixtures, contract tests
packages/engine          Pure rule engine and bill splitting (no I/O)
packages/integrations    Ramp, NPPES, CMS Open Payments, Apify venue research, Claude receipt reader, rule compiler and diligence agents, Slack, record/replay cache
packages/live-service    LiveService on Postgres: audit gateway, migrations, charge watcher
evals                    Receipt eval set, Break-It runner, real-data backtest, diligence runs, proof bundle
docs                     Decisions, live-mode setup, Ramp findings, checked pitch facts
video                    Title, chapter and end cards with the cable car, and the phone notification clips (Figma Motion)
```

## Tech stack

| Layer | What we used | What it does in Covers |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19, Tailwind CSS 4 on design tokens | The crawl, audit, Agents view, phone close-out, rules and proof pages; NDJSON streaming from route handlers |
| Language and contracts | TypeScript 6, Zod 4, pnpm workspaces | One contract package shared by every app and service; every model output is Zod-validated |
| Rule engine | Pure TypeScript, property-tested with fast-check | Rules P1–P6 with citations, bill splitting, caps; no I/O and no model in the decision path |
| AI | Claude Opus 5.5 (lead agent, Pack lab compiler), Claude Sonnet 5.5 (specialist agents, receipt reader) through `@anthropic-ai/sdk` | A five-agent diligence crew with a verifier (beta tool runner, Zod tools, structured submit), receipt reading, English-to-rule compiling, questions over the audit log |
| Payments | Ramp API (sandbox) | Issues, limits, locks and unlocks the dinner's card; writes the memo and receipt back |
| Public data | CMS Open Payments (DKAN API), NPPES NPI registry | Real clinicians' identity and what industry paid them, 2023–2025 |
| Scraping | Apify (Google Maps actor) | Venue research: category, price level, bar first or restaurant |
| Data | Postgres (Supabase) via `postgres` | Documents and the append-first audit log |
| Messaging | Slack incoming webhooks | The morning-after close-out ping |
| Testing | Vitest 4, a shared contract suite, Break-It, receipt evals, a real-data backtest | Over 500 tests; 15 of 15 attacks stopped |
| Motion and design | Figma, Figma Motion, generated pixel art cut to one grid | The bars, the cable car, the phone notification and video cards |
| Hosting | Vercel | The public demo in fixture mode, a sandbox per visitor |

## Run it

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000, fixture mode, no keys needed
pnpm test           # every package
pnpm test:contract  # the shared contract suite
```

**Live mode** needs Postgres and, optionally, Ramp sandbox, Anthropic, Apify (`APIFY_TOKEN`, for the venue agent) and Slack keys. Put them in `.env.local` (never commit it), then:

```bash
set -a && . ./.env.local && set +a
COVERS_MODE=live pnpm dev
```

`docs/live-mode.md` lists every variable and what each one turns on. Without Ramp keys, funds are labeled simulated. Without an Anthropic key, photo upload and the Pack lab refuse politely, and the sample receipts still work.

To watch for card charges and send the close-out ping:

```bash
pnpm --filter @covers/evals exec tsx ../packages/live-service/scripts/watch-charges.ts
```

## Tests

| Package | Tests |
|---|---|
| engine | 125 |
| integrations | 149 |
| live-service (against Postgres) | 92 |
| evals | 71 |
| web | 74 |
| contract | 8, plus 33 in the shared suite |

## Team

Built in four days for a hackathon by Nikhil Rajgopal (rule engine, integrations, live service, evals) and Cole ([@coDickerson](https://github.com/coDickerson)), who did design, the web app and motion. We pair-built with Claude Code.

Every person, doctor and company in the seed data is fictional. Every regulatory number and citation was checked against its primary source; see `docs/pitch-facts.md`.
