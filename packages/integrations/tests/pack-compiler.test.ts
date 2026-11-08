import { describe, expect, it } from 'vitest';
import { createPackCompiler, type ParsePackFn } from '../src/pack-compiler';

const out = {
  name: 'Weekend dinners', citationLabel: 'Halden Medical policy (fictional)',
  rules: [{ id: 'weekend', when: [{ field: 'dayOfWeek', op: 'in', values: ['sat', 'sun'] }], outcome: 'flag', message: 'Weekend dinners need manager approval.' }],
  tests: [{ name: 'Saturday', facts: { dayOfWeek: 'sat', localHour: 19, estimatedPerPersonCents: 9000, inviteeCount: 5, employeeCount: 1, headcount: 7, topic: 't', venue: 'v' }, expected: 'flag' }],
  conflictsWithExisting: [], unsupported: null,
};
const fake = (o: unknown, stop = 'end_turn') => {
  const calls: any[] = [];
  const parse: ParsePackFn = async (p) => { calls.push(p); return { parsed_output: o, stop_reason: stop, model: 'claude-opus-5-5', usage: { input_tokens: 1500, output_tokens: 600 } }; };
  return { calls, c: createPackCompiler({ parse }) };
};

describe('pack compiler', () => {
  it('returns the validated compiled rule and sends existing packs with the rule wrapped as data', async () => {
    const { c, calls } = fake(out);
    const r = await c.compile('Weekend dinners need manager approval', [{ id: 'P3', name: 'Per-person cap', english: '$125' }]);
    expect(r.output.rules[0]!.outcome).toBe('flag');
    expect(r).toMatchObject({ model: 'claude-opus-5-5', promptVersion: 'pack-v1' });
    expect(calls[0].messages[0].content).toContain('<rule>Weekend dinners need manager approval</rule>');
    expect(calls[0].messages[0].content).toContain('P3 Per-person cap');
    expect(calls[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
  });

  it('throws typed errors for refusals and bad output', async () => {
    await expect(fake(out, 'refusal').c.compile('x', [])).rejects.toMatchObject({ kind: 'refused' });
    await expect(fake({ rules: 'x' }).c.compile('x', [])).rejects.toMatchObject({ kind: 'unparseable' });
  });
});
