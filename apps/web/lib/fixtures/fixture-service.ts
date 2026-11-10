// FixtureService: CoversService on seed data and stub rule math. COVERS_MODE=fixtures.
// Each visitor's sandbox is one JSON document in a SessionStore (Upstash on Vercel, memory locally).
// Must pass the same contract suite as Person A's LiveService.
import { createHash, randomUUID } from 'node:crypto';
import {
  Attendance, CoversError, PlanInput, PlanPatch, ReceiptLine, StepNoteInput,
  type AuditEvent, type BreakItResult, type CapStatus, type CompileResult, type CoversService, type Ctx, type Evaluation,
  type CloseOut, type FundResult, type Hcp, type PlanView, type PolicyDocument, type ProgramPlan, type ProofBundle, type Receipt, type ReceiptImage, type Rep,
  type ReplayDiff, type RulePack, type Settlement, type Speaker, type StepNote,
} from '@covers/contract';
import { cloneSeed, type Fixtures } from '@covers/contract/fixtures';
import type { SessionStore } from '../store';
import { evaluatePlan, settlePlan, type Approval } from './rules';

type State = {
  v: 1;
  seed: Pick<Fixtures, 'company' | 'reps' | 'speakers' | 'hcps' | 'ledger' | 'packs' | 'citations' | 'sampleReceipts'>;
  plans: ProgramPlan[];
  evaluations: Record<string, Evaluation>;
  approvals: Record<string, Approval>;
  denials: Record<string, Approval>;
  rounds: Record<string, Evaluation[]>;
  notes: Record<string, StepNote[]>;
  receipts: Record<string, Receipt>;
  settlements: Record<string, Settlement>;
  audit: AuditEvent[];
};

function freshState(): State {
  const f = cloneSeed();
  return {
    v: 1,
    seed: { company: f.company, reps: f.reps, speakers: f.speakers, hcps: f.hcps, ledger: f.ledger, packs: f.packs, citations: f.citations, sampleReceipts: f.sampleReceipts },
    plans: f.plans,
    evaluations: {}, approvals: {}, denials: {}, rounds: {}, notes: {}, receipts: {}, settlements: {}, audit: [],
  };
}

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);
const notInFixtures = (what: string) => new CoversError('invalid_state', `${what} needs live mode.`);

export class FixtureService implements CoversService {
  constructor(private readonly store: SessionStore, private readonly proof: () => ProofBundle = () => cloneSeed().proof) {}

  // ---- session plumbing ----

  private async load(ctx: Ctx): Promise<State> {
    const saved = await this.store.get<Omit<State, 'denials' | 'rounds' | 'notes'> & Partial<State>>(ctx.sessionId);
    return saved ? { denials: {}, rounds: {}, notes: {}, ...saved } : freshState(); // sessions saved before Nov 8 lack these
  }

  /** Load, mutate, save. Every write goes through here and records an audit event. */
  private async write<T>(ctx: Ctx, fn: (s: State, audit: (e: Omit<AuditEvent, 'id' | 'at' | 'actorId'>) => void) => T): Promise<T> {
    const s = await this.load(ctx);
    const result = fn(s, (e) => s.audit.push({ id: randomUUID(), at: new Date().toISOString(), actorId: ctx.actorId, ...e }));
    await this.store.set(ctx.sessionId, s);
    return result;
  }

  private plan(s: State, id: string): ProgramPlan {
    const p = s.plans.find((x) => x.id === id);
    if (!p) throw new CoversError('not_found', `Plan ${id} not found.`);
    return p;
  }

  private evaluate(s: State, plan: ProgramPlan): Evaluation {
    const ev = evaluatePlan(s.seed, plan, s.approvals, s.denials, new Date().toISOString());
    plan.status = ev.status;
    s.evaluations[plan.id] = ev;
    (s.rounds[plan.id] ??= []).push(ev);
    return ev;
  }

  // ---- reference data ----

  async listSpeakers(ctx: Ctx): Promise<Speaker[]> {
    return (await this.load(ctx)).seed.speakers;
  }

  async searchHcps(ctx: Ctx, q: string): Promise<Hcp[]> {
    const { seed } = await this.load(ctx);
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const all = [...seed.hcps, ...seed.speakers.map((sp) => sp.hcp)];
    return all.filter((h) => h.npi.startsWith(needle) || h.name.toLowerCase().includes(needle));
  }

