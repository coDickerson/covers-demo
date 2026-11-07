# Covers — Implementation Plan (two-builder split, Nov 7–10)

Nov 7, 2026 · @Cole

## Summary

We ship three things by midday Tue Nov 10: a live website a judge can use, a public repo, and a 2–2.5 minute video. Two builders work in parallel without waiting on each other, because the web app runs on a frozen data contract with fixture data from hour one.

**The product.** Covers is a compliance check for medical-device and pharma field sales dinners, enforced through the company card. Before a speaker dinner, it checks four things: the speaker is approved, every doctor is identified by NPI, the meal is under the per-person cap, and no doctor is near the company's annual limit for her. The card's meal budget unlocks only when the plan clears. The morning after, the rep snaps the receipt and taps who came; Covers splits the bill, updates each doctor's running total, and drafts the federal Open Payments row.

**The demo moment.** A rep adds Dr. Ruiz to a dinner and her cap bar turns red: she is $60 from her annual limit. The plan blocks before anyone books a table. After the dinner, Dr. Kim is marked a no-show: the other shares re-flow and her annual total does not move.

**The rule that keeps you independent.** Nobody writes code against the other person's unfinished work. Both of you code against the contract in section 3. Person B's app runs on `FixtureService` from the first hour; Person A's `LiveService` replaces it behind one environment flag at the checkpoints.

**What we ship, by owner**

| Deliverable | Owner | Works without the other person? |
| --- | --- | --- |
| Rule engine, NPI lookup, receipt reader, Ramp sandbox, evals | A | Yes: tested with unit tests and fixture inputs |
| Figma design system, screens, prototype, Motion pieces | B | Yes |
| Judge website (all pages) | B | Yes: runs on fixtures until A's service is live |
| Demo video | B (A records voiceover lines on proof) | Yes: recorded on fixtures if live fails, and labeled |
| Proof data (eval table, Break-It results) | A, as JSON files B renders | Yes: B renders placeholder JSON of the same shape |

## How the split works

One hour together today (C0) to freeze the contract, then each person works in folders only they touch. The web app calls one interface, `CoversService`; an environment flag picks which implementation answers.

- **`COVERS_MODE=fixtures`** — B's `FixtureService` answers from seed JSON and simple stub math. The site works from Saturday night.
- **`COVERS_MODE=live`** — A's `LiveService` answers with the real engine, NPI registry, Claude receipt reader, Postgres and the Ramp sandbox.
- **`COVERS_CACHE=1`** — A's live calls replay stored responses for every model and API call. This is the stage and video safety net.

A shared contract test suite runs against both implementations. If both pass it, flipping the flag cannot break B's pages. That suite, not trust, is what makes the swap safe.

**Repository layout and ownership**

| Path | Owner | What lives there |
| --- | --- | --- |
| `CLAUDE.md` | Joint, frozen at C0 | Rules every Claude Code session follows (section 11) |
| `packages/contract/src/types.ts` | Joint, frozen at C0 | Zod schemas and TypeScript types |
| `packages/contract/src/service.ts` | Joint, frozen at C0 | The `CoversService` interface |
| `packages/contract/fixtures/` | Joint, frozen at C0 | Seed company, speakers, HCPs, the scripted dinner, sample receipts, placeholder proof JSON |
| `packages/contract/tests/` | Joint, frozen at C0 | Contract tests run against any `CoversService` |
| `packages/engine/` | A | Pure rules and allocation; no I/O, no model calls |
| `packages/integrations/` | A | NPPES client, Claude receipt reader, Ramp sandbox client, Slack (P1) |
| `packages/live-service/` | A | `LiveService`, database schema and migrations |
| `evals/` | A | Receipt eval set, Break-It runner; writes `proof/*.json` |
| `apps/web/` | B | Next.js app, every page and component, API route wrappers, `FixtureService`, motion |
| `design/` | B | Exported tokens, Figma links, reference screenshots |
| `video/` | B | Script, shot list, Figma Motion exports, the edit |

**Changing the contract after C0.** A change needs a pull request that touches only `packages/contract`, approved by both of you, at most twice a day (at C1 and C2). Additive changes only: new optional fields, new methods. Never rename or remove a field after C0.

**Branches.** Each person runs Claude Code in their own git worktree on their own branch (`a/main`, `b/main`), and merges to `main` at each checkpoint. Because the folders do not overlap, merges should not conflict.

**Checkpoints** (15 minutes each, both present)

| Checkpoint | When | What must be true |
| --- | --- | --- |
| C0 | Sat Nov 7, 3:30–4:30 pm | Contract, fixtures, contract tests and `CLAUDE.md` merged; repo deploys a blank page to Vercel |
| C1 | Sun Nov 8, 2 pm | A: `LiveService` passes contract tests locally. B: hero screens on fixtures |
| C2 | Sun Nov 8, 10 pm | Flip to live on a preview deploy; each person fixes mismatches on their own side |
| C3 | Mon Nov 9, 1 pm | Full live run end to end; decide whether the video records live or on fixtures |
| C4 | Mon Nov 9, 10 pm | Feature freeze; only bug fixes after this |
| Submit | Tue Nov 10, by noon | Site opens logged out, repo public, video plays |

The diagram below shows how the pieces connect at runtime.

