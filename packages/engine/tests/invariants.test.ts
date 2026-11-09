// Property tests from docs/implementation.md (A2): shares sum to the total; same input gives a
// byte-identical output; removing an attendee never changes the total; toggling one pack changes only
// that pack's results.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { evaluate, PACK_IDS, settle, splitEvenly, type PackId } from '../src/index';
import { ATTENDANCE, CLEAN_RECEIPT, HCPS, LEDGER, PLAN, PLAN_WITHOUT_RUVANE, baseInput } from './scenario';

const ids = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 20 });
const total = fc.integer({ min: -1_000_000, max: 10_000_000 });

describe('splitEvenly invariants', () => {
  it('shares always sum to the total and differ by at most one cent', () => {
    fc.assert(fc.property(total, ids, (t, who) => {
      const shares = splitEvenly(t, who).map((s) => s.amountCents);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(t);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      expect(shares.every(Number.isInteger)).toBe(true);
    }));
  });

  it('does not depend on input order', () => {
    fc.assert(fc.property(total, ids, fc.integer(), (t, who, seed) => {
      const shuffled = [...who].sort((a, b) => ((a + seed).localeCompare(b + seed)));
      const byId = (xs: { id: string; amountCents: number }[]) => Object.fromEntries(xs.map((x) => [x.id, x.amountCents]));
      expect(byId(splitEvenly(t, shuffled))).toEqual(byId(splitEvenly(t, who)));
    }));
  });
});

const settleInput = (receiptTotal: number, attended: string[], employees: number, guests: number) => ({
  ...baseInput(PLAN_WITHOUT_RUVANE),
  receipt: { ...CLEAN_RECEIPT, totalCents: receiptTotal, lines: [{ ...CLEAN_RECEIPT.lines[0]!, amountCents: receiptTotal }] },
  attendance: { ...ATTENDANCE, attendedNpis: attended, employeesPresent: employees, extraGuests: guests },
});

const attendees = fc.subarray(HCPS.map((h) => h.npi), { minLength: 1 });

describe('settle invariants', () => {
  it('byPerson always sums to the receipt total', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 5_000_000 }), attendees, fc.nat(4), fc.nat(3), (t, att, emp, g) => {
      const s = settle(settleInput(t, att, emp, g));
      expect(s.byPerson.reduce((a, p) => a + p.amountCents, 0)).toBe(t);
      expect(s.headcount).toBe(att.length + emp + g);
    }));
  });

  it('removing an attendee never changes the total and never changes a no-show cap', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 5_000_000 }), attendees.filter((a) => a.length >= 2), fc.nat(), (t, att, k) => {
      const dropped = att[k % att.length]!;
      const fewer = att.filter((n) => n !== dropped);
      const before = settle(settleInput(t, att, 1, 0));
      const after = settle(settleInput(t, fewer, 1, 0));
      expect(after.byPerson.reduce((a, p) => a + p.amountCents, 0)).toBe(before.byPerson.reduce((a, p) => a + p.amountCents, 0));
      const ytd = LEDGER.find((l) => l.npi === dropped)?.ytdCents ?? 0;
      const cap = after.caps.find((c) => c.npi === dropped);
      if (cap) expect(cap.projectedCents).toBe(ytd);
      expect(after.openPayments.some((r) => r.npi === dropped)).toBe(false);
    }));
  });
});

describe('determinism', () => {
  it('the same input gives byte-identical output', () => {
    expect(JSON.stringify(evaluate(baseInput()))).toBe(JSON.stringify(evaluate(baseInput())));
    const s = () => JSON.stringify(settle({ ...baseInput(PLAN_WITHOUT_RUVANE), receipt: CLEAN_RECEIPT, attendance: ATTENDANCE }));
    expect(s()).toBe(s());
  });

  it('input order of hcps, ledger and history does not change the output', () => {
    const a = evaluate(baseInput());
    const b = evaluate({ ...baseInput(), hcps: [...HCPS].reverse(), ledger: [...LEDGER].reverse(), history: [...baseInput().history].reverse() });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('pack independence', () => {
  const without = (p: PackId) => PACK_IDS.filter((x) => x !== p);

  it('switching one pack off removes exactly that pack’s checks and leaves the rest byte-identical', () => {
    for (const plan of [PLAN, PLAN_WITHOUT_RUVANE]) {
      const all = evaluate(baseInput(plan));
      for (const p of PACK_IDS) {
        const off = evaluate({ ...baseInput(plan), settings: { enabledPacks: without(p) } });
        expect(off.checks).toEqual(all.checks.filter((c) => c.packId !== p));
        expect(off.caps).toEqual(all.caps);
      }
      const s = settle({ ...baseInput(PLAN_WITHOUT_RUVANE), receipt: CLEAN_RECEIPT, attendance: ATTENDANCE });
      for (const p of PACK_IDS) {
        const off = settle({ ...baseInput(PLAN_WITHOUT_RUVANE), receipt: CLEAN_RECEIPT, attendance: ATTENDANCE, settings: { enabledPacks: without(p) } });
        expect(off.checks).toEqual(s.checks.filter((c) => c.packId !== p));
        expect(off.byPerson).toEqual(s.byPerson);
      }
    }
  });
});
