// Pack lab (A7): English → compiled pack (model) → tests + conflict checks (code) → replay over 20 past dinners →
// a person promotes it → the engine applies it. The model never decides an outcome.
import type { ProgramPlan, RulePack } from '@covers/contract';
import { findConflicts, planFacts, ruleMatches, type CompiledPack, type CustomPack, type PlanFacts } from '@covers/engine';

/** What the compiler returns (implemented by @covers/integrations createPackCompiler). */
export type PackCompilerPort = {
  compile(english: string, existing: { id: string; name: string; english: string }[]): Promise<{
    output: {
      name: string; citationLabel: string; rules: CompiledPack['rules'];
      tests: { name: string; facts: PlanFacts; expected: 'pass' | 'flag' | 'block' }[];
      conflictsWithExisting: { packId: string; reason: string }[]; unsupported: string | null;
    };
    model: string; promptVersion: string;
  }>;
};

/** Stored in RulePack.compiled for Pack-lab packs. */
export type LabCompiled = CompiledPack & {
  tests: { name: string; passed: boolean }[];
  conflicts: string[];
  model: string; promptVersion: string;
  replayed?: { at: string; mealsReplayed: number; changed: number };
};

const rank = { pass: 0, flag: 1, block: 2 } as const;

export function strictestOutcome(pack: CompiledPack, f: PlanFacts): 'pass' | 'flag' | 'block' {
  let best: 'pass' | 'flag' | 'block' = 'pass';
  for (const r of pack.rules) if (ruleMatches(r, f) && rank[r.outcome] > rank[best]) best = r.outcome;
  return best;
}

/** Runs the model's test cases on the engine, plus checks that code (not the model) makes. */
export function labTests(out: Awaited<ReturnType<PackCompilerPort['compile']>>['output']): { tests: LabCompiled['tests']; conflicts: string[] } {
  const compiled: CompiledPack = { rules: out.rules, citationLabel: out.citationLabel };
  const conflicts = [
    ...findConflicts(compiled),
    ...out.conflictsWithExisting.map((c) => `Would loosen or contradict ${c.packId}: ${c.reason}`),
  ];
  const tests = [
    { name: 'Expressible with Covers plan facts', passed: out.unsupported === null && out.rules.length > 0 },
    { name: conflicts.length ? `No conflicts (found: ${conflicts.join(' ')})` : 'No conflicts with itself or existing packs', passed: conflicts.length === 0 },
    ...out.tests.map((t) => {
      const got = strictestOutcome(compiled, t.facts);
      return { name: `${t.name}: expected ${t.expected}, engine says ${got}`, passed: got === t.expected };
    }),
  ];
  if (out.unsupported) tests[0] = { name: `Expressible with Covers plan facts (${out.unsupported})`, passed: false };
  return { tests, conflicts };
}

export const isLabPack = (p: RulePack): p is RulePack & { compiled: LabCompiled } =>
  !!p.compiled && typeof p.compiled === 'object' && Array.isArray((p.compiled as LabCompiled).rules);

export const toCustom = (p: RulePack & { compiled: LabCompiled }): CustomPack =>
  ({ id: p.id, version: p.version, compiled: { rules: p.compiled.rules, citationLabel: p.compiled.citationLabel } });

export function nextPackId(packs: RulePack[]): string {
  const n = Math.max(6, ...packs.map((p) => Number(/^P(\d+)$/.exec(p.id)?.[1] ?? 0)));
  return `P${n + 1}`;
}

/** 20 fictional past dinners for replay: weekdays and weekends, lunches and late dinners, a range of costs and sizes. */
export function pastDinners(): ProgramPlan[] {
  const invitees = ['9000000002', '9000000003', '9000000004', '9000000005', '9000000006', '9000000001'];
  const venues = ['Alder & Vine, San Francisco', 'Harbor Grill, Oakland', 'The Larkspur, Palo Alto', 'Casa Lumen, San Jose'];
  const topics = ['Catheter outcomes', 'Catheter outcomes', 'Stent sizing', 'Imaging workflow'];
  const out: ProgramPlan[] = [];
  for (let i = 0; i < 20; i++) {
    const day = 5 + i * 3; // Sep 5 .. Nov 1
    const month = day <= 30 ? 9 : day <= 61 ? 10 : 11;
    const dom = day <= 30 ? day : day <= 61 ? day - 30 : day - 61;
    const hour = [19, 18, 20, 12, 21][i % 5]!;
    out.push({
      id: `past-${String(i + 1).padStart(2, '0')}`,
      title: `Past dinner ${i + 1}: ${topics[i % 4]}`,
      purpose: 'Peer education (historical, fictional)',
      topic: topics[i % 4]!,
      repId: 'rep-jordan-lee',
      speakerId: 'spk-patel',
      venue: venues[i % 4]!,
      date: `2026-${String(month).padStart(2, '0')}-${String(dom).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-07:00`,
      inviteeNpis: invitees.slice(0, 2 + (i % 5)),
      employeeCount: 1 + (i % 3 === 0 ? 1 : 0),
      estimatedPerPerson: [7_500, 9_800, 11_000, 12_200, 8_600, 10_400, 6_900][i % 7]!,
      status: 'closed',
    });
  }
  return out;
}

export { planFacts };
