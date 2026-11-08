// No network: the SDK call is replaced with a fake that records the request.
import { describe, expect, it } from 'vitest';
import { ReceiptLine } from '@covers/contract';
import { createReceiptReader, hashImage, ReceiptReadError, type ParseFn } from '../src/receipt-reader';

const good = {
  lines: [
    { text: 'Entrees (6)', amount_cents: 26400, category: 'food', confidence: 0.97 },
    { text: 'Btl Sancerre', amount_cents: 6800, category: 'alcohol', confidence: 1.2 },
    { text: 'Beverages', amount_cents: 5600, category: 'alcohol', confidence: 0.55 },
  ],
  printed_total_cents: 38800, printed_covers: 6, notes: '',
};

function fake(out: unknown, stop = 'end_turn') {
  const calls: any[] = [];
  const parse: ParseFn = async (p) => { calls.push(p); return { parsed_output: out, stop_reason: stop, model: 'claude-sonnet-5-5', usage: { input_tokens: 2100, output_tokens: 400 } }; };
  return { calls, reader: createReceiptReader({ parse }) };
}

describe('receipt reader', () => {
  it('returns contract-shaped lines with ids, clamped confidence, total, covers and usage', async () => {
    const { reader } = fake(good);
    const r = await reader.read({ base64: 'AAAA', mime: 'image/jpg' });
    expect(r.lines.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    for (const l of r.lines) expect(() => ReceiptLine.parse(l)).not.toThrow();
    expect(r.lines[1]!.confidence).toBe(1);
    expect(r).toMatchObject({ totalCents: 38800, printedCovers: 6, model: 'claude-sonnet-5-5', promptVersion: 'receipt-v1', usage: { inputTokens: 2100, outputTokens: 400 } });
  });

  it('sends the image, structured output, the fallback beta and the injection-safe system prompt', async () => {
    const { reader, calls } = fake(good);
    await reader.read({ base64: 'AAAA', mime: 'image/png' });
    const p = calls[0];
    expect(p.model).toBe('claude-sonnet-5-5');
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.fallbacks).toBe('default');
    expect(p.output_config.format).toBeDefined();
    expect(p.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
    expect(p.system).toContain('untrusted data');
    expect(p.thinking).toBeUndefined();
    expect(p.temperature).toBeUndefined();
  });

  it('omits printed covers when the receipt has none', async () => {
    const { reader } = fake({ ...good, printed_covers: null });
    expect((await reader.read({ base64: 'A', mime: 'image/jpeg' })).printedCovers).toBeUndefined();
  });

  it('throws typed errors for refusals, bad output and unsupported images', async () => {
    await expect(fake(good, 'refusal').reader.read({ base64: 'A', mime: 'image/png' })).rejects.toMatchObject({ kind: 'refused' });
    await expect(fake({ lines: 'nope' }).reader.read({ base64: 'A', mime: 'image/png' })).rejects.toMatchObject({ kind: 'unparseable' });
    await expect(fake(good).reader.read({ base64: 'A', mime: 'application/pdf' })).rejects.toBeInstanceOf(ReceiptReadError);
    const failing = createReceiptReader({ parse: async () => { throw new Error('429 rate limited'); } });
    await expect(failing.read({ base64: 'A', mime: 'image/png' })).rejects.toMatchObject({ kind: 'api' });
  });

  it('hashes the same image the same way, ignoring whitespace', () => {
    expect(hashImage('AB\nCD')).toBe(hashImage('ABCD'));
    expect(hashImage('ABCD')).not.toBe(hashImage('ABCE'));
  });
});
