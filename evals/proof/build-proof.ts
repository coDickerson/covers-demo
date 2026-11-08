// Writes proof/proof.json, the data behind the judge-facing /proof page. No model or Ramp calls.
//   DATABASE_URL=postgres://localhost:5433/covers_test pnpm --filter @covers/evals proof
// - receiptEval: the latest reader eval in evals/receipts/results (per category, labelled by eval set)
// - breakIt: all 15 attacks run through the real LiveService path; failures are published, not hidden
// - realVsSimulated: what is real in this build and how we know
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProofBundle } from '@covers/contract';
import { BREAK_IT_CASES, connect, LiveService, migrate } from '@covers/live-service';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL (a local Postgres is fine).'); process.exit(1); }

// ---- Receipt eval: newest results file ----
const resultsDir = join(here, '..', 'receipts', 'results');
const latest = readdirSync(resultsDir).filter((f) => f.endsWith('.json')).sort().at(-1);
if (!latest) { console.error('No reader eval results yet: run receipts:eval first.'); process.exit(1); }
const evalRun = JSON.parse(readFileSync(join(resultsDir, latest), 'utf8')).summary as {
  model: string; receipts: number; totalsCorrect: number; alcoholMissed: unknown[];
  receiptEval: { cls: string; precision: number; recall: number; n: number }[];
};
const round = (x: number) => Math.round(x * 1000) / 1000;
const receiptEval = evalRun.receiptEval.filter((r) => r.n > 0)
  .map((r) => ({ cls: `${r.cls} (synthetic, ${evalRun.receipts} receipts)`, precision: round(r.precision), recall: round(r.recall), n: r.n }));

// ---- Break-It: real path, fresh session per case ----
const sql = connect(url);
await migrate(sql);
const svc = new LiveService({ sql });
const breakIt = [];
for (const c of BREAK_IT_CASES) {
  const res = await svc.runBreakIt({ sessionId: `proof-${Date.now()}-${c.id}`, actorId: 'rep-jordan-lee' }, c.id);
  breakIt.push({ id: c.id, attack: c.attack, expected: c.expected, passed: res.passed, note: res.note });
  console.log(`#${String(c.id).padStart(2)} ${res.passed ? 'pass' : 'FAIL'}  ${c.attack}`);
}
await sql.end();

const realVsSimulated = [
  { piece: 'Rule engine (P1–P6)', status: 'Real', howWeKnow: '72 tests incl. property tests; deterministic, no model in the decision path' },
  { piece: 'Doctor identity (NPI registry)', status: 'Real', howWeKnow: 'Live CMS NPPES API v2.1; real doctors shown with zero spend' },
  { piece: 'Seed doctors and spend history', status: 'Simulated', howWeKnow: 'Fictional; fake NPIs start with 9 and fail the NPI check digit' },
  { piece: 'Ramp fund (limit, lock, unlock)', status: 'Real (sandbox)', howWeKnow: 'Ramp sandbox API; visible in Ramp’s own UI and activity log' },
  { piece: 'Dinner card charge', status: 'Simulated', howWeKnow: 'Created with Ramp’s sandbox demo tool; no real card swipe' },
  { piece: 'Receipt + memo written to Ramp', status: 'Real (sandbox)', howWeKnow: 'Ramp sandbox API; receipt and memo read back on the transaction' },
  { piece: 'Receipt reading', status: 'Real', howWeKnow: `${evalRun.model}; ${evalRun.totalsCorrect}/${evalRun.receipts} totals correct on synthetic receipts, ${evalRun.alcoholMissed.length} alcohol lines missed; real receipts pending` },
  { piece: 'Eval receipts', status: 'Simulated', howWeKnow: 'Rendered and degraded synthetically with exact ground truth; real redacted receipts to be added' },
  { piece: 'Open Payments rows', status: 'Drafted, not filed', howWeKnow: 'Program-year 2026 CMS thresholds; humans file' },
  { piece: 'Pack lab: rules applied', status: 'Real', howWeKnow: 'Compiled rules run in the deterministic engine; conflicts found by code; Break-It #15' },
  { piece: 'Pack lab: English → rule', status: 'Real', howWeKnow: 'claude-opus-5-5 compiled "Weekend dinners need manager approval" on Nov 7; its 4 test cases and the code checks all passed on the engine' },
];

const proof = ProofBundle.parse({ receiptEval, breakIt, realVsSimulated, generatedAt: new Date().toISOString() });
mkdirSync(join(root, 'proof'), { recursive: true });
writeFileSync(join(root, 'proof', 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
console.log(`Break-It ${breakIt.filter((b) => b.passed).length}/${breakIt.length} passed. Wrote proof/proof.json (eval: ${latest}).`);
