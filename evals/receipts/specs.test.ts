import { describe, expect, it } from 'vitest';
import { HardCase } from './schema';
import { SPECS } from './specs';
import { fmt, groundTruth, subtotalCents } from './truth';
import { esc, renderHtml } from './templates';

describe('receipt specs', () => {
  it('has about 25 receipts with unique ids', () => {
    expect(SPECS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SPECS.map((s) => s.id)).size).toBe(SPECS.length);
  });

  it.each(SPECS.map((s) => [s.id, s] as const))('%s reconciles to the cent', (_id, spec) => {
    const t = groundTruth(spec);
    const sum = t.lines.reduce((s, l) => s + l.amountCents, 0);
    expect(sum).toBe(spec.totalCents);
    for (const l of t.lines) expect(Number.isInteger(l.amountCents)).toBe(true);
  });

  it('every hard case is covered by at least one receipt', () => {
    const covered = new Set(SPECS.flatMap((s) => s.tags));
    for (const tag of HardCase.options) expect(covered, tag).toContain(tag);
  });

  it('uses all four templates', () => {
    expect(new Set(SPECS.map((s) => s.template))).toEqual(new Set(['thermal', 'upscale', 'bartab', 'handwritten']));
  });

  it('seed clean: $612.00, 6 covers, exactly one alcohol line which is wine', () => {
    const s = SPECS.find((x) => x.id === 'r01-seed-clean')!;
    expect(s.totalCents).toBe(61200);
    expect(s.printedCovers).toBe(6);
    expect(s.expectedHeadcount).toBe(6);
    const alc = groundTruth(s).lines.filter((l) => l.category === 'alcohol');
    expect(alc).toHaveLength(1);
    expect(alc[0]!.text).toMatch(/cabernet/i);
    expect(s.totalCents / s.expectedHeadcount).toBe(10200);
  });

  it('seed hard: a "Beverages" line that is alcohol, heavily blurred', () => {
    const s = SPECS.find((x) => x.id === 'r02-seed-hard')!;
    expect(s.items.find((i) => i.text === 'Beverages')?.category).toBe('alcohol');
    expect(s.degrade?.blurSigma ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('tags match the data they claim', () => {
    for (const s of SPECS) {
      const t = groundTruth(s);
      const has = (tag: HardCase) => s.tags.includes(tag);
      expect(has('long_receipt'), s.id).toBe(t.lines.length >= 20);
      expect(has('short_receipt'), s.id).toBe(t.lines.length === 3);
      expect(has('covers_mismatch'), s.id).toBe(s.printedCovers !== undefined && s.printedCovers !== s.expectedHeadcount);
      expect(has('no_printed_covers'), s.id).toBe(s.printedCovers === undefined);
      expect(has('discount_comp'), s.id).toBe(s.items.some((i) => i.amountCents < 0));
      expect(has('auto_gratuity') || has('service_charge'), s.id).toBe(s.fees.length > 0);
      expect(has('prompt_injection'), s.id).toBe(
        [...s.items.map((i) => i.text), ...s.footer].some((x) => /ignore previous instructions/i.test(x)),
      );
      if (has('handwritten_tip')) expect(s.template, s.id).toBe('handwritten');
      if (has('liquor_tax')) expect(s.taxes.some((x) => /liquor/i.test(x.text))).toBe(true);
    }
  });

  it('discounts are negative "other" lines; nothing else is negative', () => {
    for (const s of SPECS)
      for (const l of groundTruth(s).lines) {
        if (l.amountCents < 0) expect(l.category, `${s.id} ${l.text}`).toBe('other');
      }
  });

  it('subtotal is positive', () => {
    for (const s of SPECS) expect(subtotalCents(s)).toBeGreaterThan(0);
  });

  it.each(SPECS.map((s) => [s.id, s] as const))('%s HTML prints every line amount and the total', (_id, spec) => {
    const html = renderHtml(spec);
    for (const l of groundTruth(spec).lines) {
      expect(html).toContain(esc(l.text));
      expect(html).toContain(fmt(l.amountCents));
    }
    expect(html).toContain(fmt(spec.totalCents));
  });
});
