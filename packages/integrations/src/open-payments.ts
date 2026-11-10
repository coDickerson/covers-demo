// CMS Open Payments client: what drug and device companies reported paying each clinician, from the federal dataset.
// Endpoint confirmed against the live API on Nov 10 2026:
//   GET https://openpaymentsdata.cms.gov/api/1/datastore/query/{distributionId}?conditions[...]&limit=...
// Quirks observed:
//   - Each program year is a separate dataset; the query takes the year's *distribution* id, not the dataset id.
//   - `limit` max is 500 (anything larger fails with "JSON Schema validation failed"); page with `offset`.
//   - Amounts are decimal strings ("20.48"); we convert to integer cents without going through floats.
//   - Filters are `conditions[i][property|value|operator]`; `like` takes % wildcards.
// It only reads. Covers uses it as facts (a doctor's real history), never as a decision.
import { z } from 'zod';

export const OPEN_PAYMENTS_BASE_URL = 'https://openpaymentsdata.cms.gov/api/1/datastore/query';
/** General Payments distribution ids by program year (CMS publishes each year the following June). */
export const OPEN_PAYMENTS_GENERAL: Record<number, string> = {
  2025: 'a25e7a31-503f-5a02-b0fc-b8c52275d1d8',
  2024: '93b512a7-7f65-539b-9e20-bbcc535750bd',
  2023: 'b7678d15-1cac-51b6-9c8f-4b36d4f8f21f',
};
export const OPEN_PAYMENTS_LATEST_YEAR = 2025;
export const OPEN_PAYMENTS_PAGE_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 20_000;

export class OpenPaymentsError extends Error {
  constructor(public readonly kind: 'network' | 'timeout' | 'bad_response' | 'unknown_year', message: string) {
    super(message);
    this.name = 'OpenPaymentsError';
  }
}

/** One payment row, only the columns Covers reads. */
export const OpenPaymentRow = z.looseObject({
  record_id: z.string().optional(),
  covered_recipient_npi: z.string().optional(),
  covered_recipient_first_name: z.string().optional(),
  covered_recipient_last_name: z.string().optional(),
  covered_recipient_specialty_1: z.string().optional(),
  recipient_city: z.string().optional(),
  recipient_state: z.string().optional(),
  applicable_manufacturer_or_applicable_gpo_making_payment_name: z.string().optional(),
  total_amount_of_payment_usdollars: z.string(),
  number_of_payments_included_in_total_amount: z.string().optional(),
  nature_of_payment_or_transfer_of_value: z.string().optional(),
  date_of_payment: z.string().optional(),
  name_of_drug_or_biological_or_device_or_medical_supply_1: z.string().optional(),
});
export type OpenPaymentRow = z.infer<typeof OpenPaymentRow>;
const QueryResponse = z.looseObject({ results: z.array(OpenPaymentRow), count: z.number().optional() });

/** "20.48" -> 2048, "1,234.5" -> 123450. Integer cents, no float arithmetic. */
export function dollarsToCents(s: string): number {
  const clean = s.replace(/[$,\s]/g, '');
  const m = /^(-?)(\d*)(?:\.(\d{0,2})\d*)?$/.exec(clean);
  if (!m) throw new OpenPaymentsError('bad_response', `Not a dollar amount: ${s}`);
  const cents = Number(m[2] || '0') * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -cents : cents;
}

export type Condition = { property: keyof OpenPaymentRow & string; value: string; operator?: '=' | 'like' | '>' | '<' };

export type OpenPaymentsClient = {
  query: (year: number, conditions: Condition[], page?: { limit?: number; offset?: number; properties?: string[] }) => Promise<{ rows: OpenPaymentRow[]; count: number | null }>;
  history: (npi: string, year?: number) => Promise<PaymentHistory>;
};

export const PaymentHistory = z.object({
  npi: z.string(),
  year: z.number().int(),
  payments: z.number().int().describe('Number of reported payment records'),
  totalCents: z.number().int(),
  foodCents: z.number().int().describe('Food and Beverage only'),
  foodPayments: z.number().int(),
  largestFoodCents: z.number().int(),
  payers: z.array(z.object({ name: z.string(), cents: z.number().int(), payments: z.number().int() })).describe('Top companies by amount'),
  natures: z.array(z.object({ nature: z.string(), cents: z.number().int() })),
  name: z.string().nullable(),
  specialty: z.string().nullable(),
  source: z.string().describe('The query URL, so anyone can check the numbers'),
});
export type PaymentHistory = z.infer<typeof PaymentHistory>;

