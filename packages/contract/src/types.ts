// Covers shared contract — FROZEN at C0 (Sat Nov 7).
// Additive changes only, via a PR labeled contract-change approved by both builders.
// Money is always integer cents. Every result that came from a rule carries a citation.
import { z } from 'zod';

export const Cents = z.number().int();
export type Cents = z.infer<typeof Cents>;

const IsoDate = z.iso.date(); // YYYY-MM-DD
const IsoDateTime = z.iso.datetime({ offset: true });

export const Ctx = z.object({ sessionId: z.string().min(1), actorId: z.string().min(1) }); // per-visitor sandbox + who is acting
export type Ctx = z.infer<typeof Ctx>;

export const RecipientType = z.enum(['physician', 'physician_assistant', 'nurse_practitioner', 'other_clinician', 'non_hcp']);
export type RecipientType = z.infer<typeof RecipientType>;

export const Hcp = z.object({
  npi: z.string().regex(/^\d{10}$/),
  name: z.string(),
  credential: z.string().optional(),
  specialty: z.string().optional(),
  state: z.string(),
  recipientType: RecipientType,
  source: z.enum(['seed', 'nppes']), // seed = fictional demo doctor; nppes = real registry identity, zero spend history
});
export type Hcp = z.infer<typeof Hcp>;

export const Speaker = z.object({
  id: z.string(),
  hcp: Hcp,
  status: z.enum(['approved', 'training_expired', 'not_contracted']),
  approvedTopics: z.array(z.string()),
  contractEnds: IsoDate,
});
export type Speaker = z.infer<typeof Speaker>;

export const Rep = z.object({ id: z.string(), name: z.string(), territory: z.string(), managerId: z.string() });
export type Rep = z.infer<typeof Rep>;

export const PlanStatus = z.enum(['draft', 'blocked', 'needs_approval', 'cleared', 'held', 'reconciling', 'closed']);
export type PlanStatus = z.infer<typeof PlanStatus>;

export const ProgramPlan = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string(),
  topic: z.string(),
  repId: z.string(),
  speakerId: z.string(),
  venue: z.string(),
  date: IsoDateTime,
  inviteeNpis: z.array(z.string()), // invited HCPs; the speaker is NOT listed here
  employeeCount: z.number().int().nonnegative(), // company employees expected to eat, including the rep
  estimatedPerPerson: Cents, // all-in: food + beverage + tax + tip
  status: PlanStatus,
  fundId: z.string().optional(), // Ramp sandbox fund, set once cleared
});
export type ProgramPlan = z.infer<typeof ProgramPlan>;

export const PlanInput = ProgramPlan.omit({ id: true, status: true, fundId: true });
export type PlanInput = z.infer<typeof PlanInput>;

export const Citation = z.object({
  label: z.string(),
  url: z.string().optional(),
  packId: z.string(),
  ruleId: z.string(),
  version: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const CheckSubject = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan') }),
  z.object({ kind: z.literal('hcp'), npi: z.string() }),
  z.object({ kind: z.literal('line'), lineId: z.string() }),
]);
export type CheckSubject = z.infer<typeof CheckSubject>;

export const CheckResult = z.object({
  id: z.string(),
  ruleId: z.string(),
  packId: z.string(),
  subject: CheckSubject,
  outcome: z.enum(['pass', 'flag', 'block']),
  message: z.string(), // one sentence a rep can read
  citation: Citation,
  evidence: z.array(z.string()), // ids of the facts used (registry record, roster row, ledger entry)
});
export type CheckResult = z.infer<typeof CheckResult>;

export const CapStatus = z.object({
  npi: z.string(),
  capCents: Cents,
  ytdCents: Cents,
  projectedCents: Cents, // ytd + this plan's per-person estimate
  state: z.enum(['ok', 'near', 'over']), // 'near' = above 80% of cap
  sameTopicCount12mo: z.number().int().nonnegative(), // repeat attendance
});
export type CapStatus = z.infer<typeof CapStatus>;

export const Evaluation = z.object({
  planId: z.string(),
  status: PlanStatus,
  checks: z.array(CheckResult),
  caps: z.array(CapStatus),
  evaluatedAt: IsoDateTime,
});
export type Evaluation = z.infer<typeof Evaluation>;

export const ReceiptLine = z.object({
  id: z.string(),
  text: z.string(),
  amountCents: Cents,
  category: z.enum(['food', 'alcohol', 'tax', 'tip', 'fee', 'other']),
  confidence: z.number().min(0).max(1), // below the gate the UI asks for a one-tap fix
});
export type ReceiptLine = z.infer<typeof ReceiptLine>;

