// Covers shared contract — FROZEN at C0. Additive changes only.
// Refusals reject with CoversError (see types.ts).
import type {
  AuditEvent, Attendance, BreakItResult, CapStatus, CompileResult, Ctx, Evaluation, FundResult,
  Hcp, PlanInput, PlanPatch, PlanView, PolicyDocument, ProgramPlan, ProofBundle, Receipt, ReceiptImage, ReceiptLine, Rep, ReplayDiff,
  RulePack, Settlement, Speaker,
} from './types';

export interface CoversService {
  // reference data
  listSpeakers(ctx: Ctx): Promise<Speaker[]>;
  searchHcps(ctx: Ctx, q: string): Promise<Hcp[]>; // name or NPI; live = NPPES registry
  listReps(ctx: Ctx): Promise<Rep[]>;

  // before the dinner
  createPlan(ctx: Ctx, input: PlanInput): Promise<ProgramPlan>;
  getPlan(ctx: Ctx, id: string): Promise<PlanView>; // plan + latest stored evaluation; never re-evaluates, writes no audit event
  updatePlan(ctx: Ctx, id: string, patch: PlanPatch): Promise<ProgramPlan>; // any edit sets status back to 'draft'
  evaluatePlan(ctx: Ctx, id: string): Promise<Evaluation>;
  // Exceptions: flags only, decided by anyone except the plan's rep. The latest decision on a check wins.
  // Before the dinner they act on the latest evaluation; once attendance is confirmed they act on the settlement's
  // exceptions (added Nov 8), and the plan closes when every exception is decided. Both return the latest evaluation.
  approveException(ctx: Ctx, id: string, checkId: string, note: string): Promise<Evaluation>;
  denyException(ctx: Ctx, id: string, checkId: string, note: string): Promise<Evaluation>; // added Nov 8. Before the dinner a denied flag blocks the plan
  listEvaluations(ctx: Ctx, id: string): Promise<Evaluation[]>; // added Nov 8: every evaluation round, oldest first; writes no audit event
  issueFund(ctx: Ctx, id: string): Promise<FundResult>; // refuses unless status is 'cleared'

  // after the dinner
  submitReceipt(ctx: Ctx, planId: string, image: ReceiptImage): Promise<Receipt>;
  getReceipt(ctx: Ctx, planId: string): Promise<Receipt | null>;
  fixLine(ctx: Ctx, receiptId: string, lineId: string, patch: Partial<ReceiptLine>): Promise<Receipt>;
  confirmAttendance(ctx: Ctx, a: Attendance): Promise<Settlement>; // ctx.actorId and a.confirmedBy must be the plan's rep
  getSettlement(ctx: Ctx, planId: string): Promise<Settlement | null>;

  // compliance views
  listPlans(ctx: Ctx): Promise<ProgramPlan[]>;
  getLedger(ctx: Ctx): Promise<CapStatus[]>;
  listAudit(ctx: Ctx, filter?: { planId?: string }): Promise<AuditEvent[]>;

  // pack lab
  listPacks(ctx: Ctx): Promise<RulePack[]>;
  compilePack(ctx: Ctx, english: string): Promise<CompileResult>;
  replayPack(ctx: Ctx, packId: string): Promise<ReplayDiff>;
  promotePack(ctx: Ctx, packId: string): Promise<RulePack>;

  // judge tools
  runBreakIt(ctx: Ctx, caseId: number): Promise<BreakItResult>;
  getProof(): Promise<ProofBundle>;
  listDocuments(): Promise<PolicyDocument[]>; // added Nov 8: every source a citation can point to; no ctx, same for everyone
  reset(ctx: Ctx): Promise<void>;
}
