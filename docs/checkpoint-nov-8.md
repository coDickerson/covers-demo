# Checkpoint — Sun Nov 8

Where Cole (B) has landed on the product, what is settled, and what Cole and Nikhil need to agree next.
Deadline: **Tue Nov 10, 11:59 PM PT.**

**See it:** https://claude.ai/artifact/4xHKXcVoFjtngipMBrjEXS (ask Cole for access), or open `design/prototype/covers-app.html` in a browser.
It is a prototype on scripted, fictional data. Open the Dr. Patel Nov 12 row for the full animated run.

## What exists

| Piece | Where | State |
|---|---|---|
| Prototype: dashboard plus nine dinners | `design/prototype/covers-app.html` | The design target. Scripted, saves per browser |
| App baseline: one dinner on demo data | `apps/web/app/page.tsx`, `apps/web/components/`, `apps/web/lib/dinner.ts`, `apps/web/lib/documents.ts` | Works end to end through the real service. Its look is older than the prototype and will be rebuilt to match |
| Design tokens | `design/tokens.json` | Volt accent, plus `color/accent-tint`. Figma still needs that one variable added |
| Earlier storyboard | `design/storyboard.html` | Superseded by the prototype |

## The product now

- **Home is a dashboard:** one row per dinner, with the same seven stops lined up (Propose, Check, Fund, Dinner, Close out, Settle, Report). Counts at the top are the filters: need you, in progress, done.
- **Clicking a row opens that dinner's map.** A small bell (a cloche) walks the path and stops at each checker. Cards fill in as it works, and it stops whenever a person has to act.
- **The six checkers are the six rule packs, P1–P6.** Four run twice: before the dinner on the plan, and after it on what actually happened.
- **Every square expands in place** to show what it found, what it looked at, what Covers suggested and why, the other options, who decided, and the sources. Sources open the document with the passage highlighted.
- **Every square takes input,** a checkbox or a written note depending on context. The run pauses while a square is open.
- **Finished steps can be reopened at any time.** You can't jump ahead.
- **Progress saves per dinner.** The audit trail is a list on the right, collapsed until opened.

## Settled by Cole

Floating pill menu on top. Volt accent. Cloche as the guide. Form follows function: every animation has to show real work. Dashboard rows, not a board or calendar. Detail expands on the page, not in a side bar.

## Calls made to keep moving — push back on any

| # | Call | Why | Alternative |
|---|---|---|---|
| 1 | Dashboard columns use both stripes and the step name under the bell | Reads best of the three tried | Stripes only, or names only |
| 2 | Three inputs change the outcome: correct a receipt line, ask compliance to review, hold a row. All others are notes on the record | These are where a person really redirects the work | More or fewer |
| 3 | Make Slack and the Open Payments export real. Show calendar, DocuSign, training system, Veeva and NetSuite as clearly labeled simulations | Slack is visible and achievable; the export is a file we generate; the rest need access we won't get by Tuesday | Add Google Calendar if time allows |
| 4 | Rebuild the app to match the prototype, on demo data first, then connect live | Keeps the frontend moving without blocking on the backend | Ship the prototype's scripted flow for the demo |
| 5 | Compliance doesn't get a Recommended option on exceptions | It's her judgment, and the engine has no basis for one | Recommend based on policy |
| 6 | Say "pharma and device" carefully in anything citing the Novartis case, which was pharma | Accuracy | — |

## To decide together

### Backend needs (Nikhil)

| # | Need | Why | Today |
|---|---|---|---|
| 1 | `approveException` must handle settlement exceptions | Compliance can't approve the wine after the dinner. It only looks at the latest evaluation | Fixed in `FixtureService`. Same gap in `LiveService` |
| 2 | A way to deny an exception | Report has Approve and Deny. The contract only has approve | Missing. Additive contract change |
| 3 | Keep every evaluation round | Going back has to show the original block after it's fixed. Only the latest is stored | Missing |
| 4 | A documents store, with each citation pointing to a document and passage | Sources should open the real stored text | Prototype holds them in code |
| 5 | The actual card charge | Settle should tie card, receipt and split. The contract has no charge amount | Missing |
| 6 | `issueFund` sets `rampUrl` | "View in Ramp" needs it | Not set |
| 7 | Does Ramp really enforce restaurants-only? | The Fund step claims it | Open |
| 8 | Save inputs and notes per step | Every square takes input | Missing |

### Merge and live mode

Nikhil's `a/main` test-merged cleanly (lockfile needs `pnpm install --no-frozen-lockfile`). Still needed: switch `apps/web/lib/live.ts` to `createLiveServiceFromEnv`, and fix the `import.meta.dirname` paths for proof and cache on Vercel. Who does this, and when?

### Accuracy before anything goes on screen

- **California §119402:** the 2009 text found says "pharmaceutical company". Device coverage needs confirming against the current §119400 definition. The code already marks this VERIFY.
- **OIG alert and CMS page:** exact wording isn't stored, because those sites blocked automated fetching. The prototype shows an empty box rather than a made-up quote. Someone needs to download them.
- **Speaker meals and all-in per-person value:** already flagged in `docs/decisions.md` to verify with Kaley or Cole's dad.
- **Open Payments figures for the video:** from a secondary summary. Check against CMS.

### Scope and split through Tuesday

Not yet in the prototype: new-dinner form, the Doctors, Rules, Documents and Proof pages, the phone close-out. Which of these make the cut, and who owns Slack?

| When | Proposed |
|---|---|
| Sun night | Agree this list. Merge `a/main` |
| Mon morning | Cole: rebuild the dashboard and map in the app. Nikhil: backend needs 1–3, then 5–6 |
| Mon afternoon | Connect live mode. Slack. Rules and Proof pages |
| Mon night | Polish. Real receipts in. Record the video |
| Tue | Edit, README, `DEMO.md`, Devpost. Links checked logged out, submitted well before 11:59 PM PT |
