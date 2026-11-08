// Compiled rule packs from the Pack lab (A7). The model writes these; this code applies them, deterministically.
// The format is deliberately small: conditions on plan facts, all of which must hold, then flag or block.
import type { Citation, ProgramPlan } from '@covers/contract';
import { dayNumber, localDate } from './dates';

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type PlanFacts = {
  dayOfWeek: Weekday;
  localHour: number; // 0–23, dinner's local time as written
  estimatedPerPersonCents: number;
  inviteeCount: number;
  employeeCount: number;
  headcount: number; // invitees + speaker + employees
  topic: string;
  venue: string;
};

export type NumericField = 'localHour' | 'estimatedPerPersonCents' | 'inviteeCount' | 'employeeCount' | 'headcount';
export type Condition =
  | { field: 'dayOfWeek'; op: 'in'; values: Weekday[] }
  | { field: NumericField; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number }
  | { field: 'topic' | 'venue'; op: 'contains'; text: string };

export type CompiledRule = { id: string; when: Condition[]; outcome: 'flag' | 'block'; message: string };
export type CompiledPack = { rules: CompiledRule[]; citationLabel: string };
export type CustomPack = { id: string; version: string; compiled: CompiledPack };

export function planFacts(plan: ProgramPlan): PlanFacts {
  const day = WEEKDAYS[((dayNumber(plan.date) % 7) + 7 + 4) % 7]!; // 1970-01-01 was a Thursday
  const hour = Number(/T(\d{2}):/.exec(plan.date)?.[1] ?? 0);
  const invitees = new Set(plan.inviteeNpis).size;
  return {
    dayOfWeek: day, localHour: hour, estimatedPerPersonCents: plan.estimatedPerPerson, inviteeCount: invitees,
    employeeCount: plan.employeeCount, headcount: invitees + 1 + plan.employeeCount, topic: plan.topic, venue: plan.venue,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

export function conditionHolds(c: Condition, f: PlanFacts): boolean {
  switch (c.field) {
    case 'dayOfWeek': return c.values.includes(f.dayOfWeek);
    case 'topic': case 'venue': return norm(f[c.field]).includes(norm(c.text));
    default: {
      const v = f[c.field];
      if (c.op === 'gt') return v > c.value;
      if (c.op === 'gte') return v >= c.value;
      if (c.op === 'lt') return v < c.value;
      if (c.op === 'lte') return v <= c.value;
      return v === c.value;
    }
  }
}

export const ruleMatches = (r: CompiledRule, f: PlanFacts) => r.when.every((c) => conditionHolds(c, f));

/** Integer bounds implied by a rule's numeric conditions, per field. */
function bounds(r: CompiledRule) {
  const b: Partial<Record<NumericField, [number, number]>> = {};
  for (const c of r.when) {
    if (!('value' in c)) continue;
    const [lo, hi] = b[c.field] ?? [-Infinity, Infinity];
    const next: [number, number] =
      c.op === 'gt' ? [Math.max(lo, c.value + 1), hi] : c.op === 'gte' ? [Math.max(lo, c.value), hi]
        : c.op === 'lt' ? [lo, Math.min(hi, c.value - 1)] : c.op === 'lte' ? [lo, Math.min(hi, c.value)] : [Math.max(lo, c.value), Math.min(hi, c.value)];
    b[c.field] = next;
  }
  return b;
}

function days(r: CompiledRule): Set<Weekday> {
  let s = new Set<Weekday>(WEEKDAYS);
  for (const c of r.when) if (c.field === 'dayOfWeek') s = new Set(c.values.filter((d) => s.has(d)));
  return s;
}

/** A rule whose conditions can never all hold. */
export function unsatisfiable(r: CompiledRule): string | null {
  if (days(r).size === 0) return `"${r.id}" requires days that never overlap.`;
  for (const [field, [lo, hi]] of Object.entries(bounds(r))) if (lo > hi) return `"${r.id}" needs ${field} to be both ≥ ${lo} and ≤ ${hi}.`;
  return null;
}

const textConds = (r: CompiledRule) =>
  r.when.filter((c) => c.op === 'contains').map((c) => `${c.field}:${norm((c as { text: string }).text)}`).sort().join('|');

/** Two rules that match exactly the same dinners: same days, same numeric ranges, same text conditions. */
function sameDinners(a: CompiledRule, b: CompiledRule): boolean {
  const da = days(a), db = days(b);
  if (da.size !== db.size || [...da].some((d) => !db.has(d))) return false;
  if (textConds(a) !== textConds(b)) return false;
  const ba = bounds(a), bb = bounds(b);
  for (const f of new Set([...Object.keys(ba), ...Object.keys(bb)]) as Set<NumericField>) {
    const [la, ha] = ba[f] ?? [-Infinity, Infinity];
    const [lb, hb] = bb[f] ?? [-Infinity, Infinity];
    if (la !== lb || ha !== hb) return false;
  }
  return true;
}

/** Contradictions inside a pack, found by code (not by the model). */
export function findConflicts(pack: CompiledPack): string[] {
  const out: string[] = [];
  for (const r of pack.rules) { const u = unsatisfiable(r); if (u) out.push(`Never applies: ${u}`); }
  for (let i = 0; i < pack.rules.length; i++) {
    for (let j = i + 1; j < pack.rules.length; j++) {
      const a = pack.rules[i]!, b = pack.rules[j]!;
      if (a.outcome !== b.outcome && sameDinners(a, b)) out.push(`"${a.id}" says ${a.outcome} and "${b.id}" says ${b.outcome} for exactly the same dinners.`);
    }
  }
  return out;
}

export function customCitation(p: CustomPack, ruleId: string): Citation {
  return { label: p.compiled.citationLabel, packId: p.id, ruleId: `${p.id}.${ruleId}`, version: p.version };
}
