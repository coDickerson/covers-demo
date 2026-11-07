// Derive ground truth (contract ReceiptLine shape minus confidence) from a spec.
import type { GroundTruth, ReceiptSpec, TruthLine } from './schema';

/** Items only (food, alcohol, comps): what a receipt prints as "Subtotal". */
export function subtotalCents(spec: ReceiptSpec): number {
  return spec.items.reduce((s, i) => s + i.amountCents, 0);
}

/** Everything before the tip: subtotal + fees + taxes. Printed as "Amount" on a sign-for-tip slip. */
export function preTipCents(spec: ReceiptSpec): number {
  return (
    subtotalCents(spec) +
    spec.fees.reduce((s, f) => s + f.amountCents, 0) +
    spec.taxes.reduce((s, t) => s + t.amountCents, 0)
  );
}

export function truthLines(spec: ReceiptSpec): TruthLine[] {
  const raw: Omit<TruthLine, 'id'>[] = [
    ...spec.items.map((i) => ({ text: i.text, amountCents: i.amountCents, category: i.category })),
    ...spec.fees.map((f) => ({ text: f.text, amountCents: f.amountCents, category: 'fee' as const })),
    ...spec.taxes.map((t) => ({ text: t.text, amountCents: t.amountCents, category: 'tax' as const })),
    ...(spec.tip ? [{ text: spec.tip.text, amountCents: spec.tip.amountCents, category: 'tip' as const }] : []),
  ];
  return raw.map((l, n) => ({ id: `${spec.id}-L${String(n + 1).padStart(2, '0')}`, ...l }));
}

export function groundTruth(spec: ReceiptSpec): GroundTruth {
  return {
    lines: truthLines(spec),
    totalCents: spec.totalCents,
    ...(spec.printedCovers !== undefined ? { printedCovers: spec.printedCovers } : {}),
    expectedHeadcount: spec.expectedHeadcount,
  };
}

/** 12345 -> "123.45", -1290 -> "-12.90". Integer math only. */
export function fmt(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}${dollars}.${String(abs % 100).padStart(2, '0')}`;
}
