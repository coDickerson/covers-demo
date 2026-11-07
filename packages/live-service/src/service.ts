// LiveService: the real CoversService. Postgres per-visitor sessions, the pure engine for every decision,
// every write through the audit gateway. Ramp, the receipt reader and the Pack lab plug in later (A5–A7).
import { randomUUID } from 'node:crypto';
import {
  CoversError, PlanInput, PlanPatch,
  type AuditEvent, type Attendance, type BreakItResult, type CapStatus, type CompileResult, type CoversService, type Ctx,
  type Evaluation, type FundResult, type Hcp, type PlanView, type ProgramPlan, type ProofBundle, type Receipt,
  type ReceiptImage, type ReceiptLine, type Rep, type ReplayDiff, type RulePack, type Settlement, type Speaker,
} from '@covers/contract';
import { cloneSeed, type Company, type LedgerSeed } from '@covers/contract/fixtures';
import { evaluate, settle, type Approval, type AttendanceHistory, type EngineSettings, type LedgerEntry } from '@covers/engine';
import type { Sql } from './db';
import { listAudit, write } from './gateway';
import { ensureSession, getDoc, listDocs, putDoc, resetSession, type Seed } from './store';

export type HcpSearch = (q: string) => Promise<Hcp[]>;
export type LiveDeps = { sql: Sql; seed?: () => Seed; searchRegistry?: HcpSearch; now?: () => string };

/** Turns the contract fixtures into store documents. */
export function seedFromFixtures(): Seed {
  const f = cloneSeed();
  return {
    company: [{ id: 'company', data: f.company }],
    rep: f.reps.map((r) => ({ id: r.id, data: r })),
    speaker: f.speakers.map((s) => ({ id: s.id, data: s })),
    hcp: f.hcps.map((h) => ({ id: h.npi, data: h })),
    ledger: f.ledger.map((l) => ({ id: l.npi, data: l })),
    plan: f.plans.map((p) => ({ id: p.id, data: p })),
    sampleReceipt: f.sampleReceipts.map((r) => ({ id: r.id, data: r })),
    pack: f.packs.map((p) => ({ id: p.id, data: p })),
  };
}

const notYet = (what: string) => new CoversError('invalid_state', `${what} is not available yet.`);