  async listReps(ctx: Ctx): Promise<Rep[]> {
    return (await this.load(ctx)).seed.reps;
  }

  // ---- before the dinner ----

  async createPlan(ctx: Ctx, input: PlanInput): Promise<ProgramPlan> {
    const parsed = PlanInput.parse(input);
    return this.write(ctx, (s, audit) => {
      const plan: ProgramPlan = { ...parsed, id: `plan-${randomUUID().slice(0, 8)}`, status: 'draft' };
      s.plans.push(plan);
      audit({ action: 'plan.created', planId: plan.id, inputHash: hash(parsed), detail: plan.title });
      return plan;
    });
  }

  async getPlan(ctx: Ctx, id: string): Promise<PlanView> {
    const s = await this.load(ctx);
    return { plan: this.plan(s, id), evaluation: s.evaluations[id] ?? null };
  }

  async updatePlan(ctx: Ctx, id: string, patch: PlanPatch): Promise<ProgramPlan> {
    const parsed = PlanPatch.parse(patch); // strips status / fundId / unknown keys
    return this.write(ctx, (s, audit) => {
      const plan = this.plan(s, id);
      Object.assign(plan, parsed, { status: 'draft' });
      audit({ action: 'plan.updated', planId: id, inputHash: hash(parsed), detail: Object.keys(parsed).join(', ') || 'no fields' });
      return plan;
    });
  }

  async evaluatePlan(ctx: Ctx, id: string): Promise<Evaluation> {
    return this.write(ctx, (s, audit) => {
      const plan = this.plan(s, id);
      const ev = this.evaluate(s, plan);
      audit({ action: 'plan.evaluated', planId: id, inputHash: hash(plan), detail: `Status ${ev.status}` });
      return ev;
    });
  }

  async approveException(ctx: Ctx, id: string, checkId: string, note: string): Promise<Evaluation> {
    return this.decide(ctx, id, checkId, note, 'approved');
  }

  async denyException(ctx: Ctx, id: string, checkId: string, note: string): Promise<Evaluation> {
    return this.decide(ctx, id, checkId, note, 'denied');
  }

  /** The latest decision on a check wins. After the dinner it lands on the settlement; before, the plan is re-evaluated. */
  private decide(ctx: Ctx, id: string, checkId: string, note: string, verdict: 'approved' | 'denied'): Promise<Evaluation> {
    return this.write(ctx, (s, audit) => {
      const plan = this.plan(s, id);
      const verb = verdict === 'approved' ? 'approve' : 'deny';
      const decision: Approval = { by: ctx.actorId, note, at: new Date().toISOString() };
      const record = () => {
        delete s.approvals[checkId];
        delete s.denials[checkId];
        (verdict === 'approved' ? s.approvals : s.denials)[checkId] = decision;
      };
      const settled = s.settlements[id];
      const exception = settled?.exceptions.find((c) => c.id === checkId);
      if (settled && exception) {
        // After the dinner: the exception lives on the settlement, and the plan closes once none are left open.
        if (ctx.actorId === plan.repId) throw new CoversError('forbidden', `The rep on a plan cannot ${verb} its exceptions.`);
        record();
        for (const c of [...settled.exceptions, ...settled.checks]) {
          if (c.id !== checkId) continue;
          delete c.approval;
          delete c.denial;
          if (verdict === 'approved') c.approval = decision;
          else c.denial = decision;
        }
        plan.status = settled.exceptions.every((c) => c.approval || c.denial) ? 'closed' : 'reconciling';
        audit({ action: `exception.${verdict}`, planId: id, packId: exception.packId, ruleId: exception.ruleId, inputHash: hash({ checkId, note }), detail: note });
        return s.evaluations[id] ?? evaluatePlan(s.seed, plan, s.approvals, s.denials, new Date().toISOString());
      }
      const check = s.evaluations[id]?.checks.find((c) => c.id === checkId);
      if (!check) throw new CoversError('not_found', `Check ${checkId} not found on plan ${id}.`);
      if (ctx.actorId === plan.repId) throw new CoversError('forbidden', `The rep on a plan cannot ${verb} its exceptions.`);
      if (check.outcome !== 'flag') throw new CoversError('invalid_state', 'Only flags can be decided. Blocks have to be fixed.');
      record();
      const ev = this.evaluate(s, plan);
      audit({ action: `exception.${verdict}`, planId: id, packId: check.packId, ruleId: check.ruleId, inputHash: hash({ checkId, note }), detail: note });
      return ev;
    });
  }

