// Judge edge cases on the fixture service (the public site's mode): see docs/judge-edge-cases.md.
import { describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { FixtureService } from '../lib/fixtures/fixture-service';
import { MemoryStore } from '../lib/store';

const rep = { sessionId: 's-edges', actorId: IDS.rep };

async function settledDinner() {
  const svc = new FixtureService(new MemoryStore());
  const { plan } = await svc.getPlan(rep, IDS.demoPlan);
  await svc.updatePlan(rep, IDS.demoPlan, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
  await svc.evaluatePlan(rep, IDS.demoPlan);
  await svc.issueFund(rep, IDS.demoPlan);
  const receipt = await svc.submitReceipt(rep, IDS.demoPlan, { sampleId: IDS.cleanReceipt });
  return { svc, receipt };
}

describe('judge edge cases (fixtures)', () => {
  it('#30 refuses a second close-out', async () => {
    const { svc } = await settledDinner();
    const att = { planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.lindqvist, IDS.brennick, IDS.ellery], employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep };
    await svc.confirmAttendance(rep, att);
    await expect(svc.confirmAttendance(rep, att)).rejects.toThrow(/already confirmed/);
  });

  it('refuses the rep reclassifying the wine as food; compliance can', async () => {
    const { svc, receipt } = await settledDinner();
    const wine = receipt.lines.find((l) => l.category === 'alcohol')!;
    await expect(svc.fixLine(rep, receipt.id, wine.id, { category: 'food' })).rejects.toThrow(/cannot reclassify an alcohol line/);
    const fixed = await svc.fixLine({ ...rep, actorId: IDS.compliance }, receipt.id, wine.id, { category: 'food' });
    expect(fixed.lines.find((l) => l.id === wine.id)?.category).toBe('food');
  });
});
