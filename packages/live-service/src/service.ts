// LiveService: the real CoversService. Postgres per-visitor sessions, the pure engine for every decision,
// every write through the audit gateway. Ramp, the receipt reader and the Pack lab plug in later (A5–A7).
import { randomUUID } from 'node:crypto';
import {
  CoversError, PlanInput, PlanPatch,
  type AuditEvent, type Attendance, type BreakItResult, type CapStatus, type CompileResult, type CoversService, type Ctx,
  type Evaluation, type FundResult, type Hcp, type PlanView, type ProgramPlan, type Receipt,
  type ReceiptImage, type ReceiptLine, type Rep, type ReplayDiff, type RulePack, type Settlement, type Speaker,
} from '@covers/contract';
import { cloneSeed, type Company, type LedgerSeed } from '@covers/contract/fixtures';
import { evaluate, settle, type Approval, type AttendanceHistory, type EngineSettings, type LedgerEntry } from '@covers/engine';
import type { Sql } from './db';
import { listAudit, write } from './gateway';
import { hashImage } from './image-hash';
import { looksLikeInstructions, runBreakItCase } from './breakit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProofBundle } from '@covers/contract';
import { ensureSession, getDoc, listDocs, putDoc, resetSession, type Seed } from './store';

export type HcpSearch = (q: string) => Promise<Hcp[]>;

/** The Ramp calls LiveService needs (implemented by @covers/integrations createRampClient). */
export type RampPort = {
  createFund(i: { displayName: string; limitCents: number; idempotencyKey: string }): Promise<{ fundId: string; cardId: string; lastFour: string; ownerUserId: string }>;
  lock(fundId: string): Promise<void>;
  unlock(fundId: string): Promise<void>;
  transactions(cardId: string): Promise<{ id: string; amountCents: number; state: string }[]>;
  setMemo(transactionId: string, memo: string): Promise<void>;
  attachReceipt?(i: { transactionId: string; userId: string; bytes: Uint8Array; mime: string; idempotencyKey: string }): Promise<string>;
};

/** Reads a receipt photo (implemented by @covers/integrations createReceiptReader). */
export type ReceiptReaderPort = {
  read(image: { base64: string; mime: string }): Promise<{
    lines: ReceiptLine[]; totalCents: number; printedCovers?: number; imageHash: string; model: string; promptVersion: string;
    read: { notes: string };
  }>;
};
type StoredImage = { base64: string; mime: string; hash: string };
type RampLink = { fundId: string; cardId: string; lastFour: string; ownerUserId: string; limitCents: number };

export type LiveDeps = { sql: Sql; seed?: () => Seed; searchRegistry?: HcpSearch; ramp?: RampPort; reader?: ReceiptReaderPort; maxReadsPerSession?: number; proofPath?: string; now?: () => string };