  async listEvaluations(ctx: Ctx, id: string): Promise<Evaluation[]> {
    const s = await this.load(ctx);
    this.plan(s, id);
    return s.rounds[id] ?? [];
  }

  async issueFund(ctx: Ctx, id: string): Promise<FundResult> {
    return this.write(ctx, (s, audit) => {
      const plan = this.plan(s, id);
      if (plan.status !== 'cleared') throw new CoversError('invalid_state', 'A fund can only be issued for a cleared plan.');
      const headcount = plan.inviteeNpis.length + 1 + plan.employeeCount;
      const fund: FundResult = { fundId: `fund-sim-${plan.id}`, limitCents: s.seed.company.perPersonCapCents * headcount, simulated: true };
      plan.fundId = fund.fundId;
      audit({ action: 'fund.issued', planId: id, inputHash: hash(fund), detail: `Simulated fund, limit ${fund.limitCents} cents` });
      return fund;
    });
  }

  async checkForCharge(ctx: Ctx, id: string): Promise<CloseOut | null> {
    this.plan(await this.load(ctx), id);
    return null; // the fixture card is simulated, so no charge ever appears
  }

  // ---- after the dinner ----

  async submitReceipt(ctx: Ctx, planId: string, image: ReceiptImage): Promise<Receipt> {
    if (!('sampleId' in image)) throw notInFixtures('Reading an uploaded receipt photo');
    return this.write(ctx, (s, audit) => {
      this.plan(s, planId);
      const sample = s.seed.sampleReceipts.find((r) => r.id === image.sampleId);
      if (!sample) throw new CoversError('not_found', `Sample receipt ${image.sampleId} not found.`);
      const receipt: Receipt = { ...structuredClone(sample), id: `rcpt-${planId}`, planId };
      s.receipts[planId] = receipt;
      audit({ action: 'receipt.read', planId, inputHash: hash(image), detail: `Sample ${image.sampleId}` });
      return receipt;
    });
  }

  async getReceipt(ctx: Ctx, planId: string): Promise<Receipt | null> {
    return (await this.load(ctx)).receipts[planId] ?? null;
  }

  async fixLine(ctx: Ctx, receiptId: string, lineId: string, patch: Partial<ReceiptLine>): Promise<Receipt> {
    const parsed = ReceiptLine.omit({ id: true }).partial().parse(patch);
    return this.write(ctx, (s, audit) => {
      const receipt = Object.values(s.receipts).find((r) => r.id === receiptId);
      if (!receipt) throw new CoversError('not_found', `Receipt ${receiptId} not found.`);
      const line = receipt.lines.find((l) => l.id === lineId);
      if (!line) throw new CoversError('not_found', `Line ${lineId} not found.`);
      // Reclassifying the wine as food would hide it from the alcohol check, so the plan's rep can't move a line out of alcohol.
      if (line.category === 'alcohol' && parsed.category && parsed.category !== 'alcohol' && ctx.actorId === this.plan(s, receipt.planId).repId) {
        throw new CoversError('forbidden', 'The rep on a plan cannot reclassify an alcohol line. Compliance can.');
      }
      Object.assign(line, parsed);
      audit({ action: 'receipt.line_fixed', planId: receipt.planId, inputHash: hash(parsed), detail: `${lineId}: ${Object.keys(parsed).join(', ')}` });
      return receipt;
    });
  }