export class LiveService implements CoversService {
  private readonly sql: Sql;
  private readonly seed: () => Seed;
  private readonly now: () => string;
  constructor(private readonly deps: LiveDeps) {
    this.sql = deps.sql;
    this.seed = deps.seed ?? seedFromFixtures;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  private async open(ctx: Ctx) {
    await ensureSession(this.sql, ctx, this.seed());
    return ctx.sessionId;
  }

  private async plan(sid: string, id: string): Promise<ProgramPlan> {
    const p = await getDoc<ProgramPlan>(this.sql, sid, 'plan', id);
    if (!p) throw new CoversError('not_found', `Plan ${id} not found.`);
    return p;
  }

  private async settings(sid: string): Promise<Partial<EngineSettings>> {
    const c = await getDoc<Company>(this.sql, sid, 'company', 'company');
    if (!c) return {};
    return {
      perPersonCapCents: c.perPersonCapCents, defaultAnnualCapCents: c.annualCapCents,
      nearNumerator: c.nearThresholdPct, nearDenominator: 100, repeatTopicThreshold: c.repeatTopicFlagAt,
    };
  }

  /** Everything the engine needs, read from the session. */
  private async facts(sid: string, plan: ProgramPlan) {
    const [speakers, hcps, ledger, history, settings] = await Promise.all([
      listDocs<Speaker>(this.sql, sid, 'speaker'), listDocs<Hcp>(this.sql, sid, 'hcp'),
      listDocs<LedgerSeed>(this.sql, sid, 'ledger'), listDocs<AttendanceHistory>(this.sql, sid, 'history'),
      this.settings(sid),
    ]);
    const known = new Map(hcps.map((h) => [h.npi, h]));
    for (const s of speakers) if (!known.has(s.hcp.npi)) known.set(s.hcp.npi, s.hcp);
    for (const npi of plan.inviteeNpis) {
      if (!known.has(npi)) { const h = await getDoc<Hcp>(this.sql, sid, 'registryHcp', npi); if (h) known.set(npi, h); }
    }
    return {
      plan, speaker: speakers.find((s) => s.id === plan.speakerId) ?? null, hcps: [...known.values()],
      ledger: ledger.map((l): LedgerEntry => ({ npi: l.npi, ytdCents: l.ytdCents, sameTopicCount12mo: l.sameTopicCount12mo })),
      history, settings, now: this.now(),
    };
  }

  // ---- reference data ----
  async listSpeakers(ctx: Ctx): Promise<Speaker[]> { return listDocs(this.sql, await this.open(ctx), 'speaker'); }
  async listReps(ctx: Ctx): Promise<Rep[]> { return listDocs(this.sql, await this.open(ctx), 'rep'); }

  async searchHcps(ctx: Ctx, q: string): Promise<Hcp[]> {
    const sid = await this.open(ctx);
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const seed = (await listDocs<Hcp>(this.sql, sid, 'hcp')).filter((h) => h.npi === needle || h.name.toLowerCase().includes(needle));
    if (seed.length > 0 || !this.deps.searchRegistry) return seed;
    const found = await this.deps.searchRegistry(q);
    // Remember registry identities this session has seen, so plans can resolve them. Identity only, zero spend.
    if (found.length > 0) {
      await write(this.sql, ctx, { action: 'hcp.registry_lookup', input: q, detail: `${found.length} registry match(es)` },
        async (tx) => { for (const h of found) await putDoc(tx, sid, 'registryHcp', h.npi, h); });
    }
    return found;
  }

  // ---- before the dinner ----
  async createPlan(ctx: Ctx, input: PlanInput): Promise<ProgramPlan> {
    const sid = await this.open(ctx);
    const parsed = PlanInput.safeParse(input);
    if (!parsed.success) throw new CoversError('validation', parsed.error.message);
    const plan: ProgramPlan = { ...parsed.data, id: `plan-${randomUUID()}`, status: 'draft' };
    await write(this.sql, ctx, { action: 'plan.created', planId: plan.id, input: plan, detail: plan.title },
      (tx) => putDoc(tx, sid, 'plan', plan.id, plan));
    return plan;
  }

  async getPlan(ctx: Ctx, id: string): Promise<PlanView> {
    const sid = await this.open(ctx);
    return { plan: await this.plan(sid, id), evaluation: await getDoc<Evaluation>(this.sql, sid, 'evaluation', id) };
  }

  async updatePlan(ctx: Ctx, id: string, patch: PlanPatch): Promise<ProgramPlan> {
    const sid = await this.open(ctx);
    const current = await this.plan(sid, id);
    const parsed = PlanPatch.safeParse(patch); // unknown keys such as status or fundId are stripped
    if (!parsed.success) throw new CoversError('validation', parsed.error.message);
    const next: ProgramPlan = { ...current, ...parsed.data, status: 'draft' };
    await write(this.sql, ctx, { action: 'plan.updated', planId: id, input: parsed.data, detail: `Edited: ${Object.keys(parsed.data).join(', ')}; back to draft` },
      (tx) => putDoc(tx, sid, 'plan', id, next));
    return next;
  }

  /** Evaluates with the given approvals (default: stored ones) and stores approvals, evaluation and status together. */
  private async runEvaluation(ctx: Ctx, sid: string, plan: ProgramPlan, action: string, detail: string, newApprovals?: Approval[]) {
    const approvals = newApprovals ?? (await getDoc<Approval[]>(this.sql, sid, 'approvals', plan.id)) ?? [];
    const ev = evaluate({ ...(await this.facts(sid, plan)), approvals });
    await write(this.sql, ctx, { action, planId: plan.id, input: { plan, approvals }, detail: `${detail} → ${ev.status}` }, async (tx) => {
      if (newApprovals) await putDoc(tx, sid, 'approvals', plan.id, newApprovals);
      await putDoc(tx, sid, 'evaluation', plan.id, ev);
      await putDoc(tx, sid, 'plan', plan.id, { ...plan, status: ev.status });
    });
    return ev;
  }

  async evaluatePlan(ctx: Ctx, id: string): Promise<Evaluation> {
    const sid = await this.open(ctx);
    return this.runEvaluation(ctx, sid, await this.plan(sid, id), 'plan.evaluated', 'Plan evaluated');
  }

  async approveException(ctx: Ctx, id: string, checkId: string, note: string): Promise<Evaluation> {
    const sid = await this.open(ctx);
    const plan = await this.plan(sid, id);
    if (ctx.actorId === plan.repId) throw new CoversError('forbidden', 'A rep cannot approve an exception on their own plan.');
    const latest = await getDoc<Evaluation>(this.sql, sid, 'evaluation', id);
    const check = latest?.checks.find((c) => c.id === checkId);
    if (!check) throw new CoversError('not_found', `Check ${checkId} is not on the latest evaluation.`);
    if (check.outcome !== 'flag') throw new CoversError('invalid_state', `Only flags can be approved; this check is ${check.outcome}.`);
    const approvals = (await getDoc<Approval[]>(this.sql, sid, 'approvals', id)) ?? [];
    const next = [...approvals.filter((a) => a.checkId !== checkId), { checkId, by: ctx.actorId, note, at: this.now() }];
    return this.runEvaluation(ctx, sid, plan, 'exception.approved', `Approved ${checkId}: ${note}`, next);
  }

  async issueFund(ctx: Ctx, id: string): Promise<FundResult> {
    const sid = await this.open(ctx);
    const plan = await this.plan(sid, id);
    if (plan.status !== 'cleared') throw new CoversError('invalid_state', `Plan is ${plan.status}; a fund is issued only for a cleared plan.`);
    const s = await this.settings(sid);
    const headcount = new Set(plan.inviteeNpis).size + 1 + plan.employeeCount; // invitees + speaker + employees
    // Ramp sandbox not wired yet (A1 spike pending): an honest simulated fund.
    const fund: FundResult = { fundId: `sim-fund-${randomUUID()}`, limitCents: (s.perPersonCapCents ?? 12_500) * headcount, simulated: true };
    await write(this.sql, ctx, { action: 'fund.issued', planId: id, input: fund, detail: `Simulated fund, limit ${fund.limitCents} cents` },
      (tx) => putDoc(tx, sid, 'plan', id, { ...plan, fundId: fund.fundId }));
    return fund;
  }

  // ---- after the dinner ----
  async submitReceipt(ctx: Ctx, planId: string, image: ReceiptImage): Promise<Receipt> {
    const sid = await this.open(ctx);
    await this.plan(sid, planId);
    if (!('sampleId' in image)) throw notYet('Reading uploaded receipt photos'); // A5
    const sample = await getDoc<Receipt>(this.sql, sid, 'sampleReceipt', image.sampleId);
    if (!sample) throw new CoversError('not_found', `Sample receipt ${image.sampleId} not found.`);
    const receipt: Receipt = { ...sample, id: `rcpt-${randomUUID()}`, planId };
    await write(this.sql, ctx, { action: 'receipt.read', planId, input: image, detail: `Sample ${image.sampleId}, ${receipt.lines.length} lines` },
      (tx) => putDoc(tx, sid, 'receipt', planId, receipt));
    return receipt;
  }

  async getReceipt(ctx: Ctx, planId: string): Promise<Receipt | null> {
    return getDoc(this.sql, await this.open(ctx), 'receipt', planId);
  }

  async fixLine(ctx: Ctx, receiptId: string, lineId: string, patch: Partial<ReceiptLine>): Promise<Receipt> {
    const sid = await this.open(ctx);
    const receipt = (await listDocs<Receipt>(this.sql, sid, 'receipt')).find((r) => r.id === receiptId);
    if (!receipt) throw new CoversError('not_found', `Receipt ${receiptId} not found.`);
    if (!receipt.lines.some((l) => l.id === lineId)) throw new CoversError('not_found', `Line ${lineId} not found.`);
    const { id: _ignored, ...fields } = patch;
    // A person confirmed it, so confidence is 1.
    const next: Receipt = { ...receipt, lines: receipt.lines.map((l) => (l.id === lineId ? { ...l, ...fields, confidence: 1 } : l)) };
    await write(this.sql, ctx, { action: 'receipt.line_fixed', planId: receipt.planId, input: { lineId, patch: fields }, detail: `Line ${lineId} confirmed` },
      (tx) => putDoc(tx, sid, 'receipt', receipt.planId, next));
    return next;
  }

  async confirmAttendance(ctx: Ctx, a: Attendance): Promise<Settlement> {
    const sid = await this.open(ctx);
    const plan = await this.plan(sid, a.planId);
    if (ctx.actorId !== plan.repId || a.confirmedBy !== plan.repId) throw new CoversError('forbidden', "Only the plan's rep can confirm who came.");
    if (await getDoc(this.sql, sid, 'settlement', plan.id)) throw new CoversError('invalid_state', 'Attendance is already confirmed for this plan.');
    const receipt = await getDoc<Receipt>(this.sql, sid, 'receipt', plan.id);
    if (!receipt) throw new CoversError('invalid_state', 'Submit the receipt before confirming attendance.');

    const st = settle({ ...(await this.facts(sid, plan)), receipt, attendance: a });
    const shares = new Map(st.byPerson.filter((p) => p.npi).map((p) => [p.npi!, p.amountCents]));
    const ledger = await listDocs<LedgerSeed>(this.sql, sid, 'ledger');
    const day = plan.date.slice(0, 10);
    await write(this.sql, ctx, { action: 'attendance.confirmed', planId: plan.id, input: a, detail: `${st.headcount} ate; ${st.exceptions.length} exception(s)` }, async (tx) => {
      for (const [npi, cents] of shares) {
        const row = ledger.find((l) => l.npi === npi) ?? { npi, ytdCents: 0, sameTopicCount12mo: 0 };
        await putDoc(tx, sid, 'ledger', npi, { ...row, ytdCents: row.ytdCents + cents });
        await putDoc(tx, sid, 'history', `${plan.id}:${npi}`, { npi, topic: plan.topic, date: day, planId: plan.id } satisfies AttendanceHistory);
      }
      await putDoc(tx, sid, 'settlement', plan.id, st);
      await putDoc(tx, sid, 'plan', plan.id, { ...plan, status: st.exceptions.length > 0 ? 'reconciling' : 'closed' });
    });
    return st;
  }

  async getSettlement(ctx: Ctx, planId: string): Promise<Settlement | null> {
    return getDoc(this.sql, await this.open(ctx), 'settlement', planId);
  }

  // ---- compliance views ----
  async listPlans(ctx: Ctx): Promise<ProgramPlan[]> { return listDocs(this.sql, await this.open(ctx), 'plan'); }

  async getLedger(ctx: Ctx): Promise<CapStatus[]> {
    const sid = await this.open(ctx);
    const s = await this.settings(sid);
    const cap = s.defaultAnnualCapCents ?? 200_000;
    const num = s.nearNumerator ?? 4, den = s.nearDenominator ?? 5;
    const history = await listDocs<AttendanceHistory>(this.sql, sid, 'history');
    return (await listDocs<LedgerSeed>(this.sql, sid, 'ledger')).map((l) => ({
      npi: l.npi, capCents: cap, ytdCents: l.ytdCents, projectedCents: l.ytdCents,
      state: l.ytdCents > cap ? 'over' : l.ytdCents * den > cap * num ? 'near' : 'ok',
      sameTopicCount12mo: l.sameTopicCount12mo + history.filter((h) => h.npi === l.npi).length,
    }));
  }

  async listAudit(ctx: Ctx, filter?: { planId?: string }): Promise<AuditEvent[]> {
    return listAudit(this.sql, await this.open(ctx), filter?.planId);
  }

  // ---- pack lab (A7) ----
  async listPacks(ctx: Ctx): Promise<RulePack[]> { return listDocs(this.sql, await this.open(ctx), 'pack'); }
  async compilePack(_ctx: Ctx, _english: string): Promise<CompileResult> { throw notYet('The Pack lab'); }
  async replayPack(_ctx: Ctx, _packId: string): Promise<ReplayDiff> { throw notYet('The Pack lab'); }
  async promotePack(_ctx: Ctx, _packId: string): Promise<RulePack> { throw notYet('The Pack lab'); }

  // ---- judge tools ----
  async runBreakIt(_ctx: Ctx, _caseId: number): Promise<BreakItResult> { throw notYet('Break-It'); } // A8
  async getProof(): Promise<ProofBundle> { return cloneSeed().proof; } // placeholder until evals write proof/proof.json (A8)

  async reset(ctx: Ctx): Promise<void> { await resetSession(this.sql, ctx, this.seed()); }
}
