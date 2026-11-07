// Checks that the seed itself tells the story in docs/decisions.md.
import { describe, expect, it } from 'vitest';
import { IDS, fixtures } from '../fixtures';

/** The NPI check digit: Luhn over "80840" + the 10 digits. Real NPIs pass it. */
const npiChecksumPasses = (npi: string) => {
  let sum = 0;
  [...`80840${npi}`].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  });
  return sum % 10 === 0;
};

const ledger = (npi: string) => fixtures.ledger.find((l) => l.npi === npi)!;

describe('seed fixtures', () => {
  const plan = fixtures.plans.find((p) => p.id === IDS.demoPlan)!;
  const { perPersonCapCents, annualCapCents } = fixtures.company;

  it('invites six HCPs, not including the speaker', () => {
    expect(plan.inviteeNpis).toHaveLength(6);
    expect(plan.inviteeNpis).not.toContain(IDS.patel);
    for (const npi of plan.inviteeNpis) expect(fixtures.hcps.some((h) => h.npi === npi)).toBe(true);
  });

  it('uses NPIs that cannot belong to a real doctor', () => {
    const npis = [...fixtures.hcps.map((h) => h.npi), ...fixtures.speakers.map((s) => s.hcp.npi)];
    for (const npi of npis) {
      expect(npi, npi).toMatch(/^9\d{9}$/); // real NPIs start with 1 or 2
      expect(npiChecksumPasses(npi), npi).toBe(false);
    }
    expect(fixtures.hcps.every((h) => h.source === 'seed')).toBe(true);
  });

  it('puts Dr. Ruvane $60 from her cap, over it with this dinner, on her third same-topic program', () => {
    const ruvane = ledger(IDS.ruvane);
    expect(annualCapCents - ruvane.ytdCents).toBe(6000);
    expect(ruvane.ytdCents + plan.estimatedPerPerson).toBeGreaterThan(annualCapCents);
    expect(ruvane.sameTopicCount12mo).toBeGreaterThanOrEqual(fixtures.company.repeatTopicFlagAt);
  });

  it('leaves every other invitee ok (under 80%) so the plan clears once Dr. Ruvane is removed', () => {
    const near = (annualCapCents * fixtures.company.nearThresholdPct) / 100;
    for (const npi of [...plan.inviteeNpis.filter((n) => n !== IDS.ruvane), IDS.patel]) {
      const l = ledger(npi);
      expect(l.ytdCents + plan.estimatedPerPerson, npi).toBeLessThanOrEqual(near);
      expect(l.sameTopicCount12mo, npi).toBeLessThan(fixtures.company.repeatTopicFlagAt);
    }
    expect(plan.estimatedPerPerson).toBeLessThanOrEqual(perPersonCapCents);
  });

  it('has sample receipts whose lines reconcile to the printed total', () => {
    for (const r of fixtures.sampleReceipts) {
      expect(r.lines.reduce((s, l) => s + l.amountCents, 0), r.id).toBe(r.totalCents);
    }
  });

  it('splits the clean receipt evenly: $612 / 6 covers = $102, under the cap', () => {
    const clean = fixtures.sampleReceipts.find((r) => r.id === IDS.cleanReceipt)!;
    expect(clean.printedCovers).toBe(6);
    expect(clean.totalCents / 6).toBe(10200);
    expect(10200).toBeLessThanOrEqual(perPersonCapCents);
    expect(clean.lines.filter((l) => l.category === 'alcohol')).toHaveLength(1);
  });

  it('labels the hard receipt "Beverages" with low confidence', () => {
    const hard = fixtures.sampleReceipts.find((r) => r.id === IDS.hardReceipt)!;
    const bev = hard.lines.find((l) => l.text === 'Beverages')!;
    expect(bev.confidence).toBeLessThan(0.5);
  });

  it('has a citation for every pack', () => {
    for (const p of fixtures.packs) expect(fixtures.citations[p.id]?.packId).toBe(p.id);
  });
});
