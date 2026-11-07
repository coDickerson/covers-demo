// CLAUDE.md rule 2: packages/engine does no I/O and calls no model. This test is the lint rule.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = join(import.meta.dirname, '..', 'src');
const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));

describe('engine purity', () => {
  it('has source files to check', () => expect(files.length).toBeGreaterThan(0));

  for (const f of files) {
    const text = readFileSync(join(srcDir, f), 'utf8');
    it(`${f} imports only @covers/contract or relative modules`, () => {
      const specs = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const s of specs) expect(s === '@covers/contract' || s!.startsWith('./'), `import "${s}"`).toBe(true);
    });
    it(`${f} uses no clocks, randomness, network, env or process`, () => {
      for (const banned of ['Date.now', 'new Date', 'Math.random', 'fetch(', 'process.', 'require(', 'globalThis', 'crypto']) {
        expect(text.includes(banned), banned).toBe(false);
      }
    });
  }
});