  async confirmAttendance(ctx: Ctx, a: Attendance): Promise<Settlement> {
    const parsed = Attendance.parse(a);
    return this.write(ctx, (s, audit) => {
      const plan = this.plan(s, parsed.planId);
      if (ctx.actorId !== plan.repId || parsed.confirmedBy !== plan.repId) {
        throw new CoversError('forbidden', 'Only the rep on the plan can confirm who attended.');
      }
      if (s.settlements[plan.id]) throw new CoversError('invalid_state', 'Attendance is already confirmed for this plan.');
      const receipt = s.receipts[plan.id];
      if (!receipt) throw new CoversError('invalid_state', 'Submit the receipt before confirming attendance.');
      if (parsed.attendedNpis.length + parsed.employeesPresent + parsed.extraGuests === 0) {
        throw new CoversError('validation', 'At least one person has to have eaten.');
      }
      const st = settlePlan(s.seed, plan, receipt, parsed);
      for (const share of st.byPerson) {
        const row = share.npi && s.seed.ledger.find((l) => l.npi === share.npi);
        if (row) {
          row.ytdCents += share.amountCents;
          row.sameTopicCount12mo += 1;
        }
      }
      s.settlements[plan.id] = st;
      plan.status = st.exceptions.length ? 'reconciling' : 'closed';
      audit({ action: 'attendance.confirmed', planId: plan.id, inputHash: hash(parsed), detail: `${st.headcount} people, ${st.perPersonCents} cents each` });
      return st;
    });
  }

  async getSettlement(ctx: Ctx, planId: string): Promise<Settlement | null> {
    return (await this.load(ctx)).settlements[planId] ?? null;
  }

  // ---- notes on the record ----

  async addNote(ctx: Ctx, planId: string, input: StepNoteInput): Promise<StepNote> {
    const parsed = StepNoteInput.safeParse(input);
    if (!parsed.success) throw new CoversError('validation', parsed.error.issues.map((i) => i.message).join('; '));
    return this.write(ctx, (s, audit) => {
      this.plan(s, planId);
      const note: StepNote = { id: `note-${randomUUID()}`, planId, ...parsed.data, by: ctx.actorId, at: new Date().toISOString() };
      (s.notes[planId] ??= []).push(note);
      audit({ action: 'note.added', planId, inputHash: hash(note), detail: `${note.step}${note.target ? ` · ${note.target}` : ''}` });
      return note;
    });
  }

  async listNotes(ctx: Ctx, planId: string): Promise<StepNote[]> {
    const s = await this.load(ctx);
    this.plan(s, planId);
    return s.notes[planId] ?? [];
  }

  // ---- compliance views ----

  async listPlans(ctx: Ctx): Promise<ProgramPlan[]> {
    return (await this.load(ctx)).plans;
  }

  async getLedger(ctx: Ctx): Promise<CapStatus[]> {
    const { seed } = await this.load(ctx);
    const { annualCapCents: cap, nearThresholdPct } = seed.company;
    return seed.ledger.map((l) => ({
      npi: l.npi, capCents: cap, ytdCents: l.ytdCents, projectedCents: l.ytdCents,
      state: l.ytdCents > cap ? 'over' : l.ytdCents > (cap * nearThresholdPct) / 100 ? 'near' : 'ok',
      sameTopicCount12mo: l.sameTopicCount12mo,
    }));
  }

  async listAudit(ctx: Ctx, filter?: { planId?: string }): Promise<AuditEvent[]> {
    const { audit } = await this.load(ctx);
    return filter?.planId ? audit.filter((e) => e.planId === filter.planId) : audit;
  }

  // ---- pack lab and judge tools (live mode only, like LiveService for now) ----

  async listPacks(ctx: Ctx): Promise<RulePack[]> {
    return (await this.load(ctx)).seed.packs;
  }
  async compilePack(_ctx: Ctx, _english: string): Promise<CompileResult> {
    throw notInFixtures('Compiling a rule pack');
  }
  async replayPack(_ctx: Ctx, _packId: string): Promise<ReplayDiff> {
    throw notInFixtures('Replaying a rule pack');
  }
  async promotePack(_ctx: Ctx, _packId: string): Promise<RulePack> {
    throw notInFixtures('Promoting a rule pack');
  }
  async runBreakIt(_ctx: Ctx, _caseId: number): Promise<BreakItResult> {
    throw notInFixtures('Running a Break-It case');
  }
  async getProof(): Promise<ProofBundle> {
    return this.proof();
  }
  async listDocuments(): Promise<PolicyDocument[]> {
    return cloneSeed().documents;
  }

  async reset(ctx: Ctx): Promise<void> {
    await this.store.delete(ctx.sessionId);
  }
}
