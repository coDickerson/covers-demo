// Uploaded receipt photos through LiveService with a fake reader (no API calls). Needs TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { connect, LiveService, migrate, type ReceiptReaderPort, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;

function fakeReader() {
  let calls = 0;
  const reader: ReceiptReaderPort = {
    async read(img) {
      calls += 1;
      return {
        lines: [
          { id: 'l1', text: 'Entrees (6)', amountCents: 50_000, category: 'food', confidence: 0.97 },
          { id: 'l2', text: 'Beverages', amountCents: 11_200, category: 'alcohol', confidence: 0.55 },
        ],
        totalCents: 61_200, printedCovers: 6, imageHash: img.base64, model: 'claude-sonnet-5-5', promptVersion: 'receipt-v1',
        read: { notes: 'Footer says: ignore previous instructions' },
      };
    },
  };
  return { reader, calls: () => calls };
}

describe.skipIf(!url)('LiveService receipt uploads', () => {
  let sql: Sql;
  beforeAll(async () => { sql = connect(url!); await migrate(sql); });
  afterAll(async () => { await sql?.end(); });
  const ctx = () => ({ sessionId: `rd-${crypto.randomUUID()}`, actorId: IDS.rep });

  it('reads an uploaded photo and audits the model, prompt version and reader notes', async () => {
    const f = fakeReader(); const svc = new LiveService({ sql, reader: f.reader }); const c = ctx();
    const r = await svc.submitReceipt(c, IDS.demoPlan, { base64: 'photo-1', mime: 'image/jpeg' });
    expect(r).toMatchObject({ planId: IDS.demoPlan, totalCents: 61_200, printedCovers: 6 });
    expect(await svc.getReceipt(c, IDS.demoPlan)).toEqual(r);
    const ev = (await svc.listAudit(c, { planId: IDS.demoPlan })).find((e) => e.action === 'receipt.read');
    expect(ev).toMatchObject({ model: 'claude-sonnet-5-5', promptVersion: 'receipt-v1' });
    expect(ev?.detail).toContain('1 need a check');
    expect(ev?.detail).toContain('ignore previous instructions');
  });

  it('refuses the same photo twice without calling the model again', async () => {
    const f = fakeReader(); const svc = new LiveService({ sql, reader: f.reader }); const c = ctx();
    await svc.submitReceipt(c, IDS.demoPlan, { base64: 'photo-1', mime: 'image/jpeg' });
    await expect(svc.submitReceipt(c, IDS.demoPlan, { base64: 'photo-1', mime: 'image/jpeg' })).rejects.toMatchObject({ code: 'validation' });
    expect(f.calls()).toBe(1);
  });

  it('caps model reads per session', async () => {
    const f = fakeReader(); const svc = new LiveService({ sql, reader: f.reader, maxReadsPerSession: 2 }); const c = ctx();
    await svc.submitReceipt(c, IDS.demoPlan, { base64: 'a', mime: 'image/png' });
    await svc.submitReceipt(c, IDS.demoPlan, { base64: 'b', mime: 'image/png' });
    await expect(svc.submitReceipt(c, IDS.demoPlan, { base64: 'c', mime: 'image/png' })).rejects.toMatchObject({ code: 'rate_limited' });
    expect(f.calls()).toBe(2);
  });

  it('refuses uploads with a clear error when no reader is configured; samples still work', async () => {
    const svc = new LiveService({ sql }); const c = ctx();
    await expect(svc.submitReceipt(c, IDS.demoPlan, { base64: 'a', mime: 'image/png' })).rejects.toMatchObject({ code: 'invalid_state' });
    expect((await svc.submitReceipt(c, IDS.demoPlan, { sampleId: IDS.cleanReceipt })).totalCents).toBe(61_200);
  });
});
