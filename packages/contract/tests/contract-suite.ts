// Contract test suite. Run it against any CoversService:
//
//   import { runContractSuite } from '@covers/contract/tests';
//   runContractSuite('FixtureService', () => new FixtureService());
//
// If two implementations both pass, flipping COVERS_MODE cannot break the web app.
// Numbers come from docs/decisions.md (six invitees + speaker, all-in per-person value, etc.).
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as S from '../src/types';
import type { CoversService } from '../src/service';
import { IDS, fixtures } from '../fixtures';

type Make = () => CoversService | Promise<CoversService>;

export function runContractSuite(name: string, make: Make) {
  describe(`CoversService contract: ${name}`, () => {
    let svc: CoversService;
    let rep: S.Ctx;
    let cmp: S.Ctx;

    beforeEach(async () => {
      svc = await make();
      const sessionId = `contract-${crypto.randomUUID()}`;
      rep = { sessionId, actorId: IDS.rep };
      cmp = { sessionId, actorId: IDS.compliance };
    });

    const demoPlan = async (ctx: S.Ctx) => {
      const plan = (await svc.listPlans(ctx)).find((p) => p.id === IDS.demoPlan);
      expect(plan, 'seed plan plan-demo exists').toBeDefined();
      return S.ProgramPlan.parse(plan);
    };

    const removeRuvane = async (ctx: S.Ctx) => {
      const plan = await demoPlan(ctx);
      return svc.updatePlan(ctx, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
    };

    /** Ruvane removed → evaluated → cleared → fund issued → clean receipt submitted. */
    const readyForAttendance = async () => {
      await removeRuvane(rep);
      await svc.evaluatePlan(rep, IDS.demoPlan);
      await svc.issueFund(rep, IDS.demoPlan);
      return S.Receipt.parse(await svc.submitReceipt(rep, IDS.demoPlan, { sampleId: IDS.cleanReceipt }));
    };

    const kinsaleNoShow = (): S.Attendance => ({
      planId: IDS.demoPlan,
      attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery],
      employeesPresent: 1,
      extraGuests: 0,
      confirmedBy: IDS.rep,
    });

    /** A refusal must reject with a plain { code, message } (a class instance also satisfies this). */
    const expectRefusal = async (p: Promise<unknown>, code: S.CoversErrorCode) => {
      const err = await p.then(
        () => { throw new Error(`expected a refusal with code '${code}', but the call succeeded`); },
        (e: unknown) => e,
      );
      expect(S.CoversErrorBody.parse({ code: (err as S.CoversErrorBody).code, message: (err as S.CoversErrorBody).message }).code).toBe(code);
    };

    const ruvaneRepeatFlag = (ev: S.Evaluation) => {
      const flag = ev.checks.find((c) => c.subject.kind === 'hcp' && c.subject.npi === IDS.ruvane && c.packId === 'P5' && c.outcome === 'flag');
      expect(flag, 'Dr. Ruvane repeat-attendance flag').toBeDefined();
      return flag!;
    };

    const capFor = (caps: S.CapStatus[], npi: string) => {
      const c = caps.find((x) => x.npi === npi);
      expect(c, `cap status for ${npi}`).toBeDefined();
      return c!;
    };

    describe('reference data', () => {
      it('lists Dr. Patel as approved and Dr. Ortwell as training expired', async () => {
        const speakers = z.array(S.Speaker).parse(await svc.listSpeakers(rep));
        expect(speakers.find((s) => s.id === IDS.patelSpeaker)?.status).toBe('approved');
        expect(speakers.find((s) => s.id === IDS.ortwellSpeaker)?.status).toBe('training_expired');
      });

      it('finds Dr. Ruvane by name and by NPI', async () => {
        const byName = z.array(S.Hcp).parse(await svc.searchHcps(rep, 'Ruvane'));
        expect(byName.some((h) => h.npi === IDS.ruvane)).toBe(true);
        const byNpi = z.array(S.Hcp).parse(await svc.searchHcps(rep, IDS.ruvane));
        expect(byNpi.some((h) => h.npi === IDS.ruvane)).toBe(true);
      });

      it('lists Jordan Lee as a rep', async () => {
        const reps = z.array(S.Rep).parse(await svc.listReps(rep));
        expect(reps.some((r) => r.id === IDS.rep)).toBe(true);
      });
    });

    describe('before the dinner', () => {
      it('creates a plan as a draft with an id', async () => {
        const { id: _id, status: _status, ...input } = fixtures.plans[0]!;
        const plan = S.ProgramPlan.parse(await svc.createPlan(rep, { ...input, title: 'Contract test dinner' }));
        expect(plan.id).not.toBe('');
        expect(plan.status).toBe('draft');
        expect(plan.fundId).toBeUndefined();
      });

      it('blocks the scripted plan because Dr. Ruvane would pass her annual cap', async () => {
        const ev = S.Evaluation.parse(await svc.evaluatePlan(rep, IDS.demoPlan));
        expect(ev.status).toBe('blocked');

        const ruvane = capFor(ev.caps, IDS.ruvane);
        expect(ruvane).toMatchObject({ capCents: 200000, ytdCents: 194000, projectedCents: 205000, state: 'over', sameTopicCount12mo: 2 });

        const ruvaneChecks = ev.checks.filter((c) => c.subject.kind === 'hcp' && c.subject.npi === IDS.ruvane);
        expect(ruvaneChecks.some((c) => c.packId === 'P4' && c.outcome === 'block')).toBe(true);
        expect(ruvaneChecks.some((c) => c.packId === 'P5' && c.outcome === 'flag')).toBe(true);
      });

      it('blocks the plan under P1 when Dr. Ortwell is the speaker', async () => {
        await removeRuvane(rep);
        await svc.updatePlan(rep, IDS.demoPlan, { speakerId: IDS.ortwellSpeaker });
        const ev = S.Evaluation.parse(await svc.evaluatePlan(rep, IDS.demoPlan));
        expect(ev.status).toBe('blocked');
        expect(ev.checks.some((c) => c.packId === 'P1' && c.outcome === 'block' && c.subject.kind === 'plan')).toBe(true);
      });

      it('clears the plan once Dr. Ruvane is removed, and issues an $875 fund', async () => {
        await removeRuvane(rep);
        const ev = S.Evaluation.parse(await svc.evaluatePlan(rep, IDS.demoPlan));
        expect(ev.status).toBe('cleared');
        expect(ev.checks.filter((c) => c.outcome === 'block')).toEqual([]);

        // 5 invitees + speaker + 1 employee = 7 × $125
        const fund = S.FundResult.parse(await svc.issueFund(rep, IDS.demoPlan));
        expect(fund.limitCents).toBe(87500);
        expect((await demoPlan(rep)).fundId).toBe(fund.fundId);
      });

      it('refuses to issue a fund for a plan that is not cleared', async () => {
        await svc.evaluatePlan(rep, IDS.demoPlan);
        await expectRefusal(svc.issueFund(rep, IDS.demoPlan), 'invalid_state');
      });

      it('never lets a rep set status directly', async () => {
        // The type forbids it; an HTTP caller could still send it. Either reject it or ignore it.
        await svc.updatePlan(rep, IDS.demoPlan, { status: 'cleared' } as unknown as S.PlanPatch).catch(() => undefined);
        expect((await svc.getPlan(rep, IDS.demoPlan)).plan.status).not.toBe('cleared');
        await expectRefusal(svc.issueFund(rep, IDS.demoPlan), 'invalid_state');
      });

      it('sends a cleared plan back to draft when it is edited', async () => {
        await removeRuvane(rep);
        await svc.evaluatePlan(rep, IDS.demoPlan);
        const edited = await svc.updatePlan(rep, IDS.demoPlan, { venue: 'Somewhere else' });
        expect(edited.status).toBe('draft');
        await expectRefusal(svc.issueFund(rep, IDS.demoPlan), 'invalid_state');
      });

      it('getPlan returns the latest evaluation without re-evaluating', async () => {
        expect(S.PlanView.parse(await svc.getPlan(rep, IDS.demoPlan)).evaluation).toBeNull();

        const ev = await svc.evaluatePlan(rep, IDS.demoPlan);
        const countEvaluated = async () =>
          (await svc.listAudit(cmp, { planId: IDS.demoPlan })).filter((e) => e.action === 'plan.evaluated').length;
        const before = await countEvaluated();

        const view = S.PlanView.parse(await svc.getPlan(rep, IDS.demoPlan));
        expect(view.evaluation?.evaluatedAt).toBe(ev.evaluatedAt);
        expect(view.plan.status).toBe('blocked');
        expect(await countEvaluated()).toBe(before);
      });

      it('lets compliance approve a flag, and records who approved it', async () => {
        const flag = ruvaneRepeatFlag(await svc.evaluatePlan(rep, IDS.demoPlan));
        const ev = S.Evaluation.parse(await svc.approveException(cmp, IDS.demoPlan, flag.id, 'Reviewed attendance history'));
        const approved = ev.checks.find((c) => c.id === flag.id);
        expect(approved?.approval).toMatchObject({ by: IDS.compliance, note: 'Reviewed attendance history' });
      });

      it('refuses when the rep approves their own exception', async () => {
        const flag = ruvaneRepeatFlag(await svc.evaluatePlan(rep, IDS.demoPlan));
        await expectRefusal(svc.approveException(rep, IDS.demoPlan, flag.id, 'self-approval'), 'forbidden');
      });

      it('never approves a block, even for compliance', async () => {
        const ev = await svc.evaluatePlan(rep, IDS.demoPlan);
        const block = ev.checks.find((c) => c.outcome === 'block');
        expect(block).toBeDefined();
        await expectRefusal(svc.approveException(cmp, IDS.demoPlan, block!.id, 'override'), 'invalid_state');
      });

      it('lets compliance deny a flag; the latest decision replaces an approval', async () => {
        const flag = ruvaneRepeatFlag(await svc.evaluatePlan(rep, IDS.demoPlan));
        await svc.approveException(cmp, IDS.demoPlan, flag.id, 'First look');
        const ev = S.Evaluation.parse(await svc.denyException(cmp, IDS.demoPlan, flag.id, 'Third program on this topic'));
        const denied = ev.checks.find((c) => c.id === flag.id);
        expect(denied?.denial).toMatchObject({ by: IDS.compliance, note: 'Third program on this topic' });
        expect(denied?.approval).toBeUndefined();
        expect(ev.status).toBe('blocked');
      });

      it('refuses when the rep denies their own exception, and never denies a block', async () => {
        const ev = await svc.evaluatePlan(rep, IDS.demoPlan);
        await expectRefusal(svc.denyException(rep, IDS.demoPlan, ruvaneRepeatFlag(ev).id, 'self'), 'forbidden');
        await expectRefusal(svc.denyException(cmp, IDS.demoPlan, ev.checks.find((c) => c.outcome === 'block')!.id, 'x'), 'invalid_state');
      });

      it('keeps every evaluation round, oldest first, so the original block stays visible after the fix', async () => {
        expect(await svc.listEvaluations(rep, IDS.demoPlan)).toEqual([]);
        await svc.evaluatePlan(rep, IDS.demoPlan);
        await removeRuvane(rep);
        await svc.evaluatePlan(rep, IDS.demoPlan);
        const rounds = z.array(S.Evaluation).parse(await svc.listEvaluations(cmp, IDS.demoPlan));
        expect(rounds.map((r) => r.status)).toEqual(['blocked', 'cleared']);
        expect(rounds[0]!.checks.some((c) => c.outcome === 'block' && c.subject.kind === 'hcp' && c.subject.npi === IDS.ruvane)).toBe(true);
        expect(rounds[1]).toEqual((await svc.getPlan(rep, IDS.demoPlan)).evaluation);
      });

      it('writes an audit event when a plan is evaluated', async () => {
        await svc.evaluatePlan(rep, IDS.demoPlan);
        const events = z.array(S.AuditEvent).parse(await svc.listAudit(cmp, { planId: IDS.demoPlan }));
        expect(events.some((e) => e.action === 'plan.evaluated' && e.actorId === IDS.rep)).toBe(true);
      });
    });

    describe('after the dinner', () => {
      it('reads the clean sample receipt as $612 for 6 covers, lines reconciling to the cent', async () => {
        const receipt = await readyForAttendance();
        expect(receipt.totalCents).toBe(61200);
        expect(receipt.printedCovers).toBe(6);
        expect(receipt.lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(receipt.totalCents);
        expect(receipt.lines.some((l) => l.category === 'alcohol')).toBe(true);
      });

      it('settles Dr. Kinsale as a no-show: $102 each, her total unchanged, no row for her', async () => {
        await readyForAttendance();
        const before = z.array(S.CapStatus).parse(await svc.getLedger(cmp));

        const st = S.Settlement.parse(await svc.confirmAttendance(rep, kinsaleNoShow()));
        // 4 HCPs + Dr. Patel + Jordan = 6 people; $612 / 6
        expect(st.headcount).toBe(6);
        expect(st.perPersonCents).toBe(10200);
        expect(st.byPerson).toHaveLength(6);
        expect(st.byPerson.reduce((sum, p) => sum + p.amountCents, 0)).toBe(61200);

        const rowNpis = st.openPayments.map((r) => r.npi).sort();
        expect(rowNpis).toEqual([IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery, IDS.patel].sort());
        expect(st.openPayments.every((r) => r.amountCents === 10200)).toBe(true);
        expect(st.checks.some((c) => c.packId === 'P5' && c.outcome === 'flag' && c.subject.kind === 'line')).toBe(true); // the wine

        const after = z.array(S.CapStatus).parse(await svc.getLedger(cmp));
        expect(capFor(after, IDS.kinsale).ytdCents).toBe(capFor(before, IDS.kinsale).ytdCents);
        expect(capFor(after, IDS.ruvane).ytdCents).toBe(capFor(before, IDS.ruvane).ytdCents);
        expect(capFor(after, IDS.okafor).ytdCents).toBe(capFor(before, IDS.okafor).ytdCents + 10200);
        expect(capFor(after, IDS.patel).ytdCents).toBe(capFor(before, IDS.patel).ytdCents + 10200);

        expect(S.Settlement.parse(await svc.getSettlement(rep, IDS.demoPlan))).toEqual(st);
      });

      it('lets compliance decide the wine after the dinner; the plan closes once every exception is decided', async () => {
        await readyForAttendance();
        const st = S.Settlement.parse(await svc.confirmAttendance(rep, kinsaleNoShow()));
        const wine = st.exceptions.find((c) => c.packId === 'P5' && c.subject.kind === 'line');
        expect(wine, 'the wine is an exception').toBeDefined();
        expect(st.exceptions.every((c) => c.outcome === 'flag')).toBe(true);
        expect((await svc.getPlan(rep, IDS.demoPlan)).plan.status).toBe('reconciling');

        await expectRefusal(svc.approveException(rep, IDS.demoPlan, wine!.id, 'self'), 'forbidden');
        await svc.denyException(cmp, IDS.demoPlan, wine!.id, 'Rep reimburses the wine');
        for (const c of st.exceptions.filter((x) => x.id !== wine!.id)) await svc.approveException(cmp, IDS.demoPlan, c.id, 'Reviewed');

        const after = S.Settlement.parse(await svc.getSettlement(cmp, IDS.demoPlan));
        expect(after.exceptions.find((c) => c.id === wine!.id)?.denial).toMatchObject({ by: IDS.compliance, note: 'Rep reimburses the wine' });
        expect(after.exceptions.every((c) => c.approval || c.denial)).toBe(true);
        expect((await svc.getPlan(cmp, IDS.demoPlan)).plan.status).toBe('closed');
        expect(after.perPersonCents).toBe(st.perPersonCents); // deciding never changes the money
      });

      it('returns no settlement before attendance is confirmed', async () => {
        expect(await svc.getSettlement(rep, IDS.demoPlan)).toBeNull();
      });

      it('getReceipt returns null before a receipt is submitted, and the receipt after', async () => {
        expect(await svc.getReceipt(rep, IDS.demoPlan)).toBeNull();
        const submitted = await readyForAttendance();
        expect(S.Receipt.parse(await svc.getReceipt(rep, IDS.demoPlan))).toEqual(submitted);
      });

      it('refuses attendance confirmed by someone other than the rep', async () => {
        await readyForAttendance();
        await expectRefusal(svc.confirmAttendance(cmp, kinsaleNoShow()), 'forbidden');
        await expectRefusal(svc.confirmAttendance(rep, { ...kinsaleNoShow(), confirmedBy: IDS.compliance }), 'forbidden');
      });
    });

    describe('compliance views and judge tools', () => {
      it('returns a ledger row for every seed HCP and speaker', async () => {
        const ledger = z.array(S.CapStatus).parse(await svc.getLedger(cmp));
        for (const { npi } of fixtures.ledger) capFor(ledger, npi);
      });

      it('lists packs P1 to P6 as live', async () => {
        const packs = z.array(S.RulePack).parse(await svc.listPacks(cmp));
        for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
          expect(packs.find((p) => p.id === id)?.status, id).toBe('live');
        }
      });

      it('keeps notes and checkboxes per step, oldest first, without changing the outcome', async () => {
        const ev = await svc.evaluatePlan(rep, IDS.demoPlan);
        expect(await svc.listNotes(rep, IDS.demoPlan)).toEqual([]);
        const a = S.StepNote.parse(await svc.addNote(rep, IDS.demoPlan, { step: 'check', target: 'Annual limit', text: 'Asked Dr. Ruvane about her other programs' }));
        const b = S.StepNote.parse(await svc.addNote(cmp, IDS.demoPlan, { step: 'check', target: 'Red flags', checked: true }));
        expect(a).toMatchObject({ planId: IDS.demoPlan, step: 'check', by: IDS.rep });
        expect(b).toMatchObject({ checked: true, by: IDS.compliance });
        expect((await svc.listNotes(cmp, IDS.demoPlan)).map((n) => n.id)).toEqual([a.id, b.id]);
        expect((await svc.getPlan(rep, IDS.demoPlan)).evaluation?.status).toBe(ev.status);
      });

      it('refuses an empty note and a note on an unknown plan', async () => {
        await expectRefusal(svc.addNote(rep, IDS.demoPlan, { step: 'check' }), 'validation');
        await expectRefusal(svc.addNote(rep, 'plan-nope', { step: 'check', text: 'x' }), 'not_found');
      });

      it('lists the source documents, and every citation with a docId opens a stored passage', async () => {
        const docs = z.array(S.PolicyDocument).parse(await svc.listDocuments());
        expect(docs.length).toBeGreaterThan(0);
        const passage = (c: S.Citation) => docs.find((d) => d.id === c.docId)?.passages.find((p) => p.id === c.passageId);
        const before = await svc.evaluatePlan(rep, IDS.demoPlan);
        await readyForAttendance();
        const st = await svc.confirmAttendance(rep, kinsaleNoShow());
        const cited = [...before.checks, ...st.checks].map((c) => c.citation).filter((c) => c.docId);
        for (const c of cited) expect(passage(c), `${c.ruleId} → ${c.docId}#${c.passageId}`).toBeDefined();
      });

      it('returns a proof bundle with 15 Break-It cases', async () => {
        const proof = S.ProofBundle.parse(await svc.getProof());
        expect(proof.breakIt).toHaveLength(15);
      });
    });

    describe('sessions', () => {
      it('keeps sessions isolated', async () => {
        await removeRuvane(rep);
        const other: S.Ctx = { sessionId: `contract-${crypto.randomUUID()}`, actorId: IDS.rep };
        expect((await demoPlan(other)).inviteeNpis).toContain(IDS.ruvane);
      });

      it('reset restores the seed', async () => {
        await removeRuvane(rep);
        await svc.reset(rep);
        expect((await demoPlan(rep)).inviteeNpis).toEqual(fixtures.plans[0]!.inviteeNpis);
      });
    });
  });
}
