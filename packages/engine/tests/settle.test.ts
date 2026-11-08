import { describe, expect, it } from 'vitest';
import { CoversError, Settlement } from '@covers/contract';
import { settle, splitEvenly } from '../src/index';
import {
  ATTENDANCE, BAKER, CHEN, CLEAN_RECEIPT, KIM, NGUYEN, OKAFOR, PATEL, PLAN_WITHOUT_RUIZ, baseInput,
} from './scenario';

const input = (over: Partial<Parameters<typeof settle>[0]> = {}) => ({
  ...baseInput(PLAN_WITHOUT_RUIZ), receipt: CLEAN_RECEIPT, attendance: ATTENDANCE, ...over,
});
const find = (s: Settlement, id: string) => s.checks.find((c) => c.id === id);

describe('settle: the scripted dinner', () => {
  const s = settle(input());

  it('returns a contract-valid Settlement', () => {
    expect(() => Settlement.parse(s)).not.toThrow();
  });

  it('splits $612 over 6 who ate: $102 each', () => {
    expect(s.headcount).toBe(6);
    expect(s.perPersonCents).toBe(10_200);
    expect(s.byPerson).toHaveLength(6);
    expect(s.byPerson.every((p) => p.amountCents === 10_200)).toBe(true);
    expect(s.byPerson.reduce((a, p) => a + p.amountCents, 0)).toBe(61_200);
  });

  it('leaves the no-show Dr. Kim unchanged and drafts no Open Payments row for her', () => {
    const kim = s.caps.find((c) => c.npi === KIM.npi);
    expect(kim).toMatchObject({ ytdCents: 52_000, projectedCents: 52_000 });
    expect(s.openPayments.some((r) => r.npi === KIM.npi)).toBe(false);
    expect(s.byPerson.some((p) => p.npi === KIM.npi)).toBe(false);
  });

  it('adds each attendee share to their annual total, including the speaker', () => {
    expect(s.caps.find((c) => c.npi === CHEN.npi)?.projectedCents).toBe(40_200);
    expect(s.caps.find((c) => c.npi === PATEL.npi)?.projectedCents).toBe(50_200);
  });

  it('drafts one food-and-beverage row per covered recipient who ate, including the speaker and the NP', () => {
    expect(s.openPayments.map((r) => r.npi).sort()).toEqual([PATEL.npi, CHEN.npi, OKAFOR.npi, NGUYEN.npi, BAKER.npi].sort());
    const baker = s.openPayments.find((r) => r.npi === BAKER.npi);
    expect(baker).toMatchObject({
      recipientType: 'nurse_practitioner', date: '2026-11-12', natureOfPayment: 'food_and_beverage',
      formOfPayment: 'in_kind', amountCents: 10_200, reportable: true,
    });
    expect(baker?.citation.packId).toBe('P6');
  });

  it('tags the wine line and sends it to compliance', () => {
    const wine = find(s, 'P5.alcohol:line:l2');
    expect(wine?.outcome).toBe('flag');
    expect(s.exceptions.map((e) => e.id)).toContain('P5.alcohol:line:l2');
  });

  it('has no other exceptions on the clean receipt', () => {
    expect(s.exceptions.map((e) => e.id)).toEqual(['P5.alcohol:line:l2']);
  });
});

