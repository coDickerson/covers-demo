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

// updatePlan takes only plan inputs: status and fundId change only through evaluate / approve / fund / attendance.
export const PlanPatch = PlanInput.partial();
export type PlanPatch = z.infer<typeof PlanPatch>;

export const Citation = z.object({
  label: z.string(),
  url: z.string().optional(),
  packId: z.string(),
  ruleId: z.string(),
  version: z.string(),
  docId: z.string().optional(), // added Nov 8: the stored document this rule rests on (see listDocuments)
  passageId: z.string().optional(), // added Nov 8: the passage in that document to open and highlight
});
export type Citation = z.infer<typeof Citation>;

// Added Nov 8. What a person writes or ticks on a step of a dinner. Notes go on the record (and the audit log); they never
// change an outcome. The steps match the app's route; target names the square (a checker or a check id), if any.
export const DinnerStep = z.enum(['propose', 'check', 'fund', 'dinner', 'close_out', 'settle', 'report']);
export type DinnerStep = z.infer<typeof DinnerStep>;

export const StepNoteInput = z.object({
  step: DinnerStep,
  target: z.string().min(1).max(200).optional(),
  text: z.string().max(2000).optional(),
  checked: z.boolean().optional(),
}).refine((n) => n.text !== undefined || n.checked !== undefined, { message: 'A note needs text, a checkbox value, or both.' });
export type StepNoteInput = z.infer<typeof StepNoteInput>;

export const StepNote = z.object({
  id: z.string(),
  planId: z.string(),
  step: DinnerStep,
  target: z.string().optional(),
  text: z.string().optional(),
  checked: z.boolean().optional(),
  by: z.string(),
  at: IsoDateTime,
});
export type StepNote = z.infer<typeof StepNote>;

// Added Nov 8. The source texts citations point to. Government texts are quoted exactly from the original (public
// domain); the company policy is the fictional demo policy. checkedOn is when the text was last compared with the source.
export const DocumentPassage = z.object({ id: z.string(), label: z.string(), text: z.string() });
export type DocumentPassage = z.infer<typeof DocumentPassage>;

export const PolicyDocument = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string(),
  kind: z.enum(['statute', 'regulation', 'guidance', 'agency_page', 'company_policy']),
  url: z.string().optional(),
  checkedOn: IsoDate,
  note: z.string().optional(),
  passages: z.array(DocumentPassage).min(1),
});
export type PolicyDocument = z.infer<typeof PolicyDocument>;

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
  approval: z.object({ by: z.string(), note: z.string(), at: IsoDateTime }).optional(), // set when a flag is approved; blocks are never approvable
  denial: z.object({ by: z.string(), note: z.string(), at: IsoDateTime }).optional(), // added Nov 8: set when a flag is denied; a check carries at most one of approval / denial
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

// What getPlan returns: the plan plus its latest stored evaluation (null if never evaluated). Reading never re-evaluates.
export const PlanView = z.object({ plan: ProgramPlan, evaluation: Evaluation.nullable() });
export type PlanView = z.infer<typeof PlanView>;

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
  // Added Nov 8. The dinner's card charge. 'ramp' = read from the fund's card in Ramp; 'simulated' = no card data,
  // so the printed total stands in (label it as simulated). Absent when a Ramp fund exists but no charge was found.
  charge: z.object({
    amountCents: Cents,
    source: z.enum(['ramp', 'simulated']),
    transactionId: z.string().optional(),
    merchantName: z.string().optional(),
    categoryId: z.number().int().optional(), // Ramp's merchant category (sk_category_id); 19 = Restaurants
    categoryName: z.string().optional(),
  }).optional(),
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
// Refusals reject with a CoversError on the server. Across the server→browser boundary they travel as a plain
// CoversErrorBody ({ code, message }), since a class does not survive JSON.
//   forbidden     — wrong actor (rep approves own exception, someone other than the rep confirms attendance)
//   invalid_state — not allowed in the current state (fund on an uncleared plan, approving a block)
export const CoversErrorCode = z.enum(['not_found', 'forbidden', 'invalid_state', 'validation', 'rate_limited']);
export type CoversErrorCode = z.infer<typeof CoversErrorCode>;

export const CoversErrorBody = z.object({ code: CoversErrorCode, message: z.string() });
export type CoversErrorBody = z.infer<typeof CoversErrorBody>;

export class CoversError extends Error {
  constructor(public readonly code: CoversErrorCode, message: string) {
    super(message);
    this.name = 'CoversError';
  }
}
