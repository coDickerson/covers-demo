import { describe, expect, it } from 'vitest';
import { createOpenPaymentsClient, dollarsToCents, OPEN_PAYMENTS_GENERAL, OpenPaymentsError, summarizeHistory, type OpenPaymentRow } from '../src/open-payments';

const row = (amount: string, nature = 'Food and Beverage', payer = 'Acme Devices'): OpenPaymentRow => ({
  covered_recipient_npi: '1234567893', covered_recipient_first_name: 'ANA', covered_recipient_last_name: 'REAL',
  covered_recipient_specialty_1: 'Cardiovascular Disease', total_amount_of_payment_usdollars: amount,
  nature_of_payment_or_transfer_of_value: nature, applicable_manufacturer_or_applicable_gpo_making_payment_name: payer,
});

describe('dollarsToCents', () => {
  it('converts decimal strings to integer cents without floats', () => {
    expect(dollarsToCents('20.48')).toBe(2048);
    expect(dollarsToCents('0.1')).toBe(10);
    expect(dollarsToCents('1,234.5')).toBe(123450);
    expect(dollarsToCents('$7')).toBe(700);
    expect(dollarsToCents('12.999')).toBe(1299);
  });
  it('rejects anything that is not an amount', () => {
    expect(() => dollarsToCents('lots')).toThrow(OpenPaymentsError);
  });
});

describe('summarizeHistory', () => {
  it('totals by company and by kind of payment, food separately', () => {
    const h = summarizeHistory('1234567893', 2025, [row('100.00'), row('50.25'), row('1000', 'Consulting Fee', 'Big Pharma'), row('30.00', 'Food and Beverage', 'Big Pharma')], 'https://example');
    expect(h.totalCents).toBe(118025);
    expect(h.foodCents).toBe(18025);
    expect(h.foodPayments).toBe(3);
    expect(h.largestFoodCents).toBe(10000);
    expect(h.payers[0]).toEqual({ name: 'Big Pharma', cents: 103000, payments: 2 });
    expect(h.name).toBe('ANA REAL');
  });
  it('handles a clinician with no reported payments', () => {
    const h = summarizeHistory('1234567893', 2025, [], 'https://example');
    expect(h).toMatchObject({ payments: 0, totalCents: 0, foodCents: 0, name: null });
  });
});

describe('client', () => {
  it('queries the year\'s distribution with conditions and pages until a short page', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get('offset'));
      const n = offset === 0 ? 500 : 3;
      return new Response(JSON.stringify({ count: 503, results: Array.from({ length: n }, () => row('10.00')) }));
    }) as unknown as typeof fetch;
    const h = await createOpenPaymentsClient({ fetchFn }).history('1234567893', 2025);
    expect(h.payments).toBe(503);
    expect(urls).toHaveLength(2);
    const u = new URL(urls[0]!);
    expect(u.pathname).toContain(OPEN_PAYMENTS_GENERAL[2025]);
    expect(u.searchParams.get('conditions[0][property]')).toBe('covered_recipient_npi');
    expect(u.searchParams.get('conditions[0][value]')).toBe('1234567893');
    expect(u.searchParams.get('limit')).toBe('500');
  });
  it('rejects a year with no dataset and a malformed response', async () => {
    const bad = (async () => new Response(JSON.stringify({ message: 'nope' }), { status: 400 })) as unknown as typeof fetch;
    await expect(createOpenPaymentsClient({ fetchFn: bad }).history('1234567893', 2025)).rejects.toThrow(OpenPaymentsError);
    await expect(createOpenPaymentsClient({ fetchFn: bad }).history('1234567893', 1999)).rejects.toThrow(/No Open Payments dataset/);
  });
});