describe('settle: after-dinner rules', () => {
  it('sends an actual per-person over the cap to compliance', () => {
    const receipt = { ...CLEAN_RECEIPT, totalCents: 75_006, lines: [{ ...CLEAN_RECEIPT.lines[0]!, amountCents: 75_006 }] };
    const s = settle(input({ receipt }));
    expect(find(s, 'P3.per-person-actual:plan')?.outcome).toBe('flag');
  });

  it('passes exactly $125 per person', () => {
    const receipt = { ...CLEAN_RECEIPT, totalCents: 75_000, lines: [{ ...CLEAN_RECEIPT.lines[0]!, amountCents: 75_000 }] };
    expect(find(settle(input({ receipt })), 'P3.per-person-actual:plan')?.outcome).toBe('pass');
  });

  it('flags printed covers that do not match who was tapped', () => {
    const s = settle(input({ receipt: { ...CLEAN_RECEIPT, printedCovers: 7 } }));
    expect(find(s, 'P6.covers:plan')?.outcome).toBe('flag');
  });

  it('flags a receipt whose lines do not add up to the printed total (1 cent tolerance)', () => {
    expect(find(settle(input({ receipt: { ...CLEAN_RECEIPT, totalCents: 61_201 } })), 'P6.reconcile:plan')?.outcome).toBe('pass');
    expect(find(settle(input({ receipt: { ...CLEAN_RECEIPT, totalCents: 61_202 } })), 'P6.reconcile:plan')?.outcome).toBe('flag');
  });

  it('flags low-confidence lines for a one-tap fix', () => {
    const lines = CLEAN_RECEIPT.lines.map((l) => (l.id === 'l3' ? { ...l, confidence: 0.4 } : l));
    expect(find(settle(input({ receipt: { ...CLEAN_RECEIPT, lines } })), 'P6.line-confidence:line:l3')?.outcome).toBe('flag');
  });

  it('flags non-HCP guests such as a spouse, and splits with them', () => {
    const s = settle(input({ attendance: { ...ATTENDANCE, extraGuests: 1 }, receipt: { ...CLEAN_RECEIPT, printedCovers: 7 } }));
    expect(find(s, 'P5.non-hcp-guest:plan')?.outcome).toBe('flag');
    expect(s.headcount).toBe(7);
    expect(s.byPerson.reduce((a, p) => a + p.amountCents, 0)).toBe(61_200);
  });

  it('flags someone who ate but was not on the plan', () => {
    const s = settle(input({ attendance: { ...ATTENDANCE, attendedNpis: [...ATTENDANCE.attendedNpis, KIM.npi.replace('202', '299')] } }));
    expect(s.checks.some((c) => c.ruleId === 'P2.uninvited' && c.outcome === 'flag')).toBe(true);
  });

  it('flags an attendee pushed over the annual cap by their share', () => {
    const s = settle(input({ ledger: [{ npi: CHEN.npi, ytdCents: 195_000 }] }));
    expect(find(s, `P4.annual-cap:hcp:${CHEN.npi}`)?.outcome).toBe('flag');
    expect(s.caps.find((c) => c.npi === CHEN.npi)?.state).toBe('over');
  });
});

describe('settle: Open Payments thresholds (program year 2026: $13.82 / $138.13)', () => {
  const tiny = (totalCents: number) => ({ ...CLEAN_RECEIPT, totalCents, lines: [{ ...CLEAN_RECEIPT.lines[0]!, amountCents: totalCents }] });

  it('a share under $13.82 is not reportable when the yearly total stays at or under $138.13', () => {
    const s = settle(input({ receipt: tiny(6 * 1_381), ledger: [{ npi: OKAFOR.npi, ytdCents: 0 }] }));
    expect(s.openPayments.find((r) => r.npi === OKAFOR.npi)?.reportable).toBe(false);
  });

  it('a share of exactly $13.82 is reportable', () => {
    const s = settle(input({ receipt: tiny(6 * 1_382), ledger: [{ npi: OKAFOR.npi, ytdCents: 0 }] }));
    expect(s.openPayments.find((r) => r.npi === OKAFOR.npi)?.reportable).toBe(true);
  });

  it('a small share is reportable once the yearly total exceeds $138.13', () => {
    const s = settle(input({ receipt: tiny(6 * 1_000), ledger: [{ npi: OKAFOR.npi, ytdCents: 13_000 }] }));
    expect(s.openPayments.find((r) => r.npi === OKAFOR.npi)?.reportable).toBe(true);
  });
});

describe('settle: refusals', () => {
  it('rejects attendance or a receipt for another plan', () => {
    expect(() => settle(input({ attendance: { ...ATTENDANCE, planId: 'other' } }))).toThrow(CoversError);
    expect(() => settle(input({ receipt: { ...CLEAN_RECEIPT, planId: 'other' } }))).toThrow(CoversError);
  });

  it('rejects nobody eating and duplicate attendees', () => {
    expect(() => settle(input({ attendance: { ...ATTENDANCE, attendedNpis: [], employeesPresent: 0 } }))).toThrow(CoversError);
    expect(() => settle(input({ attendance: { ...ATTENDANCE, attendedNpis: [CHEN.npi, CHEN.npi] } }))).toThrow(CoversError);
  });
});

describe('splitEvenly', () => {
  it('gives leftover cents to the lowest ids first, regardless of input order', () => {
    expect(splitEvenly(100, ['c', 'a', 'b'])).toEqual([
      { id: 'c', amountCents: 33 }, { id: 'a', amountCents: 34 }, { id: 'b', amountCents: 33 },
    ]);
  });

  it('rejects non-integer totals, empty lists and duplicate ids', () => {
    expect(() => splitEvenly(10.5, ['a'])).toThrow();
    expect(() => splitEvenly(10, [])).toThrow();
    expect(() => splitEvenly(10, ['a', 'a'])).toThrow();
  });
});
