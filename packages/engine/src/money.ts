// Integer-cent arithmetic. Never floats.

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Split a total evenly with largest-remainder rounding. Leftover cents go to ids in ascending
 * (code-point) order, so the result does not depend on input order (decisions.md, "Rounding").
 * Returns entries in the input order.
 */
export function splitEvenly(totalCents: number, ids: readonly string[]): { id: string; amountCents: number }[] {
  if (!Number.isInteger(totalCents)) throw new Error(`splitEvenly: total must be integer cents, got ${totalCents}`);
  if (ids.length === 0) throw new Error('splitEvenly: nobody to split between');
  if (new Set(ids).size !== ids.length) throw new Error('splitEvenly: duplicate ids');

  const n = ids.length;
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n; // 0 ≤ remainder < n
  const bonus = new Set([...ids].sort(compare).slice(0, remainder));
  return ids.map((id) => ({ id, amountCents: base + (bonus.has(id) ? 1 : 0) }));
}

/** total ÷ n rounded half up, in integer arithmetic. For display; shares come from splitEvenly. */
export function divideRounded(totalCents: number, n: number): number {
  return Math.floor((2 * totalCents + n) / (2 * n));
}

/** "$1,940" or "$1,940.05" */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = abs % 100;
  return `${sign}$${dollars}${rest === 0 ? '' : `.${rest.toString().padStart(2, '0')}`}`;
}
