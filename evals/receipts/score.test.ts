import { ProofBundle, Receipt, type ReceiptLine } from '@covers/contract';
import { describe, expect, it } from 'vitest';
import type { GroundTruth } from './schema';
import { aggregate, scoreReceipt, similarity } from './score';
import { SPECS } from './specs';
import { groundTruth } from './truth';

const clean = groundTruth(SPECS.find((s) => s.id === 'r01-seed-clean')!);

/** A perfect read of a truth: same lines, high confidence. Tweaks applied per test. */
function predict(truth: GroundTruth, edit: (lines: ReceiptLine[]) => ReceiptLine[] = (l) => l): Receipt {
  const lines = edit(truth.lines.map((l, i) => ({ ...l, id: `p${i}`, confidence: 0.95 })));
  return Receipt.parse({
    id: 'pred',
    planId: 'plan-1',
    imageUrl: 'x',
    lines,
    totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
    ...(truth.printedCovers ? { printedCovers: truth.printedCovers } : {}),
  });
}

const row = (s: ReturnType<typeof scoreReceipt>, cls: string) => s.perCategory.find((r) => r.cls === cls)!;

describe('scoreReceipt', () => {
  it('perfect prediction scores 1.0 everywhere and passes totals and covers', () => {
    const s = scoreReceipt(clean, predict(clean));
    for (const r of s.perCategory) {
      expect(r.precision, r.cls).toBe(1);
      expect(r.recall, r.cls).toBe(1);
    }
    expect(row(s, 'food').n).toBe(6);
    expect(row(s, 'alcohol').n).toBe(1);
    expect(s.totals).toMatchObject({ pass: true, totalCorrect: true, linesReconcile: true, truthTotalCents: 61200 });
    expect(s.covers).toEqual({ truth: 6, predicted: 6, match: true });
    expect(s.alcoholMissed).toEqual([]);
    expect(s.missedTruth).toEqual([]);
    expect(s.extraPred).toEqual([]);
  });

  it('per-category output is a valid ProofBundle.receiptEval', () => {
    const s = scoreReceipt(clean, predict(clean));
    expect(() => ProofBundle.shape.receiptEval.parse(s.perCategory)).not.toThrow();
  });

  it('one alcohol miss: wine read as food', () => {
    const s = scoreReceipt(
      clean,
      predict(clean, (ls) => ls.map((l) => (l.category === 'alcohol' ? { ...l, category: 'food' } : l))),
    );
    expect(row(s, 'alcohol')).toEqual({ cls: 'alcohol', precision: 1, recall: 0, n: 1 });
    expect(row(s, 'food').recall).toBe(1);
    expect(row(s, 'food').precision).toBeCloseTo(6 / 7);
    expect(s.alcoholMissed).toEqual([
      { id: 'r01-seed-clean-L07', text: 'Btl Napa Valley Cabernet Sauvignon 2021', amountCents: 10000, predictedAs: 'food' },
    ]);
    expect(s.totals.pass).toBe(true); // amounts are still right
  });

  it('one alcohol false positive: sparkling water read as alcohol', () => {
    const hard = groundTruth(SPECS.find((x) => x.id === 'r02-seed-hard')!);
    const s = scoreReceipt(
      hard,
      predict(hard, (ls) => ls.map((l) => (l.text === 'Pellegrino 1L' ? { ...l, category: 'alcohol' } : l))),
    );
    expect(row(s, 'alcohol')).toEqual({ cls: 'alcohol', precision: 0.5, recall: 1, n: 1 });
    expect(row(s, 'food').recall).toBeCloseTo(6 / 7);
    expect(s.alcoholMissed).toEqual([]);
    expect(s.alcoholFalsePositives).toEqual([{ id: 'p6', text: 'Pellegrino 1L', amountCents: 1600, truthIs: 'food' }]);
  });

  it('a missing line: tip not read, so the lines no longer reconcile to the printed total', () => {
    const pred = predict(clean, (ls) => ls.filter((l) => l.category !== 'tip'));
    pred.totalCents = 61200; // the printed total was read correctly
    const s = scoreReceipt(clean, pred);
    expect(row(s, 'tip')).toEqual({ cls: 'tip', precision: 1, recall: 0, n: 1 });
    expect(s.missedTruth.map((l) => l.text)).toEqual(['Tip']);
    expect(s.totals).toMatchObject({ totalCorrect: true, linesReconcile: false, pass: false, predictedLinesSumCents: 61200 - 9593 });
  });

  it('matches by amount + fuzzy text even when the reader reorders and rewrites lines', () => {
    const pred = predict(clean, (ls) =>
      ls.reverse().map((l) => (l.text === 'Sales Tax 8.875%' ? { ...l, text: 'SALES TAX' } : { ...l, text: l.text.toUpperCase() })),
    );
    const s = scoreReceipt(clean, pred);
    expect(s.pairs).toHaveLength(clean.lines.length);
    expect(s.perCategory.every((r) => r.precision === 1 && r.recall === 1)).toBe(true);
  });

  it('a misread amount still matches on near-identical text and is reported as an amount error', () => {
    const pred = predict(clean, (ls) => ls.map((l) => (l.text === 'Burrata' ? { ...l, amountCents: 3800 } : l)));
    const s = scoreReceipt(clean, pred);
    expect(s.amountErrors.map((p) => p.truth.text)).toEqual(['Burrata']);
    expect(row(s, 'food').recall).toBe(1);
    expect(s.totals.totalCorrect).toBe(false);
  });

  it('an extra hallucinated line counts against precision only', () => {
    const pred = predict(clean, (ls) => [...ls, { id: 'x', text: 'Corkage', amountCents: 2500, category: 'fee', confidence: 0.4 }]);
    const s = scoreReceipt(clean, pred);
    expect(row(s, 'fee')).toEqual({ cls: 'fee', precision: 0, recall: 1, n: 0 });
    expect(s.extraPred.map((l) => l.text)).toEqual(['Corkage']);
  });

  it('covers mismatch is reported', () => {
    const t = groundTruth(SPECS.find((x) => x.id === 'r09-handwritten-7-covers')!);
    const pred = { ...predict(t), printedCovers: 6 };
    expect(scoreReceipt(t, pred).covers).toEqual({ truth: 7, predicted: 6, match: false });
  });

  it('aggregate sums counts across receipts before dividing', () => {
    const a = scoreReceipt(clean, predict(clean));
    const b = scoreReceipt(clean, predict(clean, (ls) => ls.map((l) => (l.category === 'alcohol' ? { ...l, category: 'food' } : l))));
    const agg = aggregate([a, b]);
    expect(agg.find((r) => r.cls === 'alcohol')).toEqual({ cls: 'alcohol', precision: 1, recall: 0.5, n: 2 });
  });
});

describe('similarity', () => {
  it('is 1 for normalized-equal text and low for unrelated text', () => {
    expect(similarity('Crème Brûlée', 'CREME BRULEE')).toBe(1);
    expect(similarity('Caymus Cab', 'Tiramisu')).toBeLessThan(0.3);
  });
});
