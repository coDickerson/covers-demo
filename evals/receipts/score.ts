// Score a predicted Receipt (contract shape) against ground truth. No model calls.
//
// Matching: a predicted line can match a truth line when the amounts are equal (score 1 + text similarity),
// or when the amounts differ but the text is near-identical (similarity >= 0.8; score = similarity, counted
// as an amount error). Pairs are taken greedily by descending score, each line used at most once.
//
// Per category c:  TP = matched pairs with truth c and predicted c
//                  FN = truth-c lines unmatched or predicted as another class      (recall = TP / n)
//                  FP = predicted-c lines unmatched or matched to another class    (precision = TP / (TP + FP))
// Empty denominators score 1 (nothing to find / nothing claimed). Aggregate across receipts by summing counts.
import type { Receipt } from '@covers/contract';
import { CATEGORIES, type Category, type GroundTruth, type TruthLine } from './schema';

export type ClassEval = { cls: string; precision: number; recall: number; n: number }; // ProofBundle.receiptEval row
export type ClassCounts = { cls: Category; tp: number; fp: number; fn: number; n: number };

type PredLine = Receipt['lines'][number];

export type LinePair = { truth: TruthLine; pred: PredLine; amountMatches: boolean; similarity: number };

export type ReceiptScore = {
  counts: ClassCounts[];
  perCategory: ClassEval[];
  pairs: LinePair[];
  missedTruth: TruthLine[]; // truth lines with no predicted counterpart
  extraPred: PredLine[]; // predicted lines with no truth counterpart
  amountErrors: LinePair[];
  totals: {
    truthTotalCents: number;
    predictedTotalCents: number;
    predictedLinesSumCents: number;
    totalCorrect: boolean; // predicted printed total equals truth
    linesReconcile: boolean; // predicted lines sum to predicted total within one cent
    pass: boolean;
  };
  covers: { truth?: number; predicted?: number; match: boolean };
  alcoholMissed: { id: string; text: string; amountCents: number; predictedAs: Category | null }[];
  alcoholFalsePositives: { id: string; text: string; amountCents: number; truthIs: Category | null }[];
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

function bigrams(s: string): string[] {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice on character bigrams of normalized text, in [0, 1]. */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (!x || !y) return 0;
  const bx = bigrams(x);
  const counts = new Map<string, number>();
  for (const g of bx) counts.set(g, (counts.get(g) ?? 0) + 1);
  let inter = 0;
  const by = bigrams(y);
  for (const g of by) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      inter++;
      counts.set(g, c - 1);
    }
  }
  return (2 * inter) / (bx.length + by.length);
}

const TEXT_ONLY_THRESHOLD = 0.8;

export function matchLines(truth: TruthLine[], pred: PredLine[]): { pairs: LinePair[]; missedTruth: TruthLine[]; extraPred: PredLine[] } {
  const cands: { ti: number; pi: number; score: number; sim: number; amt: boolean }[] = [];
  truth.forEach((t, ti) =>
    pred.forEach((p, pi) => {
      const sim = similarity(t.text, p.text);
      const amt = t.amountCents === p.amountCents;
      if (amt) cands.push({ ti, pi, score: 1 + sim, sim, amt });
      else if (sim >= TEXT_ONLY_THRESHOLD) cands.push({ ti, pi, score: sim, sim, amt });
    }),
  );
  // Stable, deterministic: score desc, then truth order, then prediction order.
  cands.sort((a, b) => b.score - a.score || a.ti - b.ti || a.pi - b.pi);
  const usedT = new Set<number>();
  const usedP = new Set<number>();
  const pairs: LinePair[] = [];
  for (const c of cands) {
    if (usedT.has(c.ti) || usedP.has(c.pi)) continue;
    usedT.add(c.ti);
    usedP.add(c.pi);
    pairs.push({ truth: truth[c.ti]!, pred: pred[c.pi]!, amountMatches: c.amt, similarity: c.sim });
  }
  pairs.sort((a, b) => truth.indexOf(a.truth) - truth.indexOf(b.truth));
  return {
    pairs,
    missedTruth: truth.filter((_, i) => !usedT.has(i)),
    extraPred: pred.filter((_, i) => !usedP.has(i)),
  };
}

const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

export function toClassEval(counts: ClassCounts[]): ClassEval[] {
  return counts.map((c) => ({ cls: c.cls, precision: ratio(c.tp, c.tp + c.fp), recall: ratio(c.tp, c.n), n: c.n }));
}

export function scoreReceipt(truth: GroundTruth, pred: Receipt): ReceiptScore {
  const { pairs, missedTruth, extraPred } = matchLines(truth.lines, pred.lines);

  const counts: ClassCounts[] = CATEGORIES.map((cls) => {
    const n = truth.lines.filter((l) => l.category === cls).length;
    const tp = pairs.filter((p) => p.truth.category === cls && p.pred.category === cls).length;
    const predicted = pred.lines.filter((l) => l.category === cls).length;
    return { cls, tp, fp: predicted - tp, fn: n - tp, n };
  });

  const predOf = new Map(pairs.map((p) => [p.truth, p.pred]));
  const truthOf = new Map(pairs.map((p) => [p.pred, p.truth]));

  const alcoholMissed = truth.lines
    .filter((l) => l.category === 'alcohol' && predOf.get(l)?.category !== 'alcohol')
    .map((l) => ({ id: l.id, text: l.text, amountCents: l.amountCents, predictedAs: predOf.get(l)?.category ?? null }));
  const alcoholFalsePositives = pred.lines
    .filter((l) => l.category === 'alcohol' && truthOf.get(l)?.category !== 'alcohol')
    .map((l) => ({ id: l.id, text: l.text, amountCents: l.amountCents, truthIs: truthOf.get(l)?.category ?? null }));

  const predictedLinesSumCents = pred.lines.reduce((s, l) => s + l.amountCents, 0);
  const totalCorrect = pred.totalCents === truth.totalCents;
  const linesReconcile = Math.abs(predictedLinesSumCents - pred.totalCents) <= 1;

  return {
    counts,
    perCategory: toClassEval(counts),
    pairs,
    missedTruth,
    extraPred,
    amountErrors: pairs.filter((p) => !p.amountMatches),
    totals: {
      truthTotalCents: truth.totalCents,
      predictedTotalCents: pred.totalCents,
      predictedLinesSumCents,
      totalCorrect,
      linesReconcile,
      pass: totalCorrect && linesReconcile,
    },
    covers: { truth: truth.printedCovers, predicted: pred.printedCovers, match: truth.printedCovers === pred.printedCovers },
    alcoholMissed,
    alcoholFalsePositives,
  };
}

/** Sum counts across receipts, then compute precision/recall — the ProofBundle.receiptEval rows. */
export function aggregate(scores: Pick<ReceiptScore, 'counts'>[]): ClassEval[] {
  const total: ClassCounts[] = CATEGORIES.map((cls) => ({ cls, tp: 0, fp: 0, fn: 0, n: 0 }));
  for (const s of scores)
    for (const c of s.counts) {
      const t = total.find((x) => x.cls === c.cls)!;
      t.tp += c.tp;
      t.fp += c.fp;
      t.fn += c.fn;
      t.n += c.n;
    }
  return toClassEval(total);
}
