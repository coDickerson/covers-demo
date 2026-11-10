import { describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { FixtureService } from '../lib/fixtures/fixture-service';
import { MemoryStore } from '../lib/store';
import { buildCard } from '../lib/doc-cards';
import { changedStations, isSimulatedFund, RAMP_SANDBOX_URL, rampCardHref, rampFundUrl, layoutPath, restingStation, sourceOf, standing, stationsFor, thinkingLines, type DinnerState } from '../lib/map';

const rep = { sessionId: 'm', actorId: IDS.rep };
const id = IDS.demoPlan;
const state = async (svc: FixtureService): Promise<DinnerState> => {
  const [view, rounds, receipt, settlement, notes, audit] = await Promise.all([svc.getPlan(rep, id), svc.listEvaluations(rep, id), svc.getReceipt(rep, id), svc.getSettlement(rep, id), svc.listNotes(rep, id), svc.listAudit(rep, { planId: id })]);
  return { view, rounds, receipt, settlement, notes, audit };
};

describe('the dinner map reads real results', () => {
  it('blocks on the doctor over the annual limit, and keeps the original round after the fix', async () => {
    const svc = new FixtureService(new MemoryStore());
    expect(standing(...((s) => [s.view, s.receipt, s.settlement] as const)(await state(svc))).say).toBe('Draft, ready to check');
    await svc.evaluatePlan(rep, id);
    let s = await state(svc);
    const annual = stationsFor(1, s);
    expect(annual.find((x) => x.name === 'Annual limit')?.mark).toBe('blocked');
    expect(restingStation(annual)).toBe(3);
    expect(thinkingLines(annual[1]!).length).toBe(s.view.plan.inviteeNpis.length);
    expect(standing(s.view, s.receipt, s.settlement)).toMatchObject({ step: 1, who: 'rep', tone: 'over' });

    const plan = s.view.plan;
    await svc.updatePlan(rep, id, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
    await svc.evaluatePlan(rep, id);
    s = await state(svc);
    expect(changedStations(s.rounds[0]!, s.rounds[1]!).map((i) => stationsFor(1, s)[i]!.name)).toEqual(['Identity', 'Annual limit', 'Red flags']);
    expect(stationsFor(1, s, 0).find((x) => x.name === 'Annual limit')?.mark).toBe('blocked');
    expect(stationsFor(1, s).find((x) => x.name === 'Annual limit')?.mark).toBe('clear');
    expect(standing(s.view, s.receipt, s.settlement)).toMatchObject({ step: 2, who: 'rep' });
  });

  it('opens every rule source and data document in the one card format', async () => {
    const svc = new FixtureService(new MemoryStore());
    const documents = await svc.listDocuments();
    await svc.evaluatePlan(rep, id);
    const s = await state(svc);
    for (const c of s.view.evaluation!.checks) {
      const ref = sourceOf(c);
      expect(documents.find((d) => d.id === ref.doc)?.passages.some((p) => p.id === ref.at), `${c.ruleId} → ${ref.doc}#${ref.at}`).toBe(true);
    }
    for (const doc of ['ledger', 'roster', 'npi', 'ramp', 'audit']) expect(buildCard({ doc }, s, documents)?.head).toBeTruthy();
    expect(buildCard({ doc: 'oig-speaker-programs', at: 'venue' }, s, documents)?.quote).toContain('not conducive');
    expect(buildCard({ doc: 'nope' }, s, documents)).toBeNull();
  });

  it('spreads stations left to right, with a stop for each and increasing path positions', () => {
    const { points, stops } = layoutPath(6, 1200, 700);
    expect(points).toHaveLength(6);
    expect(stops).toHaveLength(8);
    expect(stops[0]).toBe(0);
    expect(stops[7]).toBeCloseTo(100);
    for (let i = 1; i < stops.length; i++) expect(stops[i]!).toBeGreaterThan(stops[i - 1]!);
  });
});

describe('Ramp fund link', () => {
  it('links a real fund to its page in Ramp and gives simulated funds no link', () => {
    expect(rampFundUrl('4b320813-8a5d-4d64-8106-ab45a426ce72')).toBe('https://demo.ramp.com/funds/issued#/d/funds/4b320813-8a5d-4d64-8106-ab45a426ce72');
    for (const sim of ['fund-sim-plan-demo', 'sim-fund-ad82150c']) { expect(isSimulatedFund(sim)).toBe(true); expect(rampFundUrl(sim)).toBeNull(); }
  });

  it('links a real fund to its page, and a simulated one to our Ramp sandbox', async () => {
    const svc = new FixtureService(new MemoryStore());
    const s = await state(svc);
    const real = { ...s, view: { ...s.view, plan: { ...s.view.plan, fundId: 'f-123' } } };
    expect(stationsFor(3, real).find((x) => x.name === 'Card live')?.link?.url).toContain('/funds/f-123');
    const sim = { ...s, view: { ...s.view, plan: { ...s.view.plan, fundId: 'fund-sim-plan-demo' } } };
    expect(stationsFor(3, sim).find((x) => x.name === 'Card live')?.link?.url).toBe(RAMP_SANDBOX_URL);
    expect(rampCardHref(undefined)).toBe(RAMP_SANDBOX_URL);
  });
});
