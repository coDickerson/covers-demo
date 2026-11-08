// Live smoke test against the real CMS NPI Registry. Off by default; run with:
//   NPPES_LIVE=1 pnpm --filter @covers/integrations test
import { describe, expect, it } from 'vitest';
import { Hcp } from '@covers/contract';
import { createNppesClient } from '../src/nppes';

const live = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NPPES_LIVE === '1';

describe.skipIf(!live)('NPPES live smoke', () => {
  const client = createNppesClient({ timeoutMs: 15_000 });

  it('looks up a known NPI', async () => {
    const hcp = await client.lookupNpi('1003000126');
    expect(hcp).not.toBeNull();
    expect(Hcp.parse(hcp)).toMatchObject({ npi: '1003000126', source: 'nppes', recipientType: 'physician' });
  });

  it('searches by free text and returns a pick-list of individuals', async () => {
    const hcps = await client.searchHcps('John Smith CA');
    expect(hcps.length).toBeGreaterThan(1);
    for (const h of hcps) expect(Hcp.parse(h).source).toBe('nppes');
  });
});
