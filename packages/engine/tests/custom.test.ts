import { describe, expect, it } from 'vitest';
import { evaluate, findConflicts, planFacts, type CustomPack } from '../src/index';
import { PLAN_WITHOUT_RUIZ, baseInput } from './scenario';

const weekend: CustomPack = {
  id: 'P7', version: '1',
  compiled: { citationLabel: 'Halden Medical policy: weekend dinners need manager approval (fictional)', rules: [
    { id: 'weekend', when: [{ field: 'dayOfWeek', op: 'in', values: ['sat', 'sun'] }], outcome: 'flag', message: 'Weekend dinners need manager approval.' },
  ] },
};
const saturday = { ...PLAN_WITHOUT_RUIZ, date: '2026-11-14T19:00:00-08:00' };

describe('plan facts', () => {
  it('reads the local weekday and hour as written', () => {
    expect(planFacts(PLAN_WITHOUT_RUIZ)).toMatchObject({ dayOfWeek: 'thu', localHour: 19, headcount: 7, inviteeCount: 5 });
    expect(planFacts(saturday).dayOfWeek).toBe('sat');
  });
});

describe('promoted custom packs', () => {
  it('flag a weekend dinner and leave a Thursday dinner cleared', () => {
    const sat = evaluate({ ...baseInput(saturday), customPacks: [weekend] });
    expect(sat.status).toBe('needs_approval');
    expect(sat.checks.find((c) => c.packId === 'P7')).toMatchObject({ outcome: 'flag', ruleId: 'P7.weekend', citation: { packId: 'P7', ruleId: 'P7.weekend', version: '1' } });
    const thu = evaluate({ ...baseInput(PLAN_WITHOUT_RUIZ), customPacks: [weekend] });
    expect(thu.status).toBe('cleared');
    expect(thu.checks.find((c) => c.packId === 'P7')?.outcome).toBe('pass');
  });

  it('a flag from a custom pack can be approved by someone other than the rep', () => {
    const ev = evaluate({ ...baseInput(saturday), customPacks: [weekend], approvals: [{ checkId: 'P7.weekend:plan', by: 'mgr-morgan-reyes', note: 'ok', at: '2026-11-08T10:00:00-08:00' }] });
    expect(ev.status).toBe('cleared');
  });

  it('without custom packs the output is unchanged', () => {
    expect(JSON.stringify(evaluate({ ...baseInput(saturday), customPacks: [] }))).toBe(JSON.stringify(evaluate(baseInput(saturday))));
  });
});

describe('conflict detection (code, not model)', () => {
  it('finds two rules that give the same dinners different outcomes', () => {
    expect(findConflicts({ citationLabel: 'x', rules: [
      { id: 'a', when: [{ field: 'dayOfWeek', op: 'in', values: ['sat', 'sun'] }], outcome: 'block', message: 'Weekend dinners are blocked.' },
      { id: 'b', when: [{ field: 'dayOfWeek', op: 'in', values: ['sun', 'sat'] }], outcome: 'flag', message: 'Weekend dinners only need approval.' },
    ] })).toHaveLength(1);
  });

  it('does not report rules that merely overlap (the stricter one wins)', () => {
    expect(findConflicts({ citationLabel: 'x', rules: [
      { id: 'a', when: [{ field: 'dayOfWeek', op: 'in', values: ['sat'] }], outcome: 'block', message: 'a' },
      { id: 'b', when: [{ field: 'dayOfWeek', op: 'in', values: ['sun'] }], outcome: 'flag', message: 'b' },
      { id: 'c', when: [{ field: 'headcount', op: 'gt', value: 10 }], outcome: 'block', message: 'c' },
      { id: 'd', when: [{ field: 'headcount', op: 'lte', value: 10 }], outcome: 'flag', message: 'd' },
    ] })).toEqual([]);
  });

  it('finds a rule that can never apply', () => {
    expect(findConflicts({ citationLabel: 'x', rules: [
      { id: 'a', when: [{ field: 'localHour', op: 'gt', value: 21 }, { field: 'localHour', op: 'lt', value: 18 }], outcome: 'flag', message: 'a' },
    ] })[0]).toContain('Never applies');
  });
});
