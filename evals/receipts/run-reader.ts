// Runs the real Claude receipt reader over the eval set and scores it. SPENDS API MONEY (about $0.01 per receipt).
//   pnpm --filter @covers/evals receipts:eval              # all degraded images
//   pnpm --filter @covers/evals receipts:eval -- --limit 3 # first 3 only
// Needs ANTHROPIC_API_KEY. Writes evals/receipts/results/<timestamp>.json with every miss, and prints the
// per-category table in the ProofBundle.receiptEval shape. Failures are reported, never hidden.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReceiptReader } from '@covers/integrations';
import { Manifest } from './schema';
import { aggregate, scoreReceipt } from './score';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const variant = args.includes('--clean') ? 'clean' : 'degraded';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Load .env.local first.');
  process.exit(1);
}

const manifest = Manifest.parse(JSON.parse(readFileSync(join(here, 'out', 'manifest.json'), 'utf8')));
const reader = createReceiptReader(process.env.COVERS_RECEIPT_MODEL ? { model: process.env.COVERS_RECEIPT_MODEL } : {});
const entries = manifest.receipts.slice(0, limit);

const rows = [];
let inTok = 0, outTok = 0;
for (const e of entries) {
  const path = join(here, 'out', e.images[variant]);
  const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const started = Date.now();
  try {
    const r = await reader.read({ base64: readFileSync(path).toString('base64'), mime });
    inTok += r.usage.inputTokens; outTok += r.usage.outputTokens;
    const score = scoreReceipt(e.truth, { id: e.id, planId: 'eval', imageUrl: path, lines: r.lines, totalCents: r.totalCents, ...(r.printedCovers ? { printedCovers: r.printedCovers } : {}) });
    rows.push({ id: e.id, tags: e.tags, ms: Date.now() - started, model: r.model, notes: r.read.notes, score });
    console.log(`${e.id.padEnd(28)} total ${score.totals.pass ? 'ok ' : 'BAD'}  alcohol missed ${score.alcoholMissed.length}  false+ ${score.alcoholFalsePositives.length}`);
  } catch (err) {
    rows.push({ id: e.id, tags: e.tags, error: err instanceof Error ? err.message : String(err) });
    console.log(`${e.id.padEnd(28)} ERROR ${err instanceof Error ? err.message : err}`);
  }
}

const scored = rows.filter((r): r is typeof r & { score: ReturnType<typeof scoreReceipt> } => 'score' in r);
const receiptEval = aggregate(scored.map((r) => r.score));
const summary = {
  model: reader.model, variant, receipts: entries.length, errors: rows.length - scored.length,
  totalsCorrect: scored.filter((r) => r.score.totals.pass).length,
  coversMatch: scored.filter((r) => r.score.covers.match).length,
  alcoholMissed: scored.flatMap((r) => r.score.alcoholMissed.map((m) => ({ receipt: r.id, ...m }))),
  alcoholFalsePositives: scored.flatMap((r) => r.score.alcoholFalsePositives.map((m) => ({ receipt: r.id, ...m }))),
  tokens: { input: inTok, output: outTok },
  receiptEval,
};

const outDir = join(here, 'results');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ summary, rows }, null, 2));
console.table(receiptEval);
console.log(JSON.stringify({ ...summary, receiptEval: undefined }, null, 2));
console.log(`Full results: ${file}`);
