# Covers — decisions log

Decisions made after `docs/implementation.md` was written. Where they differ, this file wins.
Newest at the bottom. Agreed by Cole (B) and Nikhil (A) unless marked otherwise.

## Sat Nov 7 — before C0

**Roles.** Cole is Person B (design, web, motion, video). Nikhil is Person A (engine, integrations, live service, evals).

**Stack versions (pinned).** Next 16.4.5 · React 19.3 · Tailwind 4.3 · Zod 4.6.7 · TypeScript 6.0.3 · Vitest 4.1.12 · pnpm 10.33.2 · Node ≥22.
TypeScript 7 and Vitest 5 skipped on purpose: both too new for a 3-day sprint.

**Seed roster: six invitees, plus the speaker.** Six fictional HCPs are invited (Dr. Ruiz and Dr. Kim among them). Dr. Patel, the speaker, is *not* in `inviteeNpis`.
The story then reconciles exactly:
- 6 invited → Dr. Ruiz blocked and removed → 5 invited.
- Dr. Kim no-shows → 4 HCPs attend.
- 4 HCPs + Dr. Patel + Jordan (rep) = **6 who ate** = the clean receipt's 6 covers: **$612 ÷ 6 = $102 each**, under the $125 cap.

**The speaker is part of the split.** Dr. Patel ate, so he is in the denominator, gets an Open Payments food-and-beverage row, and his meal counts toward his annual total. Speaker fees are out of scope. ⚠️ Verify speaker-meal reporting with Kaley / Cole's dad.

**Per-person value includes tax and tip.** Per-person value = printed total (food + beverage + tax + tip) ÷ everyone who ate. The $110 estimate and the $125 cap are all-in too. ⚠️ Verify against CMS guidance (goes with the P6 check).

**Headcount.**
- Before dinner (fund cap): `inviteeNpis.length + 1 (speaker) + employeeCount`. `employeeCount` includes the rep (seed = 1). Scripted plan after Dr. Ruiz is removed: 5 + 1 + 1 = 7 → fund cap 7 × $125 = **$875**.
- After dinner (settlement): `attendedNpis.length + employeesPresent + extraGuests`. `attendedNpis` **includes the speaker's NPI**, so a speaker no-show is possible.

**Annual cap.** One company setting ($2,000) applied to each doctor separately. `CapStatus.capCents` is per NPI so overrides are possible; every seed doctor gets $2,000. "Near" = above 80% ($1,600). Dr. Ruiz: $1,940 + $110 = $2,050 → over → blocked, $60 from her limit.

**Rounding.** Leftover cents from largest-remainder splitting go to people in ascending order of their id, so the result is identical every run. *(Claude's call, not objected to.)*

**Plan doc.** Moved to `docs/implementation.md`. B5 corrected: the re-flow unticks **Dr. Kim** (not Dr. Ruiz).

**Deploy.** Cole connects the GitHub repo to Vercel from the dashboard.

## Pending

- **Where `FixtureService` keeps judge data** — decide before B2 (Cole). Leaning: server-side key-value store, so the phone QR handoff works and pages call the server the same way in fixtures and live.

## Additions to the contract at C0 (please review, Nikhil)

These go beyond the plan's TypeScript and can't be renamed after the freeze:
- **`CoversError`** with `code: 'not_found' | 'forbidden' | 'invalid_state' | 'validation' | 'rate_limited'`. Every refusal (rep approves own exception, fund on an uncleared plan, wrong person confirms attendance) rejects with one, so the UI can show the right message.
- Named schemas for results the plan wrote inline: `PlanInput`, `FundResult`, `ReceiptImage`, `CompileResult`, `BreakItResult`. Same shapes.
- `getProof()` takes no `ctx`, as in the plan.