const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

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
    await this.noteSuspicious(ctx, plan.id, plan);
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
    await this.lockFund(ctx, sid, id, 'Plan edited after the fund was issued');
    await write(this.sql, ctx, { action: 'plan.updated', planId: id, input: parsed.data, detail: `Edited: ${Object.keys(parsed.data).join(', ')}; back to draft` },
      (tx) => putDoc(tx, sid, 'plan', id, next));
    await this.noteSuspicious(ctx, id, parsed.data);
    return next;
  }

  /** Free text that reads like instructions is recorded in the audit log. It is never interpreted. */
  private async noteSuspicious(ctx: Ctx, planId: string, fields: { title?: string; purpose?: string; topic?: string; venue?: string }) {
    const hits = (['title', 'purpose', 'topic', 'venue'] as const).filter((k) => fields[k] && looksLikeInstructions(fields[k]!));
    if (hits.length === 0) return;
    await write(this.sql, ctx, { action: 'input.suspicious', planId, input: hits, detail: `Instruction-like text in ${hits.join(', ')}; treated as data` }, async () => {});
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
    const limitCents = (s.perPersonCapCents ?? 12_500) * headcount;

    if (this.deps.ramp) {
      try {
        let link = await getDoc<RampLink>(this.sql, sid, 'rampFund', id);
        let how: string;
        if (link && link.limitCents === limitCents) {
          await this.deps.ramp.unlock(link.fundId); // same plan re-cleared: reuse the fund
          how = `Ramp fund …${link.lastFour} unlocked`;
        } else {
          if (link) await this.deps.ramp.lock(link.fundId); // cap changed: retire the old fund
          const f = await this.deps.ramp.createFund({
            displayName: `Covers: ${plan.title}`.slice(0, 80), limitCents, idempotencyKey: `covers-${sid}-${id}-${limitCents}`,
          });
          link = { ...f, limitCents };
          how = `Ramp fund …${f.lastFour} created (restaurants only)`;
        }
        const fund: FundResult = { fundId: link.fundId, limitCents, simulated: false };
        const saved = link;
        await write(this.sql, ctx, { action: 'fund.issued', planId: id, input: fund, detail: `${how}, limit ${limitCents} cents` }, async (tx) => {
          await putDoc(tx, sid, 'rampFund', id, saved);
          await putDoc(tx, sid, 'plan', id, { ...plan, fundId: fund.fundId });
        });
        return fund;
      } catch (e) {
        // Never strand the demo: fall back to a simulated fund, and say so in the audit log.
        await write(this.sql, ctx, { action: 'ramp.failed', planId: id, input: { step: 'issueFund' }, detail: errText(e) }, async () => {});
      }
    }

    const fund: FundResult = { fundId: `sim-fund-${randomUUID()}`, limitCents, simulated: true };
    await write(this.sql, ctx, { action: 'fund.issued', planId: id, input: fund, detail: `Simulated fund, limit ${limitCents} cents` },
      (tx) => putDoc(tx, sid, 'plan', id, { ...plan, fundId: fund.fundId }));
    return fund;
  }

  /** Locks the plan's Ramp fund, if any. Best effort: a Ramp failure is audited, never thrown. */
  private async lockFund(ctx: Ctx, sid: string, planId: string, why: string) {
    const link = this.deps.ramp ? await getDoc<RampLink>(this.sql, sid, 'rampFund', planId) : null;
    if (!link || !this.deps.ramp) return;
    try {
      await this.deps.ramp.lock(link.fundId);
      await write(this.sql, ctx, { action: 'fund.locked', planId, input: { fundId: link.fundId }, detail: `${why}: Ramp fund …${link.lastFour} locked` }, async () => {});
    } catch (e) {
      await write(this.sql, ctx, { action: 'ramp.failed', planId, input: { step: 'lock' }, detail: errText(e) }, async () => {});
    }
  }

  /** After settlement, writes the attendee memo onto the Ramp charge. Best effort, audited. */
  private async writeBackToRamp(ctx: Ctx, sid: string, plan: ProgramPlan, a: Attendance, st: Settlement) {
    const link = this.deps.ramp ? await getDoc<RampLink>(this.sql, sid, 'rampFund', plan.id) : null;
    if (!link || !this.deps.ramp) return;
    try {
      const charges = (await this.deps.ramp.transactions(link.cardId)).filter((t) => t.state === 'CLEARED' || t.state === 'PENDING');
      const charge = charges[0];
      if (!charge) {
        await write(this.sql, ctx, { action: 'ramp.no_transaction', planId: plan.id, input: { cardId: link.cardId }, detail: `No charge yet on card …${link.lastFour}` }, async () => {});
        return;
      }
      const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
      const memo = [
        `Covers ${plan.id}: ${plan.title}`,
        `${st.headcount} ate (${a.attendedNpis.length} HCPs incl. speaker, ${a.employeesPresent} employees, ${a.extraGuests} guests)`,
        `${dollars(st.perPersonCents)} per person`,
        `${st.openPayments.filter((r) => r.reportable).length} Open Payments rows drafted`,
        `${st.exceptions.length} exception(s) to compliance`,
      ].join(' | ');
      await this.deps.ramp.setMemo(charge.id, memo);
      const img = await getDoc<StoredImage>(this.sql, sid, 'receiptImage', plan.id);
      if (img && this.deps.ramp.attachReceipt) {
        await this.deps.ramp.attachReceipt({
          transactionId: charge.id, userId: link.ownerUserId, bytes: Uint8Array.from(Buffer.from(img.base64, 'base64')),
          mime: img.mime, idempotencyKey: `covers-${sid}-${plan.id}-${img.hash.slice(0, 16)}`,
        });
      }
      await write(this.sql, ctx, { action: 'ramp.memo_written', planId: plan.id, input: { transactionId: charge.id, memo }, detail: `Memo written to Ramp charge ${dollars(charge.amountCents)}` }, async () => {});
    } catch (e) {
      await write(this.sql, ctx, { action: 'ramp.failed', planId: plan.id, input: { step: 'memo' }, detail: errText(e) }, async () => {});
    }
  }

  // ---- after the dinner ----
  async submitReceipt(ctx: Ctx, planId: string, image: ReceiptImage): Promise<Receipt> {
    const sid = await this.open(ctx);
    await this.plan(sid, planId);
    if ('sampleId' in image) {
      const sample = await getDoc<Receipt>(this.sql, sid, 'sampleReceipt', image.sampleId);
      if (!sample) throw new CoversError('not_found', `Sample receipt ${image.sampleId} not found.`);
      const receipt: Receipt = { ...sample, id: `rcpt-${randomUUID()}`, planId };
      await write(this.sql, ctx, { action: 'receipt.read', planId, input: image, detail: `Sample ${image.sampleId}, ${receipt.lines.length} lines` },
        (tx) => putDoc(tx, sid, 'receipt', planId, receipt));
      return receipt;
    }

    const reader = this.deps.reader;
    if (!reader) throw notYet('Reading uploaded receipt photos');
    // Guardrails for a public link: a per-session cap on model calls, and no paying twice for the same photo.
    const reads = (await listAudit(this.sql, sid)).filter((e) => e.action === 'receipt.read' && e.model).length;
    if (reads >= (this.deps.maxReadsPerSession ?? 20)) throw new CoversError('rate_limited', 'This demo session has used its receipt reads. Reset to start over.');
    const hash = hashImage(image.base64);
    const seen = (await listDocs<StoredImage>(this.sql, sid, 'receiptImage')).some((i) => i.hash === hash);
    if (seen) throw new CoversError('validation', 'This receipt photo was already submitted (duplicate).');

    let result: Awaited<ReturnType<ReceiptReaderPort['read']>>;
    try {
      result = await reader.read(image);
    } catch (e) {
      throw new CoversError('validation', `Could not read the receipt: ${e instanceof Error ? e.message : String(e)}`);
    }
    const receipt: Receipt = {
      id: `rcpt-${randomUUID()}`, planId, imageUrl: `upload://${hash.slice(0, 16)}`, lines: result.lines, totalCents: result.totalCents,
      ...(result.printedCovers ? { printedCovers: result.printedCovers } : {}),
    };
    const lowConfidence = result.lines.filter((l) => l.confidence < 0.8).length;
    await write(this.sql, ctx, {
      action: 'receipt.read', planId, input: { imageHash: hash }, model: result.model, promptVersion: result.promptVersion,
      detail: `${result.lines.length} lines, ${lowConfidence} need a check${result.read.notes ? `; reader notes: ${result.read.notes.slice(0, 200)}` : ''}`,
    }, async (tx) => {
      await putDoc(tx, sid, 'receiptImage', planId, { base64: image.base64, mime: image.mime, hash } satisfies StoredImage);
      await putDoc(tx, sid, 'receipt', planId, receipt);
    });
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
    await this.writeBackToRamp(ctx, sid, plan, a, st);
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
  async runBreakIt(ctx: Ctx, caseId: number): Promise<BreakItResult> {
    await this.open(ctx);
    const res = await runBreakItCase((extra) => new LiveService({ ...this.deps, ...extra }), this.sql, ctx, caseId);
    await write(this.sql, ctx, { action: 'breakit.run', input: { caseId }, detail: `Case ${caseId}: ${res.passed ? 'passed' : 'FAILED'}. ${res.note}`.slice(0, 500) }, async () => {});
    return res;
  }

  /** proof/proof.json written by `pnpm proof` (real numbers, misses included); the placeholder until then. */
  async getProof(): Promise<ProofBundle> {
    try {
      return ProofBundle.parse(JSON.parse(readFileSync(this.deps.proofPath ?? join(import.meta.dirname, '..', '..', '..', 'proof', 'proof.json'), 'utf8')));
    } catch {
      return cloneSeed().proof;
    }
  }

  async reset(ctx: Ctx): Promise<void> { await resetSession(this.sql, ctx, this.seed()); }
}