&#91;embedded content: runtime architecture · who owns each part\]

B's pages never import A's packages; they reach A's work only through the contract, so a broken live service falls back to fixtures with one flag.

## The shared contract

This is the whole interface between A and B. Paste it into `packages/contract` at C0, have Claude Code convert each type to a Zod schema, and freeze it. Money is always integer cents. Every result that came from a rule carries a citation.

```ts
// packages/contract/src/types.ts
export type Cents = number; // integer, never a float
export type Ctx = { sessionId: string; actorId: string }; // per-visitor sandbox + who is acting

export type RecipientType = 'physician' | 'physician_assistant' | 'nurse_practitioner' | 'other_clinician' | 'non_hcp';

export type Hcp = {
  npi: string; name: string; credential?: string; specialty?: string; state: string;
  recipientType: RecipientType;
  source: 'seed' | 'nppes';      // seed = fictional demo doctor; nppes = real registry identity, zero spend history
};

export type Speaker = {
  id: string; hcp: Hcp;
  status: 'approved' | 'training_expired' | 'not_contracted';
  approvedTopics: string[]; contractEnds: string; // ISO date
};

export type Rep = { id: string; name: string; territory: string; managerId: string };

export type PlanStatus = 'draft' | 'blocked' | 'needs_approval' | 'cleared' | 'held' | 'reconciling' | 'closed';

export type ProgramPlan = {
  id: string; title: string; purpose: string; topic: string;
  repId: string; speakerId: string; venue: string; date: string; // ISO datetime
  inviteeNpis: string[]; employeeCount: number;
  estimatedPerPerson: Cents;
  status: PlanStatus;
  fundId?: string;                // Ramp sandbox fund, set once cleared
};

export type Citation = { label: string; url?: string; packId: string; ruleId: string; version: string };

export type CheckResult = {
  id: string; ruleId: string; packId: string;
  subject: { kind: 'plan' } | { kind: 'hcp'; npi: string } | { kind: 'line'; lineId: string };
  outcome: 'pass' | 'flag' | 'block';
  message: string;                // one sentence a rep can read
  citation: Citation;
  evidence: string[];             // ids of the facts used (registry record, roster row, ledger entry)
};

export type CapStatus = {
  npi: string; capCents: Cents; ytdCents: Cents;
  projectedCents: Cents;          // ytd + this plan's per-person estimate
  state: 'ok' | 'near' | 'over';  // 'near' = above 80% of cap
  sameTopicCount12mo: number;     // repeat attendance
};

export type Evaluation = { planId: string; status: PlanStatus; checks: CheckResult[]; caps: CapStatus[]; evaluatedAt: string };

export type ReceiptLine = {
  id: string; text: string; amountCents: Cents;
  category: 'food' | 'alcohol' | 'tax' | 'tip' | 'fee' | 'other';
  confidence: number;             // 0..1; below the gate the UI asks for a one-tap fix
};

export type Receipt = { id: string; planId: string; imageUrl: string; lines: ReceiptLine[]; totalCents: Cents; printedCovers?: number };

export type Attendance = { planId: string; attendedNpis: string[]; employeesPresent: number; extraGuests: number; confirmedBy: string };

export type OpenPaymentsRow = {
  npi: string; recipientType: RecipientType; date: string;
  natureOfPayment: 'food_and_beverage'; formOfPayment: 'in_kind';
  amountCents: Cents; reportable: boolean; reason: string; citation: Citation;
};

export type Settlement = {
  planId: string; perPersonCents: Cents; headcount: number;
  byPerson: { who: string; npi?: string; amountCents: Cents }[];
  checks: CheckResult[]; caps: CapStatus[]; openPayments: OpenPaymentsRow[];
  exceptions: CheckResult[];      // what goes to finance
};

export type AuditEvent = {
  id: string; at: string; actorId: string;
  action: string;                 // 'plan.evaluated' | 'fund.issued' | 'receipt.read' | ...
  planId?: string; inputHash: string; model?: string; promptVersion?: string;
  packId?: string; ruleId?: string; detail: string;
};

export type RulePack = { id: string; name: string; version: string; effective: string; english: string; compiled: unknown; status: 'draft' | 'live' };
export type ReplayDiff = { packId: string; mealsReplayed: number; changed: { planId: string; before: PlanStatus; after: PlanStatus; why: string }[] };

export type ProofBundle = {
  receiptEval: { cls: string; precision: number; recall: number; n: number }[];
  breakIt: { id: number; attack: string; expected: string; passed: boolean; note: string }[];
  realVsSimulated: { piece: string; status: string; howWeKnow: string }[];
  generatedAt: string;
};
```