export const Receipt = z.object({
  id: z.string(),
  planId: z.string(),
  imageUrl: z.string(),
  lines: z.array(ReceiptLine),
  totalCents: Cents,
  printedCovers: z.number().int().positive().optional(),
});
export type Receipt = z.infer<typeof Receipt>;

export const Attendance = z.object({
  planId: z.string(),
  attendedNpis: z.array(z.string()), // every HCP who ate, INCLUDING the speaker
  employeesPresent: z.number().int().nonnegative(), // including the rep
  extraGuests: z.number().int().nonnegative(),
  confirmedBy: z.string(), // must be the plan's rep
});
export type Attendance = z.infer<typeof Attendance>;

export const OpenPaymentsRow = z.object({
  npi: z.string(),
  recipientType: RecipientType,
  date: IsoDate,
  natureOfPayment: z.literal('food_and_beverage'),
  formOfPayment: z.literal('in_kind'),
  amountCents: Cents,
  reportable: z.boolean(),
  reason: z.string(),
  citation: Citation,
});
export type OpenPaymentsRow = z.infer<typeof OpenPaymentsRow>;

export const Settlement = z.object({
  planId: z.string(),
  perPersonCents: Cents, // printed total (incl. tax and tip) ÷ headcount
  headcount: z.number().int().positive(), // everyone who ate: attendedNpis + employeesPresent + extraGuests
  byPerson: z.array(z.object({ who: z.string(), npi: z.string().optional(), amountCents: Cents })),
  checks: z.array(CheckResult),
  caps: z.array(CapStatus),
  openPayments: z.array(OpenPaymentsRow),
  exceptions: z.array(CheckResult), // what goes to finance
});
export type Settlement = z.infer<typeof Settlement>;

export const AuditEvent = z.object({
  id: z.string(),
  at: IsoDateTime,
  actorId: z.string(),
  action: z.string(), // 'plan.evaluated' | 'fund.issued' | 'receipt.read' | ...
  planId: z.string().optional(),
  inputHash: z.string(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  packId: z.string().optional(),
  ruleId: z.string().optional(),
  detail: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const RulePack = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  effective: IsoDate,
  english: z.string(),
  compiled: z.unknown(),
  status: z.enum(['draft', 'live']),
});
export type RulePack = z.infer<typeof RulePack>;

export const ReplayDiff = z.object({
  packId: z.string(),
  mealsReplayed: z.number().int().nonnegative(),
  changed: z.array(z.object({ planId: z.string(), before: PlanStatus, after: PlanStatus, why: z.string() })),
});
export type ReplayDiff = z.infer<typeof ReplayDiff>;

export const ProofBundle = z.object({
  receiptEval: z.array(z.object({ cls: z.string(), precision: z.number(), recall: z.number(), n: z.number().int() })),
  breakIt: z.array(z.object({ id: z.number().int(), attack: z.string(), expected: z.string(), passed: z.boolean(), note: z.string() })),
  realVsSimulated: z.array(z.object({ piece: z.string(), status: z.string(), howWeKnow: z.string() })),
  generatedAt: IsoDateTime,
});
export type ProofBundle = z.infer<typeof ProofBundle>;

// ---- Method results that the plan defined inline ----

export const FundResult = z.object({
  fundId: z.string(),
  limitCents: Cents, // per-person cap × (inviteeNpis + speaker + employeeCount)
  rampUrl: z.string().optional(),
  simulated: z.boolean(),
});
export type FundResult = z.infer<typeof FundResult>;

export const ReceiptImage = z.union([
  z.object({ base64: z.string(), mime: z.string() }),
  z.object({ sampleId: z.string() }),
]);
export type ReceiptImage = z.infer<typeof ReceiptImage>;

export const CompileResult = z.object({
  pack: RulePack,
  tests: z.array(z.object({ name: z.string(), passed: z.boolean() })),
});
export type CompileResult = z.infer<typeof CompileResult>;

export const BreakItResult = z.object({ passed: z.boolean(), checks: z.array(CheckResult), note: z.string() });
export type BreakItResult = z.infer<typeof BreakItResult>;

// ---- Errors ----
// Refusals (rep approving own exception, fund on an uncleared plan, ...) reject with a CoversError.
export const CoversErrorCode = z.enum(['not_found', 'forbidden', 'invalid_state', 'validation', 'rate_limited']);
export type CoversErrorCode = z.infer<typeof CoversErrorCode>;

export class CoversError extends Error {
  constructor(public readonly code: CoversErrorCode, message: string) {
    super(message);
    this.name = 'CoversError';
  }
}
