// The single dinner screen's logic: which step a dinner is on and what each of the six checkers says.
// Pure functions over contract types, so fixtures and live mode behave the same.
import type { CheckResult, Evaluation, PlanView, Receipt, Settlement } from '@covers/contract';
import type { DocKey } from './documents';

export const STEPS = ['Propose', 'Check', 'Fund', 'Dinner', 'Close out', 'Settle', 'Report'] as const;
export type Role = 'rep' | 'compliance';

export const CHECKERS = [
  { id: 'P1', name: 'Speaker', question: 'Approved, on topic, under contract?' },
  { id: 'P2', name: 'Identity', question: 'Real clinicians, each listed once?' },
  { id: 'P3', name: 'Meal limit', question: 'Within the per-person limit?' },
  { id: 'P4', name: 'Annual limit', question: 'Anyone over their limit this year?' },
  { id: 'P5', name: 'Red flags', question: 'Repeat visits, alcohol, stray guests?' },
  { id: 'P6', name: 'Reporting', question: 'Numbers match? What gets filed?' },
] as const;
export type CheckerId = (typeof CHECKERS)[number]['id'];

export type Mark = 'clear' | 'blocked' | 'flagged' | 'waiting' | 'none';
export const MARK_WORD: Record<Mark, string> = { clear: 'Clear', blocked: 'Blocked', flagged: 'Flagged', waiting: 'Waiting', none: '–' };

export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function stepOf(view: PlanView, receipt: Receipt | null, settlement: Settlement | null, role: Role): number {
  const { plan, evaluation } = view;
  if (plan.status === 'closed') return 6;
  if (settlement) return role === 'compliance' ? 6 : 5;
  if (receipt) return 4;
  if (plan.fundId) return 3;
  if (plan.status === 'cleared') return 2;
  return evaluation ? 1 : 0;
}

const markOf = (c: CheckResult): Mark => (c.outcome === 'block' ? 'blocked' : c.outcome === 'flag' && !c.approval ? 'flagged' : 'clear');

function worst(checks: CheckResult[]): Mark {
  const marks = checks.map(markOf);
  return marks.includes('blocked') ? 'blocked' : marks.includes('flagged') ? 'flagged' : 'clear';
}

export function beforeChecks(id: CheckerId, evaluation: Evaluation | null) {
  return evaluation?.checks.filter((c) => c.packId === id) ?? [];
}

export function afterChecks(id: CheckerId, settlement: Settlement | null) {
  return settlement?.checks.filter((c) => c.packId === id) ?? [];
}

export function beforeMark(id: CheckerId, evaluation: Evaluation | null): Mark {
  if (id === 'P6') return 'none';
  return evaluation ? worst(beforeChecks(id, evaluation)) : 'waiting';
}

export function afterMark(id: CheckerId, settlement: Settlement | null, receipt: Receipt | null): Mark {
  if (id === 'P1') return 'none';
  if (!settlement) return 'waiting';
  const checks = afterChecks(id, settlement);
  if (checks.length) return worst(checks);
  // Fixture mode has no explicit result for these, so read them off the settlement itself.
  if (id === 'P4') return settlement.caps.some((c) => c.state === 'over') ? 'flagged' : 'clear';
  if (id === 'P6') return settlement.byPerson.reduce((n, p) => n + p.amountCents, 0) === receipt?.totalCents ? 'clear' : 'flagged';
  return 'clear';
}

/** The first flag still waiting on a person: after the dinner if settled, otherwise on the plan. */
export function openFlag(evaluation: Evaluation | null, settlement: Settlement | null): CheckResult | undefined {
  const checks = settlement ? settlement.exceptions : (evaluation?.checks ?? []);
  return checks.find((c) => c.outcome === 'flag' && !c.approval && !c.denial);
}

export const SOURCES: Record<CheckerId, { doc: DocKey; at?: string }[]> = {
  P1: [{ doc: 'policy', at: 'speaker' }, { doc: 'oig', at: 'speaker' }],
  P2: [{ doc: 'cms' }],
  P3: [{ doc: 'policy', at: 'meal' }],
  P4: [{ doc: 'cal' }, { doc: 'policy', at: 'annual' }],
  P5: [{ doc: 'oig', at: 'flags' }, { doc: 'policy', at: 'repeat' }],
  P6: [{ doc: 'cms' }],
};

/** Maps a check's evidence id (registry record, roster row, ledger entry, receipt) to the document that holds it. */
export function evidenceDoc(id: string): { doc: DocKey; at?: string } | null {
  if (id === 'company') return { doc: 'policy', at: 'meal' };
  if (id.startsWith('ledger:')) return { doc: 'ledger', at: id.slice('ledger:'.length) };
  if (/^\d{10}$/.test(id)) return { doc: 'npi', at: id };
  if (id.startsWith('spk-')) return { doc: 'speaker' };
  if (id.startsWith('rcpt-')) return { doc: 'receipt' };
  return null;
}