```ts
// packages/contract/src/service.ts
export interface CoversService {
  // reference data
  listSpeakers(ctx: Ctx): Promise<Speaker[]>;
  searchHcps(ctx: Ctx, q: string): Promise<Hcp[]>;         // name or NPI; live = NPPES registry
  listReps(ctx: Ctx): Promise<Rep[]>;

  // before the dinner
  createPlan(ctx: Ctx, input: Omit<ProgramPlan, 'id' | 'status' | 'fundId'>): Promise<ProgramPlan>;
  updatePlan(ctx: Ctx, id: string, patch: Partial<ProgramPlan>): Promise<ProgramPlan>;
  evaluatePlan(ctx: Ctx, id: string): Promise<Evaluation>;
  approveException(ctx: Ctx, id: string, checkId: string, note: string): Promise<Evaluation>; // actorId must differ from the rep
  issueFund(ctx: Ctx, id: string): Promise<{ fundId: string; limitCents: Cents; rampUrl?: string; simulated: boolean }>;

  // after the dinner
  submitReceipt(ctx: Ctx, planId: string, image: { base64: string; mime: string } | { sampleId: string }): Promise<Receipt>;
  fixLine(ctx: Ctx, receiptId: string, lineId: string, patch: Partial<ReceiptLine>): Promise<Receipt>;
  confirmAttendance(ctx: Ctx, a: Attendance): Promise<Settlement>;
  getSettlement(ctx: Ctx, planId: string): Promise<Settlement | null>;

  // compliance views
  listPlans(ctx: Ctx): Promise<ProgramPlan[]>;
  getLedger(ctx: Ctx): Promise<CapStatus[]>;
  listAudit(ctx: Ctx, filter?: { planId?: string }): Promise<AuditEvent[]>;

  // pack lab
  listPacks(ctx: Ctx): Promise<RulePack[]>;
  compilePack(ctx: Ctx, english: string): Promise<{ pack: RulePack; tests: { name: string; passed: boolean }[] }>;
  replayPack(ctx: Ctx, packId: string): Promise<ReplayDiff>;
  promotePack(ctx: Ctx, packId: string): Promise<RulePack>;

  // judge tools
  runBreakIt(ctx: Ctx, caseId: number): Promise<{ passed: boolean; checks: CheckResult[]; note: string }>;
  getProof(): Promise<ProofBundle>;
  reset(ctx: Ctx): Promise<void>;
}
```

**The seed scenario** (in `packages/contract/fixtures`, written together at C0; every person and company is fictional):

- Company: Halden Medical, a mid-size device maker. One rep (Jordan Lee, Bay Area), one compliance lead (Priya Shah).
- Speakers: Dr. Marcus Patel (approved for the topic), Dr. Lena Ortiz (training expired).
- HCPs: five fictional doctors with fake NPIs. Dr. Ana Ruiz has $1,940 of a $2,000 annual cap already spent and attended the same topic twice in the last 12 months. Dr. Grace Kim is the scripted no-show after the dinner.
- The scripted dinner: "Speaker dinner: Dr. Patel on catheter outcomes," six invitees, $110 estimated per person.
- Two sample receipts: the clean one ($612 for 6 covers, one wine line) and a hard one (blurry, a line labeled "beverages").
- Placeholder `proof.json` with the right shape and obviously fake numbers, which A replaces with real results.

Never attach invented spend to a real doctor. In judge mode, a real NPI lookup returns that doctor's real registry identity with zero spend history.

## Rule packs

Six packs run in the engine; a seventh is written in English on stage. Each rule carries a citation, a version, an effective date and at least one test case. A rule we cannot cite does not decide anything; it sends the case to compliance. Have your dad or Kaley read this table before Monday.

