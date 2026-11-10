// Backtest: run Covers' rules over real dinners. Pulls every 2025 Food and Beverage payment that drug and device
// companies reported to California cardiovascular clinicians in CMS Open Payments, then asks what Covers' rule
// engine settings would have said, had those meals gone through Covers before the card was used:
//   - P3 meal cap: a meal worth more than $125 per person (the payment divided by the number of payments in it)
//   - P4 annual cap: one company's food and beverage to one clinician passing $2,000 in a year (near = above 80%)
//   - P5 repeat programs: a third meal or more from the same company about the same product in one year
// It uses the engine's own settings and cap logic (DEFAULT_SETTINGS, capState). Real public data, no names stored:
// results keep NPIs and company names only. Run: pnpm --filter @covers/evals backtest
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capState, DEFAULT_SETTINGS, formatCents } from '@covers/engine';
import { createOpenPaymentsClient, dollarsToCents, OPEN_PAYMENTS_PAGE_LIMIT, type Condition, type OpenPaymentRow } from '@covers/integrations';

const YEAR = Number(process.env.BACKTEST_YEAR ?? 2025);
const STATE = process.env.BACKTEST_STATE ?? 'CA';
const SPECIALTY = process.env.BACKTEST_SPECIALTY ?? '%Cardiovascular%';
const here = dirname(fileURLToPath(import.meta.url));
const s = DEFAULT_SETTINGS;

const conditions: Condition[] = [
  { property: 'recipient_state', value: STATE },
  { property: 'nature_of_payment_or_transfer_of_value', value: 'Food and Beverage' },
  { property: 'covered_recipient_specialty_1', value: SPECIALTY, operator: 'like' },
];
const properties = ['record_id', 'covered_recipient_npi', 'applicable_manufacturer_or_applicable_gpo_making_payment_name', 'total_amount_of_payment_usdollars', 'number_of_payments_included_in_total_amount', 'date_of_payment', 'name_of_drug_or_biological_or_device_or_medical_supply_1'];

async function pullAll() {
  const op = createOpenPaymentsClient({ timeoutMs: 60_000 });
  const first = await op.query(YEAR, conditions, { limit: 1, properties });
  const total = first.count ?? 0, rows: OpenPaymentRow[] = [];
  console.log(`${total.toLocaleString()} payments to pull (${STATE}, ${SPECIALTY}, ${YEAR})`);
  for (let offset = 0; offset < total; offset += OPEN_PAYMENTS_PAGE_LIMIT) {
    for (let attempt = 0; ; attempt++) {
      try { rows.push(...(await op.query(YEAR, conditions, { offset, properties })).rows); break; }
      catch (e) { if (attempt >= 3) throw e; await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
    }
    if ((offset / OPEN_PAYMENTS_PAGE_LIMIT) % 10 === 0) process.stdout.write(`  ${rows.length.toLocaleString()}\r`);
  }
  return { rows, total };
}

function analyse(rows: OpenPaymentRow[]) {
  let mealsOver = 0, mealsCents = 0;
  const overExamples: { npi: string; company: string; perPersonCents: number; date: string }[] = [];
  const byPair = new Map<string, { npi: string; company: string; cents: number; meals: number }>();
  const byTopic = new Map<string, number>();
  const doctors = new Set<string>(), companies = new Set<string>();
  for (const r of rows) {
    const npi = r.covered_recipient_npi ?? '', company = r.applicable_manufacturer_or_applicable_gpo_making_payment_name ?? 'Unknown';
    const cents = dollarsToCents(r.total_amount_of_payment_usdollars), n = Math.max(1, Number(r.number_of_payments_included_in_total_amount ?? '1') || 1);
    const perPerson = Math.round(cents / n);
    doctors.add(npi); companies.add(company); mealsCents += cents;
    if (perPerson > s.perPersonCapCents) { mealsOver++; if (overExamples.length < 2000) overExamples.push({ npi, company, perPersonCents: perPerson, date: r.date_of_payment ?? '' }); }
    const pair = `${npi}|${company}`, p = byPair.get(pair) ?? { npi, company, cents: 0, meals: 0 };
    byPair.set(pair, { ...p, cents: p.cents + cents, meals: p.meals + n });
    const product = (r.name_of_drug_or_biological_or_device_or_medical_supply_1 ?? '').trim().toLowerCase();
    if (product) { const k = `${pair}|${product}`; byTopic.set(k, (byTopic.get(k) ?? 0) + n); }
  }
  const pairs = [...byPair.values()];
  const over = pairs.filter((p) => capState(p.cents, s.defaultAnnualCapCents, s) === 'over');
  const near = pairs.filter((p) => capState(p.cents, s.defaultAnnualCapCents, s) === 'near');
  const repeats = [...byTopic.entries()].filter(([, meals]) => meals > s.repeatTopicThreshold);
  const repeatDoctors = new Set(repeats.map(([k]) => k.split('|')[0]));
  const flaggedDoctors = new Set([...overExamples.map((e) => e.npi), ...over.map((p) => p.npi), ...repeatDoctors]);
  overExamples.sort((a, b) => b.perPersonCents - a.perPersonCents);
  return {
    payments: rows.length, doctors: doctors.size, companies: companies.size, totalCents: mealsCents,
    p3: { rule: `Meal over ${formatCents(s.perPersonCapCents)} per person`, meals: mealsOver, share: mealsOver / Math.max(1, rows.length), largest: overExamples.slice(0, 10) },
    p4: { rule: `One company over ${formatCents(s.defaultAnnualCapCents)} to one clinician in a year`, over: over.length, near: near.length, largest: over.sort((a, b) => b.cents - a.cents).slice(0, 10) },
    p5: { rule: `A third meal or more from one company about one product in a year (threshold ${s.repeatTopicThreshold})`, pairs: repeats.length, doctors: repeatDoctors.size },
    flaggedDoctors: flaggedDoctors.size, flaggedShare: flaggedDoctors.size / Math.max(1, doctors.size),
  };
}

const started = Date.now();
const { rows, total } = await pullAll();
const result = analyse(rows);
const out = {
  generatedAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000),
  source: { dataset: `CMS Open Payments, General Payments, program year ${YEAR}`, filter: { state: STATE, nature: 'Food and Beverage', specialty: SPECIALTY }, reported: total, url: 'https://openpaymentsdata.cms.gov' },
  settings: { perPersonCapCents: s.perPersonCapCents, annualCapCents: s.defaultAnnualCapCents, repeatTopicThreshold: s.repeatTopicThreshold },
  ...result,
};
const file = join(here, 'results', `backtest-${YEAR}-${STATE.toLowerCase()}-cardiovascular.json`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\n${result.payments.toLocaleString()} meals, ${result.doctors.toLocaleString()} clinicians, ${result.companies} companies, ${formatCents(result.totalCents)} in ${out.seconds}s`);
console.log(`P3 ${result.p3.meals.toLocaleString()} meals over the per-person cap (${(result.p3.share * 100).toFixed(1)}%)`);
console.log(`P4 ${result.p4.over} company-clinician pairs over the annual cap, ${result.p4.near} near it`);
console.log(`P5 ${result.p5.pairs.toLocaleString()} repeat-program patterns across ${result.p5.doctors.toLocaleString()} clinicians`);
console.log(`Covers would have stopped or sent to compliance meals for ${result.flaggedDoctors.toLocaleString()} clinicians (${(result.flaggedShare * 100).toFixed(1)}%). Wrote ${file}`);
