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

    const removeRuiz = async (ctx: S.Ctx) => {
      const plan = await demoPlan(ctx);
      return svc.updatePlan(ctx, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruiz) });
    };

    /** Ruiz removed → evaluated → cleared → fund issued → clean receipt submitted. */
    const readyForAttendance = async () => {
      await removeRuiz(rep);
      await svc.evaluatePlan(rep, IDS.demoPlan);
      await svc.issueFund(rep, IDS.demoPlan);
      return S.Receipt.parse(await svc.submitReceipt(rep, IDS.demoPlan, { sampleId: IDS.cleanReceipt }));
    };

    const kimNoShow = (): S.Attendance => ({
      planId: IDS.demoPlan,
      attendedNpis: [IDS.patel, IDS.okafor, IDS.chen, IDS.alvarez, IDS.haas],
      employeesPresent: 1,
      extraGuests: 0,
      confirmedBy: IDS.rep,
    });

    const capFor = (caps: S.CapStatus[], npi: string) => {
      const c = caps.find((x) => x.npi === npi);
      expect(c, `cap status for ${npi}`).toBeDefined();
      return c!;
    };

    describe('reference data', () => {
      it('lists Dr. Patel as approved and Dr. Ortiz as training expired', async () => {
        const speakers = z.array(S.Speaker).parse(await svc.listSpeakers(rep));
        expect(speakers.find((s) => s.id === IDS.patelSpeaker)?.status).toBe('approved');
        expect(speakers.find((s) => s.id === IDS.ortizSpeaker)?.status).toBe('training_expired');
      });

      it('finds Dr. Ruiz by name and by NPI', async () => {
        const byName = z.array(S.Hcp).parse(await svc.searchHcps(rep, 'Ruiz'));
        expect(byName.some((h) => h.npi === IDS.ruiz)).toBe(true);
        const byNpi = z.array(S.Hcp).parse(await svc.searchHcps(rep, IDS.ruiz));
        expect(byNpi.some((h) => h.npi === IDS.ruiz)).toBe(true);
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

      it('blocks the scripted plan because Dr. Ruiz would pass her annual cap', async () => {
        const ev = S.Evaluation.parse(await svc.evaluatePlan(rep, IDS.demoPlan));
        expect(ev.status).toBe('blocked');

        const ruiz = capFor(ev.caps, IDS.ruiz);
        expect(ruiz).toMatchObject({ capCents: 200000, ytdCents: 194000, projectedCents: 205000, state: 'over', sameTopicCount12mo: 2 });

        const ruizChecks = ev.checks.filter((c) => c.subject.kind === 'hcp' && c.subject.npi === IDS.ruiz);
        expect(ruizChecks.some((c) => c.packId === 'P4' && c.outcome === 'block')).toBe(true);
        expect(ruizChecks.some((c) => c.packId === 'P5' && c.outcome === 'flag')).toBe(true);
      });

      it('blocks the plan under P1 when Dr. Ortiz is the speaker', async () => {
        await removeRuiz(rep);
        await svc.updatePlan(rep, IDS.demoPlan, { speakerId: IDS.ortizSpeaker });
        const ev = S.Evaluation.parse(await svc.evaluatePlan(rep, IDS.demoPlan));
        expect(ev.status).toBe('blocked');
        expect(ev.checks.some((c) => c.packId === 'P1' && c.outcome === 'block' && c.subject.kind === 'plan')).toBe(true);
      });

      it('clears the plan once Dr. Ruiz is removed, and issues an $875 fund', async () => {
        await removeRuiz(rep);
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
        await expect(svc.issueFund(rep, IDS.demoPlan)).rejects.toMatchObject({ code: 'invalid_state' });
      });

      it('refuses when the rep approves their own exception', async () => {
        const ev = await svc.evaluatePlan(rep, IDS.demoPlan);
        const block = ev.checks.find((c) => c.outcome === 'block');
        expect(block).toBeDefined();
        await expect(svc.approveException(rep, IDS.demoPlan, block!.id, 'self-approval')).rejects.toMatchObject({ code: 'forbidden' });
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

      it('settles Dr. Kim as a no-show: $102 each, her total unchanged, no row for her', async () => {
        await readyForAttendance();
        const before = z.array(S.CapStatus).parse(await svc.getLedger(cmp));

        const st = S.Settlement.parse(await svc.confirmAttendance(rep, kimNoShow()));
        // 4 HCPs + Dr. Patel + Jordan = 6 people; $612 / 6
        expect(st.headcount).toBe(6);
        expect(st.perPersonCents).toBe(10200);
        expect(st.byPerson).toHaveLength(6);
        expect(st.byPerson.reduce((sum, p) => sum + p.amountCents, 0)).toBe(61200);

        const rowNpis = st.openPayments.map((r) => r.npi).sort();
        expect(rowNpis).toEqual([IDS.okafor, IDS.chen, IDS.alvarez, IDS.haas, IDS.patel].sort());
        expect(st.openPayments.every((r) => r.amountCents === 10200)).toBe(true);
        expect(st.checks.some((c) => c.packId === 'P5' && c.outcome === 'flag' && c.subject.kind === 'line')).toBe(true); // the wine

        const after = z.array(S.CapStatus).parse(await svc.getLedger(cmp));
        expect(capFor(after, IDS.kim).ytdCents).toBe(capFor(before, IDS.kim).ytdCents);
        expect(capFor(after, IDS.ruiz).ytdCents).toBe(capFor(before, IDS.ruiz).ytdCents);
        expect(capFor(after, IDS.okafor).ytdCents).toBe(capFor(before, IDS.okafor).ytdCents + 10200);
        expect(capFor(after, IDS.patel).ytdCents).toBe(capFor(before, IDS.patel).ytdCents + 10200);

        expect(S.Settlement.parse(await svc.getSettlement(rep, IDS.demoPlan))).toEqual(st);
      });

      it('returns no settlement before attendance is confirmed', async () => {
        expect(await svc.getSettlement(rep, IDS.demoPlan)).toBeNull();
      });

      it('refuses attendance confirmed by someone other than the rep', async () => {
        await readyForAttendance();
        await expect(svc.confirmAttendance(cmp, kimNoShow())).rejects.toMatchObject({ code: 'forbidden' });
        await expect(svc.confirmAttendance(rep, { ...kimNoShow(), confirmedBy: IDS.compliance })).rejects.toMatchObject({ code: 'forbidden' });
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

      it('returns a proof bundle with 15 Break-It cases', async () => {
        const proof = S.ProofBundle.parse(await svc.getProof());
        expect(proof.breakIt).toHaveLength(15);
      });
    });

    describe('sessions', () => {
      it('keeps sessions isolated', async () => {
        await removeRuiz(rep);
        const other: S.Ctx = { sessionId: `contract-${crypto.randomUUID()}`, actorId: IDS.rep };
        expect((await demoPlan(other)).inviteeNpis).toContain(IDS.ruiz);
      });

      it('reset restores the seed', async () => {
        await removeRuiz(rep);
        await svc.reset(rep);
        expect((await demoPlan(rep)).inviteeNpis).toEqual(fixtures.plans[0]!.inviteeNpis);
      });
    });
  });
}