| Pack | Rule | Runs | Outcome | Source | Verify before demo |
| --- | --- | --- | --- | --- | --- |
| P1 Speaker eligibility | Speaker status is approved, the topic is on their approved list, the contract is active on the dinner date | Before | Block | Company policy; OIG lists speaker selection and training payments among its concerns | Ask Kaley how her company keeps the roster |
| P2 HCP identity | Every invitee resolves to an NPI and a recipient type; a weak match becomes a pick-list, never a guess | Before | Flag | Open Payments covers more than physicians, so the type matters | Confirm covered recipient types on the CMS site |
| P3 Per-person meal cap | Estimated per-person cost is at or under the cap (default $125, set by the admin); after dinner, actual per-person over the cap goes to compliance | Before and after | Block before, exception after | Company policy; $125 per person for out-of-office dinners is a common industry control ([Guidehouse](https://guidehouse.com/-/media/www/site/insights/life-sciences/2018/physician-feed-thysef.pdf)) | Kaley's actual cap |
| P4 Annual cap per HCP | Year-to-date plus this dinner stays under the HCP's annual cap; above 80% shows "near" | Before and after | Block for that HCP over the cap; flag when near | Company policy; California requires companies to set an annual per-HCP limit (Henry Schein publishes $2,500, Roche Diagnostics $2,000) ([Brasseler](https://brasselerusa.com/wp-content/uploads/2026/05/California-One-Pager-2025-Final.pdf), [Roche](https://diagnostics.roche.com/us/en/about-us/california-compliance-declaration.html)) | Cite the statute itself, not a company page |
| P5 OIG red flags | Alcohol on the receipt; the same HCP at the same topic twice or more in 12 months; non-HCP guests such as spouses | After (repeat attendance also before) | Flag | HHS-OIG Special Fraud Alert on speaker programs, Nov 16, 2020 ([JD Supra summary](https://jdsupra.com/legalnews/oig-turns-up-the-volume-on-industry-44784)) | Open the OIG alert itself and quote one line at most |
| P6 Open Payments draft | Per-person value = food and beverage total ÷ everyone who ate; a row only for covered recipients who attended; no-shows get no row | After | Draft rows, stamped "Drafted, humans file" | CMS Open Payments rules (secondary summaries in the old PRD) | The current small-payment threshold on the CMS site |
| P7 Pack lab (live on stage) | Written in English, for example "Weekend dinners need manager approval" | Before | As compiled | Fictional company policy, labeled as such | None; it is a company rule |

**How a rule gets in.** English text → Claude compiles it to a pack validated by a Zod schema and generates tests → the pack replays over 20 seeded past dinners and shows which outcomes change → a human clicks Promote → only then does the deterministic engine run it. The model writes rules; it never applies them.

**Order matters for the demo.** P1 and P4 are the ones a judge remembers (unapproved speaker, a doctor near her cap). P5 gives the AI-native moment: repeat attendance is visible only across every rep's dinners, never in one transaction.

## Person A — engine and integrations

A owns everything that produces a fact or a number, and proves it with tests and an eval. A never touches `apps/web`; A's work is visible to B only through `CoversService` and `proof/proof.json`.

| # | Task | When | Done when |
| --- | --- | --- | --- |
| A1 | Ramp sandbox spike (90 min, time-boxed) | Sat 4:30–6 pm | Decision written in `docs/ramp-spike.md`: real, partly real, or mocked |
| A2 | Engine: packs P1–P6, `evaluate()` and `settle()` | Sat 6 pm–midnight | Scripted dinner blocks Dr. Ruiz and Dr. Ortiz; settlement math exact; invariant tests pass |
| A3 | NPPES registry client | Sat late or Sun early | Search by name, state or NPI returns typed `Hcp` records; results cached |
| A4 | `LiveService` and database | Sun 8 am–1 pm | Contract tests pass against `LiveService` (C1) |
| A5 | Receipt reader | Sun 1–5 pm | Both sample receipts read; low-confidence lines flagged; totals reconcile to the cent |
| A6 | Ramp client | Sun 5–8 pm | Fund issued only for a cleared plan; receipt and memo attached; `simulated` flag honest |
| A7 | Pack lab: compile, replay, promote | Sun 8–10 pm | An English rule becomes a validated pack, replays over 20 dinners, and changes the next result |
| A8 | Eval set and Break-It suite | Mon 8 am–1 pm | `proof/proof.json` holds real numbers, misses included |
| A9 | Cache mode and hardening | Mon 1–6 pm | `COVERS_CACHE=1` runs the whole demo with the network off |
| A10 | Slack pings (only if A1–A9 are done) | Mon evening | Before and after pings arrive in a real Slack workspace |

**A1 — Ramp sandbox spike.** The old PRD found a self-serve sandbox (UI at demo.ramp.com, API at demo-api.ramp.com); confirm in Ramp's docs first. Steps, stopping at the first failure:

1. Create the sandbox account and a developer app with client credentials and scopes for funds or limits, transactions, receipts and cards.
2. Get a token; list users and cards.
3. Create a fund with a cap and a restaurant restriction; poll its task until it exists.
4. Check whether the sandbox can produce a cleared transaction. If not, use a seeded one.
5. Attach a receipt and set a memo on that transaction.
6. Screenshot steps 3 and 5 in Ramp's own UI for the video.

All pass → fully real. Step 4 fails → real fund plus a seeded transaction, labeled. Steps 1–3 fail → `issueFund` returns `simulated: true`, and the proof page says why.

**A2 — Engine rules.** Pure TypeScript, no I/O, no model imports (enforce with a lint rule). Inputs are plain objects; outputs are `Evaluation` and `Settlement`.

- Per-person value = food and beverage total ÷ everyone who ate (HCPs, employees, extra guests), split with largest-remainder rounding so no cent is lost.
- Invariants (fast-check): shares sum to the total; the same input gives a byte-identical output hash; removing an attendee never changes the total; toggling one pack changes only that pack's results.
- The scripted dinner must produce: Dr. Ortiz blocked (training expired) if chosen as speaker; Dr. Ruiz blocked ($1,940 + $110 > $2,000) and flagged (third same-topic program).

**A3 — NPPES client.** Use the CMS NPI Registry API (confirm the current version and endpoint). Map taxonomy codes to `recipientType`. Never store anything beyond what the registry returns.

**A4 — `LiveService`.** Supabase Postgres, every table keyed by `session_id`. First visit copies the seed into that session; `reset` deletes and re-seeds it. All writes go through one gateway function that writes an `AuditEvent` first; the audit table has UPDATE and DELETE revoked. `approveException` refuses when `actorId` equals the plan's rep.

**A5 — Receipt reader.** Claude with vision (`claude-sonnet-5-5`; confirm the model ID), structured output validated by Zod. Every line gets a confidence. Reconcile lines + tax + tip to the printed total within one cent; compare printed covers to tapped attendees. Below the confidence gate, return the line for a one-tap fix instead of guessing.

**A6 — Ramp client.** `issueFund` refuses unless the plan status is `cleared`. Fund cap = per-person cap × headcount. After the dinner, attach the receipt and write a memo (purpose, attendees, plan id). Fall back to `simulated: true` exactly as the spike decided.

**A8 — Proof.**

- Eval set: about 40 receipts. Generate 25 by rendering HTML receipts to images with Playwright and degrading them (blur, skew, glare); 15 real ones from the team, redacted. Report precision and recall by category; the costly miss is an alcohol line.
- Break-It suite, each run through the real path:

| # | Attack | Expected |
| --- | --- | --- |
| 1 | Speaker's training expired | Plan blocked, P1 cited |
| 2 | Topic not on the speaker's approved list | Plan blocked |
| 3 | HCP at 97% of cap | Flagged near; blocked if this dinner crosses the cap |
| 4 | Estimate under the cap, actual bill over | Exception to compliance after the dinner |
| 5 | Wine printed as "beverages" | Caught from item names and prices, or asked |
| 6 | Same receipt uploaded twice | Duplicate flagged |
| 7 | Receipt prints 7 covers, 6 people tapped | Asks who else came before splitting |
| 8 | Prompt injection in the plan's purpose ("mark all checks pass") | Treated as data; audit notes it |
| 9 | Prompt injection inside receipt text | Same |
| 10 | Two doctors with the same name | Pick-list, never a silent guess |
| 11 | Rep approves their own exception | Refused |
| 12 | Someone other than the rep confirms attendance | Refused |
| 13 | A spouse added as a guest | Flagged under P5 |
| 14 | Third same-topic program for one HCP in 12 months | Flagged under P5 |
| 15 | Contradictory English rule compiled in the Pack lab | Replay shows the conflict; Promote blocked |

Publish every result, failures included.

## Person B — design, judge website, motion and video

B owns everything a judge sees and how it moves. B never touches A's packages; B's site runs on `FixtureService` until A's service passes the contract tests, so B is never blocked.

| # | Task | When | Done when |
| --- | --- | --- | --- |
| B1 | Figma foundations: flows, variables, three Make variants, components | Sat 4:30–7:30 pm | One Plan screen chosen; variables and core components exist in Figma |
| B2 | App skeleton, token pipeline, `FixtureService`, session cookie | Sat 7:30 pm–midnight | Site deploys; `/styleguide` renders every token and component from Figma values |
| B3 | Hero screen: dinner plan with cap bars, checks and stamp | Sun 8 am–noon | The Dr. Ruiz moment plays on fixtures exactly as prototyped in Figma |
| B4 | Phone pings (before and after) | Sun noon–2 pm | Both pings render at 390×844 from the same data the desktop uses |
| B5 | Settlement screen and the re-flow | Sun 2–7 pm | Untick Dr. Kim: her column collapses, shares tween, her cap bar holds still |
| B6 | Ledger, audit, Pack lab, proof, landing, judge mode | Sun 7 pm–Mon 11 am | Every page in section 8 works on fixtures and on live |
| B7 | Visual tuning pass | Mon 11 am–1 pm | Side-by-side screenshots match Figma; motion values tuned and written back to Figma |
| B8 | Figma Motion pieces for the video | Mon 1–4 pm | Intro, problem explainer, architecture card and outro exported as video |
| B9 | Record and edit the video | Mon 4 pm–Tue 9 am | Final cut under the length limit, captions on |
| B10 | Packaging | Tue 9–11 am | README top half, `DEMO.md`, Devpost text, links checked logged out |

**B2 — the token pipeline** is what lets you fine-tune the look without touching component code (details in section 7). Figma variables → `design/tokens.json` → `apps/web/styles/tokens.css` (CSS custom properties) → Tailwind theme. Every color, size, radius, duration and easing in the app reads a token. No hard-coded hex or millisecond values in components; a lint rule enforces it.

**B2 — `FixtureService`.** Lives in `apps/web/lib/fixture-service.ts`. It returns seed data, keeps state in memory per session, and does stub math good enough for judge-created plans (cap check, per-person split). It must pass the same contract tests as A's `LiveService`.

**B3, B5 — animation is choreographed by the client.** The service returns final results; the UI stages the reveal (checks tick in one by one, the cap bar fills, the stamp lands). That keeps timing under your control and identical in fixtures and live. Use the Motion library with durations and easings from tokens.

**The moments to nail, in priority order**

1. Cap bar: Dr. Ruiz's bar fills to $1,940, the projected $110 extends past the cap line in the alert color, and her row and the plan header switch to Blocked.
2. Stamp: when every check passes, a "Cleared" stamp lands on the plan and the card limit appears with a "Written to Ramp" link.
3. Re-flow: after the dinner, unticking a no-show collapses her column, the other shares tween to the new value, and her cap bar does not move.
4. Receipt stream: lines appear as they are read, each with a confidence dot; the wine line tags itself.

Everything else can be plain and fast. Spend polish on these four.

## Figma workflow

Figma is the source of truth for how Covers looks and moves, and the code follows it through variables. Budget about 3 hours of Figma before Sunday morning and 3 hours of Motion on Monday. moa won Best Design by making one abstract thing visible; for Covers that thing is a doctor's running total and the card that unlocks only when the plan is clean.

**File structure** (one design file, both of you as editors; the Figma connector needs edit access, which is why we could not read moa's file)

| Page | What goes there |
| --- | --- |
| 00 Cover | Wordmark, one-line pitch; doubles as the Devpost thumbnail |
| 01 Flows | Link to a FigJam board: rep flow, compliance flow, the four moments |
| 02 Foundations | Variable collections: color, type, space, radius, motion |
| 03 Components | Cap bar, check row, stamp, status pill, money cell, confidence dot, citation chip, ping card, receipt line |
| 04 Screens | Desktop frames at 1440×900; phone frames at 390×844 |
| 05 Prototype | Before and after frames for each of the four moments, linked with Smart Animate |
| 06 Motion | Video pieces: intro, problem explainer, architecture card, outro |
| 07 Handoff | Notes per screen, links to code routes, reference screenshots |

**Visual direction.** Start from a document, not a dashboard: a warm off-white page, near-black ink, one accent color, and three status colors (ok, near, over). Two signature elements carry the identity:

- **The cap bar**: a thin horizontal bar per doctor, a hard vertical line at the cap, and the projected spend extending past it in the over color.
- **The stamp**: "Cleared" or "Blocked" lands on the plan like an ink stamp, slightly rotated, with the rule that decided it underneath.

Type: one grotesk with tabular numerals for every amount, and one serif only for the wordmark and video titles. No emoji, no gradients, no illustrations of doctors.

**Variables are the tuning surface.** Name every variable exactly as its CSS token, with slashes becoming dashes (`color/status/over` → `--color-status-over`).

| Collection | Examples | Notes |
| --- | --- | --- |
| color | `color/bg/canvas`, `color/ink/primary`, `color/accent`, `color/status/ok`, `color/status/near`, `color/status/over` | Light mode only unless time allows |
| type | `type/size/body`, `type/size/amount`, `type/weight/strong` | Amounts always tabular |
| space and radius | `space/2` … `space/12`, `radius/card` | Steps of 4 |
| motion | `motion/duration/fast` (160), `motion/duration/base` (240), `motion/duration/slow` (480), `motion/stagger` (60), `motion/ease/standard` | Starting values in ms; tune in the prototype |

**Step by step**

1. **FigJam flows (20 min).** Map the rep flow (plan → checks → cleared or blocked → dinner → receipt → attendance → settled) and the compliance flow (ledger → exception → approve). This doubles as the `DEMO.md` outline.
2. **Foundations (40 min).** Create the variable collections above. Use them for every fill, size and radius from the first frame.
3. **Figma Make for variants (40 min).** Paste the Plan screen spec below and generate three variants. Pick one direction; do not ship Make's code. Rebuild the chosen one with your components.
4. **Components and screens (1 hr).** Build the nine components, then the Plan screen and the two phone pings. The rest of the screens can be built straight in code from the components.
5. **Prototype the four moments (40 min).** Two frames per moment, Smart Animate between them, durations and easing from the motion variables. This is the timing reference the code must match.
6. **Motion pieces (Mon, 3 hr).** See section 9.

**Plan screen spec for Figma Make**

> Desktop web app screen, 1440×900, for a compliance tool used by medical-device sales reps. Title: "Speaker dinner: Dr. Patel on catheter outcomes, Thu Nov 12, 7 pm". Left column: the plan (speaker with an "Approved" badge, venue, purpose, estimated $110 per person). Center: a list of six invited doctors, each row showing name, specialty, NPI, and a thin horizontal bar of year-to-date spend against an annual cap with a vertical cap line; one doctor (Dr. Ana Ruiz) has her bar nearly full with the projected amount extending past the cap in red. Right column: a checklist of five rules, each with pass, flag or block and a small citation link. Top right: a large status stamp reading "Blocked". Calm, document-like, warm off-white background, near-black text, one accent color, tabular numerals, no gradients, no illustrations.

**Using Figma from Claude Code.** Connect the Figma MCP server to both Claude Code sessions. The calls you will use:

- `get_variable_defs` on the Foundations frame → regenerates `design/tokens.json` and `styles/tokens.css` (the `pnpm tokens:pull` script is just a prompt Claude Code runs).
- `get_design_context` and `get_screenshot` on a screen frame → Claude Code builds or corrects that screen against the reference image.
- `get_motion_context` on a prototype or Motion frame → durations and easing to match in code (confirm what it returns before relying on it).

**The two-way tuning loop** (this is how you fine-tune the look precisely)

1. **Tune in Figma, pull to code.** Change a variable in Figma, run `tokens:pull`, and the site updates without touching any component.
2. **Tune in the browser, push to Figma.** A dev-only Tune panel (press `T`) has sliders for motion durations, stagger, easing, accent color, bar thickness and stamp rotation. It writes CSS variables live; "Copy tokens" copies the JSON, which you paste back into Figma variables so Figma stays the source of truth.
3. **Compare side by side.** `pnpm shots` uses Playwright to capture each key state at 1440×900 and 390×844. A `/styleguide/compare` page shows each shot beside the matching Figma frame from `get_screenshot`. Fix the differences on the code side, not by redrawing Figma.

## Judge website

A judge opens one link, logged out, and can either watch the scripted dinner step by step or build their own and try to break it. Every visitor gets a private copy of the seed data, so nobody's testing collides with anyone else's.

| Route | What the judge can do | Service calls |
| --- | --- | --- |
| `/` | Read the one-liner; choose "Run the guided demo" or "Try it yourself"; links to proof, repo and video | none |
| `/demo?step=1…8` | Click through the scripted dinner with a caption per step; also the recording path for the video | all, in order |
| `/plans/new` | Pick a speaker (Dr. Ortiz fails), add doctors from the seed or by real NPI lookup, set venue and estimate, write the purpose, then Evaluate | `listSpeakers`, `searchHcps`, `createPlan`, `evaluatePlan` |
| `/plans/[id]` | See checks, cap bars and the stamp; request an exception; switch to the compliance role to approve it; issue the fund | `evaluatePlan`, `approveException`, `issueFund` |
| `/plans/[id]/after` | Upload their own receipt photo or pick a sample; tap who came; watch the re-flow; see Open Payments rows and exceptions | `submitReceipt`, `fixLine`, `confirmAttendance` |
| `/m/[id]` | The phone pings; the desktop shows a QR code so a judge can open the ping on their own phone | `evaluatePlan`, `confirmAttendance` |
| `/compliance` | The ledger: every doctor's cap bar, filters for near, over and repeat attendance, the exception queue | `getLedger`, `listPlans` |
| `/audit` | Every decision with rule, citation, model and who confirmed | `listAudit` |
| `/packs` | Write a rule in English, compile it, see the replay diff, promote it, then re-run a plan | `compilePack`, `replayPack`, `promotePack` |
| `/proof` | Eval table, a 15-cell Break-It grid where each cell has a Run button, the real-vs-simulated table | `getProof`, `runBreakIt` |

**Always visible in the header:** a role switch (Rep: Jordan Lee / Compliance: Priya Shah), so judges can test that a rep cannot approve their own exception; a "Plant an attack" menu that runs any Break-It case on their session; and Reset.

**Per-visitor sandbox.** First visit sets a session cookie and copies the seed into that session. Data expires after 24 hours. No login. Uploaded receipt photos are deleted with the session, and the upload screen says so.

**Guardrails for a public link.** Cap model calls per session (for example 20 receipt reads) so a judge cannot burn the API budget. When `COVERS_CACHE=1` is on, show a small banner: "Replaying recorded responses." Every panel has a designed loading, empty and error state, so a slow network never shows a blank screen.

**Judge mode with real doctors.** A real NPI lookup returns the doctor's real registry name, specialty and state with zero spend history. The seed doctors with spend history are fictional and labeled "demo data." Never show invented payments next to a real person's name.

## Demo video

The video is about 2:30 (confirm the limit tonight): Figma Motion carries the story beats, and real screen capture carries the product. The rule is simple: anything that claims the product works is a real recording; anything that explains why it matters can be animated.

| Time | Beat | Made with |
| --- | --- | --- |
| 0:00–0:06 | Cold open: six name cards at a table; one doctor's bar fills past a line; "Blocked" stamps down | Figma Motion |
| 0:06–0:25 | The problem: a map of reps and dinners; the four questions appear one by one (approved speaker, NPIs, per-person cap, annual limit) | Figma Motion |
| 0:25–0:35 | The gap: "Ramp records who was there. Nothing checks whether the dinner should happen." | Figma Motion title card |
| 0:35–1:15 | Before: rep builds the plan, checks tick in, Dr. Ruiz's bar goes red, she is removed, "Cleared" stamps, the fund appears in Ramp's own UI | Screen capture of `/demo`, then Ramp sandbox |
| 1:15–1:40 | After: the phone buzzes, receipt photo, lines stream in, wine tags itself, Dr. Kim is unticked as a no-show, shares re-flow, Open Payments row drafted, written to Ramp | Phone capture, then screen capture |
| 1:40–1:55 | New rule in English, replay over past dinners, Promote, the next plan changes | Screen capture of `/packs` |
| 1:55–2:15 | Proof: eval numbers with misses, Break-It grid, real vs simulated; architecture card "models read, code decides" | Screen capture, then Figma Motion card |
| 2:15–2:30 | Outro: the closing line and the URL | Figma Motion |

The before and after use different doctors on purpose: Dr. Ruiz is blocked and removed before the dinner, and Dr. Kim (a fictional seed doctor) is the no-show after it.

**Figma Motion pieces** (B, Monday 1–4 pm): intro, problem explainer, gap card, architecture card, outro. Build them from the same components and variables as the app, so the animated and recorded parts look like one product. Export each at 1920×1080, 30 fps. If the Figma connector's video export is available in Claude Code, use it; otherwise export from Figma directly.

**Recording.**

- Record the product with Screen Studio (or QuickTime) at 1440×900 in a clean browser profile, bookmarks bar hidden, at 2× zoom on key moments.
- Record on live mode if C3 passed; otherwise on fixtures, and say "recorded on seeded data" in a caption.
- Record three full takes plus one take with `COVERS_CACHE=1` as the fallback.
- Edit in Descript or similar; burn in captions; your own voice, music low or none.

**Voiceover draft** (about 330 words; built on your pitch's language)

> Some of the most complicated company expenses are dinners. The rules care who sat at the table, why you met, and what's on the receipt.
>
> At a medical-device company, reps run speaker dinners with doctors every week. Before each one, someone should check four things. Is the speaker approved? Is every doctor identified? Is the meal under the per-person cap? Is any doctor about to pass the company's annual limit for her? Today, compliance finds out after the money is gone.
>
> Ramp records which doctors were at dinner. Nothing checks whether the dinner should happen. That's Covers.
>
> Jordan books a speaker dinner. Covers identifies each guest from the federal registry and checks the plan. Dr. Ruiz is sixty dollars from her annual limit, so the plan is blocked before anyone books a table. Jordan removes her. Every check passes, and only now does the card's meal budget unlock, written straight into Ramp.
>
> The next morning, one ping: snap the receipt, tap who came. Covers reads every line, catches the wine, and notices Dr. Kim didn't make it. Her share moves to everyone else, her annual total doesn't change, and no federal report is drafted for her. Only the unclear cases go to compliance, with evidence attached.
>
> New regulations become new rule packs, not new software. Write the rule in English; Covers compiles it, replays it over past dinners, and a person promotes it.
>
> The model reads receipts and registries. It never decides an amount. Here's our accuracy on forty receipts, including the misses, and fifteen attacks we ran against it.
>
> Ramp knows when money moves. Covers knows who it reaches, and whether the law cares.

## Claude Code setup

Export this doc as Markdown into the repo as `docs/implementation.md`, put the block below in the root `CLAUDE.md`, and start each session with its kickoff prompt. Connect the Figma MCP server to both sessions (follow Figma's MCP setup docs) and make both of you editors on the Figma file.

**Stack:** pnpm workspaces; Next.js (App Router) and TypeScript; Tailwind; Motion; Zod; Vitest and fast-check; Playwright; Supabase Postgres; Vercel; the Anthropic API.

**Root `CLAUDE.md`**

```markdown
# Covers — rules for every Claude Code session

Covers checks medical-device speaker dinners before the card is used and settles them after.
Full plan: docs/implementation.md. Contract: packages/contract (frozen).

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
```

**C0 kickoff (together, one session)**

> Read docs/implementation.md. Scaffold a pnpm monorepo with the layout in "How the split works." Create packages/contract with the types and the CoversService interface from "The shared contract," converted to Zod schemas with inferred types. Write the seed fixtures for the scenario described there, all fictional. Write a contract test suite in packages/contract/tests that takes any CoversService and checks every method's shape plus the scripted scenario (Dr. Ruiz blocked, Dr. Ortiz blocked as speaker, Dr. Kim's no-show leaves her total unchanged). Add the root CLAUDE.md. Deploy a blank Next.js page to Vercel. Stop and show me the contract before committing.

**Person A kickoff**

> You are Person A on Covers. Read CLAUDE.md and docs/implementation.md, especially "Person A" and "Rule packs." Work through tasks A1 to A10 in order. Start with the Ramp sandbox spike and write the decision to docs/ramp-spike.md. For the engine, write the invariant tests before the code. After each task, run the tests, commit with the task id in the message, and tell me what is done and what is next. Never edit apps/web or packages/contract.

**Person B kickoff**

> You are Person B on Covers. Read CLAUDE.md and docs/implementation.md, especially "Person B," "Figma workflow" and "Judge website." Work through tasks B2 to B10 in order (B1 is done in Figma by hand). First build the token pipeline: use the Figma MCP's get\_variable\_defs on the Foundations frame I give you to write design/tokens.json and apps/web/styles/tokens.css, and make `pnpm tokens:pull` repeat that. Then build FixtureService so it passes the contract tests, then the screens. For each screen, call get\_design\_context and get\_screenshot on the Figma frame I link and match it. Never edit packages outside apps/web, design and video.

**Prompts you will reuse**

- Token sync: "Run tokens:pull against the Foundations frame and show me which tokens changed."
- Screen match: "Here is the Figma frame link for the Settlement screen. Compare it with `pnpm shots` output for /plans/demo/after and fix every difference in spacing, type and color."
- Motion match: "Read the motion context of the 'Cap bar — before/after' prototype and make the cap-bar animation use the same durations, stagger and easing tokens."

## Risks, fallbacks and open questions

The biggest risk is not a bug; it is spending Sunday on polish before the four moments work end to end. Build the moments first, everything else second.

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| Ramp sandbox cannot hold a fund until approval, or cannot produce a cleared transaction | Medium | Seeded transaction or `simulated: true`, stated on the proof page and in a video caption |
| Live mode fails at C2 or C3 | Medium | Ship on fixtures plus cache mode; the site still works and the real-vs-simulated table says so |
| Receipt reader misses an alcohol line | Medium | Confidence gate asks instead of guessing; report the miss on the proof page |
| A rule is wrong in front of someone who knows | Medium | Kaley or your dad reads the rule-pack table by Monday; uncited rules go to compliance |
| Judges say "big pharma already does this in Veeva" | Medium | "Nothing checks it at the card, before the money moves"; ask Kaley what she uses first |
| Polish eats build time | High | Only the four moments get custom motion; C4 freeze at 10 pm Monday is final |
| Public link burns the API budget | Low | Per-session caps on model calls; cache mode |
| Real doctors shown with fake spend | Low, high cost | Seed doctors are fictional; NPI lookups show zero history |

**Open questions to close tonight**

- [ ] Who is Person A and who is Person B?
- [ ] What are the video length limit, the exact Nov 10 deadline time and the final-round slot length?
- [ ] Is there an official rubric from Ramp's info session?
- [ ] Message Kaley: what do they use today, how far ahead are dinners planned, what is their per-person and annual cap, and can we cite "a senior accounting manager at a medical-device company"?
- [ ] Is a sandbox login at demo.ramp.com created?
- [ ] Do we have about 15 real receipts we can redact for the eval set?
