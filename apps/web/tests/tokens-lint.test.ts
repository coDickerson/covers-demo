// CLAUDE.md rule 8: apps/web uses tokens only. No hard-coded colors or durations in components and pages.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const DIRS = ['app', 'components'];
const BANNED: [string, RegExp][] = [
  ['hex color', /#[0-9a-fA-F]{3,8}\b(?![\w-])/],
  ['rgb/hsl color', /\b(?:rgba?|hsla?|oklch)\(/],
  ['millisecond literal', /\b\d+(?:\.\d+)?ms\b/],
  ['raw cubic-bezier', /cubic-bezier\(/],
];

function files(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
    });
  } catch {
    return [];
  }
}

describe('tokens only', () => {
  for (const file of DIRS.flatMap((d) => files(join(root, d)))) {
    it(relative(root, file), () => {
      const src = readFileSync(file, 'utf8');
      for (const [what, re] of BANNED) expect(src.match(re)?.[0], `${what} in ${relative(root, file)}`).toBeUndefined();
    });
  }
});