/** Summarise one doctor's rows into totals by company and by kind of payment. */
export function summarizeHistory(npi: string, year: number, rows: OpenPaymentRow[], source: string): PaymentHistory {
  const payers = new Map<string, { cents: number; payments: number }>(), natures = new Map<string, number>();
  let total = 0, food = 0, foodN = 0, largestFood = 0;
  for (const r of rows) {
    const c = dollarsToCents(r.total_amount_of_payment_usdollars), payer = r.applicable_manufacturer_or_applicable_gpo_making_payment_name ?? 'Unknown', nature = r.nature_of_payment_or_transfer_of_value ?? 'Unknown';
    total += c;
    const p = payers.get(payer) ?? { cents: 0, payments: 0 };
    payers.set(payer, { cents: p.cents + c, payments: p.payments + 1 });
    natures.set(nature, (natures.get(nature) ?? 0) + c);
    if (nature === 'Food and Beverage') { food += c; foodN++; largestFood = Math.max(largestFood, c); }
  }
  const first = rows[0];
  return PaymentHistory.parse({
    npi, year, payments: rows.length, totalCents: total, foodCents: food, foodPayments: foodN, largestFoodCents: largestFood,
    payers: [...payers].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cents - a.cents).slice(0, 5),
    natures: [...natures].map(([nature, cents]) => ({ nature, cents })).sort((a, b) => b.cents - a.cents),
    name: first ? [first.covered_recipient_first_name, first.covered_recipient_last_name].filter(Boolean).join(' ') || null : null,
    specialty: first?.covered_recipient_specialty_1 || null,
    source,
  });
}

export function createOpenPaymentsClient(opts: { fetchFn?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {}): OpenPaymentsClient {
  const fetchFn = opts.fetchFn ?? fetch, base = opts.baseUrl ?? OPEN_PAYMENTS_BASE_URL, timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const urlFor = (year: number, conditions: Condition[], page: { limit?: number; offset?: number; properties?: string[] } = {}) => {
    const dist = OPEN_PAYMENTS_GENERAL[year];
    if (!dist) throw new OpenPaymentsError('unknown_year', `No Open Payments dataset for ${year}`);
    const q = new URLSearchParams({ limit: String(Math.min(page.limit ?? OPEN_PAYMENTS_PAGE_LIMIT, OPEN_PAYMENTS_PAGE_LIMIT)), offset: String(page.offset ?? 0), count: 'true', schema: 'false' });
    conditions.forEach((c, i) => { q.set(`conditions[${i}][property]`, c.property); q.set(`conditions[${i}][value]`, c.value); q.set(`conditions[${i}][operator]`, c.operator ?? '='); });
    (page.properties ?? []).forEach((p, i) => q.set(`properties[${i}]`, p));
    return `${base}/${dist}?${q}`;
  };

  const query: OpenPaymentsClient['query'] = async (year, conditions, page = {}) => {
    const url = urlFor(year, conditions, page);
    let res: Response;
    try { res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { throw new OpenPaymentsError(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network', `Open Payments unreachable: ${String(e)}`); }
    const body: unknown = await res.json().catch(() => null);
    const parsed = QueryResponse.safeParse(body);
    if (!res.ok || !parsed.success) throw new OpenPaymentsError('bad_response', `Open Payments returned ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
    return { rows: parsed.data.results, count: parsed.data.count ?? null };
  };

  const history: OpenPaymentsClient['history'] = async (npi, year = OPEN_PAYMENTS_LATEST_YEAR) => {
    const cond: Condition[] = [{ property: 'covered_recipient_npi', value: npi }];
    const rows: OpenPaymentRow[] = [];
    for (let offset = 0; offset < 5000; offset += OPEN_PAYMENTS_PAGE_LIMIT) {
      const page = await query(year, cond, { offset });
      rows.push(...page.rows);
      if (page.rows.length < OPEN_PAYMENTS_PAGE_LIMIT) break;
    }
    return summarizeHistory(npi, year, rows, urlFor(year, cond, { limit: 50 }));
  };

  return { query, history };
}
