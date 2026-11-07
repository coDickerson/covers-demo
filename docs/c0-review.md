# C0 contract review (Nikhil / Person A → Cole)

Reviewed `origin/c0` @ `64db950` (`packages/contract/src/types.ts`, `service.ts`, `docs/decisions.md`).
Everything below must be settled **before** the freeze: after C0 we can only add, never rename or narrow.

## Must fix before freeze

### 1. `updatePlan` lets a rep set `status: 'cleared'` and skip every check
`updatePlan(ctx, id, patch: Partial<ProgramPlan>)` accepts `status`, `fundId` and `id`.
A judge can PATCH `{ status: 'cleared' }` and then call `issueFund`. That is a Break-It hole in the contract itself.

```ts
updatePlan(ctx: Ctx, id: string, patch: Partial<PlanInput>): Promise<ProgramPlan>;
```
Status only changes through `evaluatePlan` / `approveException` / `confirmAttendance`. Any edit to a
`cleared` plan should drop it back to `draft` (re-evaluate before the fund issues). This is a narrowing
change, so it is only possible now.

### 2. No way to represent an approved exception
After `approveException`, a check is either still `flag` (UI shows it unresolved) or rewritten to `pass`
(the audit trail loses that a human overrode it). Proposed additive field:

```ts
// on CheckResult
approval: z.object({ by: z.string(), note: z.string(), at: IsoDateTime }).optional(),
```
Plus a decision (below) on *which* outcomes are approvable.

## Should fix before freeze

### 3. No `getPlan(id)`
`/plans/[id]` would have to call `listPlans()` and filter, and the only way to get checks is
`evaluatePlan`, which writes an AuditEvent on every page view. Proposed:

```ts
getPlan(ctx: Ctx, id: string): Promise<{ plan: ProgramPlan; evaluation: Evaluation | null }>;
```

### 4. The read receipt is lost on reload
Nothing returns a receipt after `submitReceipt`. Refresh `/plans/[id]/after` before confirming attendance
and the receipt is gone. Proposed: `getReceipt(ctx, planId): Promise<Receipt | null>` and
`receiptId: z.string().optional()` on `Settlement`.

### 5. `CoversError` is a class; it will not survive the server → browser hop
Server actions / route handlers serialize errors; `instanceof CoversError` and `.code` are lost.
Add a wire shape both sides agree on and a helper:

```ts
export const CoversErrorBody = z.object({ error: z.object({ code: CoversErrorCode, message: z.string() }) });
```
Route wrappers return `{ error }` with status 403/404/409/422/429; the client rethrows `CoversError`.

### 6. Fictional NPIs should fail the NPI check digit
NPIs carry a Luhn check digit (prefix 80840). If every seed NPI is 10 digits but **fails** the check,
it can never belong to a real doctor: rule 10 enforced by construction, and a nice line for judges.
`Hcp.npi` regex stays `^\d{10}$`; live-service validates the checksum only for `source: 'nppes'`.

### 7. Time zone for "contract active on the dinner date"
`ProgramPlan.date` is a datetime with offset, `Speaker.contractEnds` a date. Proposal: compare the
dinner's **local** calendar date (the date part as written in `plan.date`, before converting to UTC) with
`contractEnds`, inclusive. Seed dates should carry `-08:00` (Bay Area).

## Decisions needed (not type changes)

### 8. What is approvable?
Proposal, which the engine implements unless you object:
- `block` is never approvable: unapproved speaker (P1), per-person estimate over cap (P3),
  HCP over annual cap (P4). Fix the plan instead (swap speaker, lower estimate, remove the doctor).
- `flag` is approvable by someone other than the rep: unresolved identity (P2), near cap (P4),
  repeat attendance (P5).
- Status: any unapproved `block` → `blocked`; else any unapproved `flag` → `needs_approval`; else `cleared`.
- Check ids are deterministic (`<ruleId>:<subject>`, e.g. `P4.annual-cap:hcp:1234567890`),
  so an approval survives re-evaluation as long as the same issue still exists.

**Demo consequence:** Dr. Ruiz is both over cap (block) and repeat attendee (flag). Removing her clears
both, so the scripted story still works.

### 9. `getLedger` has no names
`CapStatus` carries only an NPI. Fine if `/compliance` joins against the seed HCP list; say so, or add
`name` (optional) to `CapStatus` now.

### 10. Seed doctor names collide with real people in the NPI registry
In live mode, searching "Ana Ruiz CA" returns 7 real clinicians (found while building the NPPES client).
A judge would see real people with $0 next to our fictional Dr. Ruiz with $1,940 of spend, which is close to
breaking rule 10. Proposal: rename the seed doctors to names with zero NPPES matches (I can check
candidates against the registry), and label seed rows "demo data" in the UI either way.

## Looks good
Integer cents throughout; `PlanInput`, `FundResult`, `ReceiptImage`, `CompileResult` and `BreakItResult`
are named; the speaker is in the split; the headcount formulas in `decisions.md`; and deterministic rounding.
