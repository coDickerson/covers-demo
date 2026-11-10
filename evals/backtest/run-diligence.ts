// Run the diligence crew on a real dinner: real NPIs, a real venue. Spends Anthropic tokens (and, with APIFY_TOKEN set,
// one Google Maps place on Apify), so it runs only when asked:
//   ANTHROPIC_API_KEY=... [APIFY_TOKEN=...] pnpm --filter @covers/evals diligence -- --venue "Alder & Vine, San Francisco" 1234567893 ...
// With no NPIs given, it takes the three highest-food clinicians from the latest backtest results.
// Writes evals/backtest/results/diligence-<time>.json: the verified report and each agent's tool calls and tokens.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiligenceCrew, createNppesClient, createOpenPaymentsClient, createVenueClient } from '@covers/integrations';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => a !== '--');
const vi = args.indexOf('--venue');
const venue = vi >= 0 ? args.splice(vi, 2)[1]! : 'Alder & Vine, San Francisco';
let npis = args.filter((a) => /^\d{10}$/.test(a));
if (!npis.length) {
  const latest = readdirSync(join(here, 'results')).filter((f) => f.startsWith('backtest-')).sort().at(-1);
  if (!latest) { console.error('Give NPIs, or run the backtest first.'); process.exit(1); }
  const bt = JSON.parse(readFileSync(join(here, 'results', latest), 'utf8')) as { p4: { largest: { npi: string }[] } };
  npis = [...new Set(bt.p4.largest.map((x) => x.npi))].slice(0, 3);
}
if (!process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY.'); process.exit(1); }

const crew = createDiligenceCrew({
  nppes: createNppesClient(),
  payments: createOpenPaymentsClient(),
  venue: process.env.APIFY_TOKEN ? createVenueClient() : undefined,
});
const started = Date.now();
const { report, trace } = await crew.investigate({ venue, npis, estimatedPerPersonCents: 11_000 });
const seconds = Math.round((Date.now() - started) / 1000);
const file = join(here, 'results', `diligence-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, `${JSON.stringify({ venue, npis, seconds, trace, report }, null, 2)}\n`);
console.log(report.summary);
console.log(`\nRisk: ${report.risk.map((r) => `${r.npi} ${r.tier}`).join(', ')}`);
console.log(`Concerns (verified): ${report.concerns.length}. Unverified, to a person: ${report.unverified.length}.`);
console.log(trace.map((t) => `  ${t.agent.padEnd(9)} ${t.toolCalls} tool calls, ${t.inputTokens.toLocaleString()} in / ${t.outputTokens.toLocaleString()} out`).join('\n'));
console.log(`${seconds}s. Wrote ${file}`);
