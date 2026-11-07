// Covers shared contract — FROZEN at C0. Additive changes only.
// Refusals reject with CoversError (see types.ts).
import type {
  AuditEvent, Attendance, BreakItResult, CapStatus, CompileResult, Ctx, Evaluation, FundResult,
  Hcp, PlanInput, ProgramPlan, ProofBundle, Receipt, ReceiptImage, ReceiptLine, Rep, ReplayDiff,
  RulePack, Settlement, Speaker,
} from './types';

export interface CoversService {
  // reference data
  listSpeakers(ctx: Ctx): Promise<Speaker[]>;
  searchHcps(ctx: Ctx, q: string): Promise<Hcp[]>; // name or NPI; live = NPPES registry
  listReps(ctx: Ctx): Promise<Rep[]>;

  // before the dinner
  createPlan(ctx: Ctx, input: PlanInput): Promise<ProgramPlan>;
  updatePlan(ctx: Ctx, id: string, patch: Partial<ProgramPlan>): Promise<ProgramPlan>;
  evaluatePlan(ctx: Ctx, id: string): Promise<Evaluation>;
  approveException(ctx: Ctx, id: string, checkId: string, note: string): Promise<Evaluation>; // actorId must differ from the rep
  issueFund(ctx: Ctx, id: string): Promise<FundResult>; // refuses unless status is 'cleared'

  // after the dinner
  submitReceipt(ctx: Ctx, planId: string, image: ReceiptImage): Promise<Receipt>;
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
  reset(ctx: Ctx): Promise<void>;
}
