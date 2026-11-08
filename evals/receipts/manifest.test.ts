// Checks the committed eval set (out/) against the specs. Rebuild with `pnpm --filter @covers/evals receipts:build`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SEED, degradeParams } from './degrade';
import { Manifest } from './schema';
import { SPECS } from './specs';
import { groundTruth } from './truth';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');

describe('manifest.json', () => {
  const manifest = Manifest.parse(JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')));

  it('is in sync with specs (rebuild if this fails)', () => {
    expect(manifest.seed).toBe(SEED);
    expect(manifest.receipts.map((r) => r.id)).toEqual(SPECS.map((s) => s.id));
    for (const spec of SPECS) {
      const e = manifest.receipts.find((r) => r.id === spec.id)!;
      expect(e.truth, spec.id).toEqual(groundTruth(spec));
      expect(e.tags).toEqual(spec.tags);
      expect(e.degrade).toEqual(degradeParams(`${SEED}:${spec.id}`, spec.degrade));
    }
  });

  it('every listed image exists', () => {
    for (const e of manifest.receipts) {
      expect(existsSync(join(OUT, e.images.clean)), e.images.clean).toBe(true);
      expect(existsSync(join(OUT, e.images.degraded)), e.images.degraded).toBe(true);
    }
  });
});
