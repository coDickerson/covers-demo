import { describe, expect, it } from 'vitest';
import { Hcp } from '@covers/contract';
import { createNppesClient, NppesError, parseHcpQuery, type NppesCacheEntry } from '../src/nppes';
import lookupMd from './fixtures/nppes/lookup-1003000126.json';
import lookupOrg from './fixtures/nppes/lookup-1255498432-org.json';
import searchJohnSmith from './fixtures/nppes/search-john-smith-ca.json';
import errorWildcard from './fixtures/nppes/error-wildcard.json';

const EMPTY = { result_count: 0, results: [] };

type FakeFetch = typeof fetch & { calls: URL[] };

/** A fetch that answers every call with the next queued body (the last one repeats). */
type Responder = (url: URL, init?: RequestInit) => Promise<Response>;

function fakeFetch(...bodies: Array<Responder | { [k: string]: unknown }>): FakeFetch {
  const calls: URL[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    const body = bodies[Math.min(calls.length - 1, bodies.length - 1)];
    if (typeof body === 'function') return body(url, init);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as FakeFetch;
  fn.calls = calls;
  return fn;
}

const params = (url: URL | undefined) => Object.fromEntries(url?.searchParams ?? []);

describe('lookupNpi', () => {
  it('maps a real NPI-1 record to a contract Hcp', async () => {
    const f = fakeFetch(lookupMd);
    const hcp = await createNppesClient({ fetch: f }).lookupNpi('1003000126');

    expect(hcp).toEqual({
      npi: '1003000126',
      name: 'Ardalan Enkeshafi',
      credential: 'M.D.',
      specialty: 'Hospitalist', // the primary taxonomy, not the first one listed
      state: 'MD', // the primary LOCATION address, not the taxonomy license state (DC) or practiceLocations
      recipientType: 'physician',
      source: 'nppes',
    });
    expect(Hcp.parse(hcp)).toEqual(hcp);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.origin + f.calls[0]!.pathname).toBe('https://npiregistry.cms.hhs.gov/api/');
    expect(params(f.calls[0])).toEqual({ version: '2.1', number: '1003000126' });
  });

  it('returns null for an organization (NPI-2)', async () => {
    const hcp = await createNppesClient({ fetch: fakeFetch(lookupOrg) }).lookupNpi('1255498432');
    expect(hcp).toBeNull();
  });

  it('returns null when the registry has no record', async () => {
    const hcp = await createNppesClient({ fetch: fakeFetch(EMPTY) }).lookupNpi('1234567893');
    expect(hcp).toBeNull();
  });

  it('returns null without calling the registry when the check digit is wrong', async () => {
    const f = fakeFetch(lookupMd);
    const client = createNppesClient({ fetch: f });
    expect(await client.lookupNpi('1003000127')).toBeNull();
    expect(await client.lookupNpi('12345')).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it('uses an injected baseUrl', async () => {
    const f = fakeFetch(lookupMd);
    await createNppesClient({ fetch: f, baseUrl: 'https://example.test/nppes/' }).lookupNpi('1003000126');
    expect(f.calls[0]?.href.startsWith('https://example.test/nppes/?')).toBe(true);
  });
});

describe('search', () => {
  it('returns every individual match as a list, in registry order, without collapsing', async () => {
    const f = fakeFetch(searchJohnSmith);
    const hcps = await createNppesClient({ fetch: f }).search({ firstName: 'John', lastName: 'Smith', state: 'CA', limit: 5 });

    expect(hcps.map((h) => [h.npi, h.name, h.credential, h.specialty, h.state, h.recipientType])).toEqual([
      ['1033219522', 'John Smith', 'D.D.S.', 'Dentist, General Practice', 'CA', 'physician'],
      ['1265573299', 'John Smith', 'Ph.D., LCSW', 'Social Worker, Clinical', 'CA', 'non_hcp'],
      ['1821010398', 'John Smith', 'P.A-C', 'Physician Assistant', 'CA', 'physician_assistant'],
      ['1093230252', 'John Smith', undefined, 'Rehabilitation Practitioner', 'CA', 'non_hcp'],
      // The registry really returns this odd credential; we pass it through, never "fix" it.
      ['1952127466', 'John Smith', 'R1585691024', 'Counselor, Addiction (Substance Use Disorder)', 'CA', 'non_hcp'],
    ]);
    for (const h of hcps) {
      expect(Hcp.parse(h)).toEqual(h);
      expect(h.source).toBe('nppes');
    }
    // No invented fields: a record without a credential has no credential key at all.
    expect('credential' in hcps[3]!).toBe(false);
  });

  it('asks only for individuals, with first-name aliasing off', async () => {
    const f = fakeFetch(searchJohnSmith);
    await createNppesClient({ fetch: f }).search({ firstName: 'John', lastName: 'Smith', state: 'ca', limit: 5 });
    expect(params(f.calls[0])).toEqual({
      version: '2.1',
      first_name: 'John',
      last_name: 'Smith',
      state: 'CA',
      limit: '5',
      enumeration_type: 'NPI-1',
      use_first_name_alias: 'False',
    });
  });

  it('drops organizations even if the registry returns them', async () => {
    const hcps = await createNppesClient({ fetch: fakeFetch(lookupOrg) }).search({ lastName: 'Anything' });
    expect(hcps).toEqual([]);
  });

  it('returns [] for no matches', async () => {
    expect(await createNppesClient({ fetch: fakeFetch(EMPTY) }).search({ lastName: 'Zzyzx' })).toEqual([]);
  });

  it('returns [] without a request when there is no name to search', async () => {
    const f = fakeFetch(searchJohnSmith);
    const client = createNppesClient({ fetch: f });
    expect(await client.search({})).toEqual([]);
    expect(await client.search({ state: 'CA' })).toEqual([]);
    expect(await client.search({ lastName: '  ' })).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });

  it('clamps limit to the registry maximum of 200 and defaults to 20', async () => {
    const f = fakeFetch(EMPTY);
    const client = createNppesClient({ fetch: f });
    await client.search({ lastName: 'Smith', limit: 1000 });
    await client.search({ lastName: 'Jones' });
    expect(f.calls[0]?.searchParams.get('limit')).toBe('200');
    expect(f.calls[1]?.searchParams.get('limit')).toBe('20');
  });
});

describe('errors', () => {
  it('turns a registry Errors body (HTTP 200) into NppesError kind "registry"', async () => {
    const err = await createNppesClient({ fetch: fakeFetch(errorWildcard) })
      .search({ lastName: 'Smith' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NppesError);
    expect((err as NppesError).kind).toBe('registry');
    expect((err as NppesError).message).toContain('Wildcards require at least two leading characters');
  });

  it('turns a non-2xx status into NppesError kind "registry"', async () => {
    const f = fakeFetch(async () => new Response('Service Unavailable', { status: 503 }));
    const err = await createNppesClient({ fetch: f }).lookupNpi('1003000126').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NppesError);
    expect((err as NppesError).kind).toBe('registry');
    expect((err as NppesError).status).toBe(503);
  });

  it('turns a failed fetch into NppesError kind "network"', async () => {
    const f = fakeFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await createNppesClient({ fetch: f }).lookupNpi('1003000126').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NppesError);
    expect((err as NppesError).kind).toBe('network');
  });

  it('turns an unexpected body into NppesError kind "bad_response"', async () => {
    const notJson = fakeFetch(async () => new Response('<html>', { status: 200 }));
    const wrongShape = fakeFetch({ results: 'nope' });
    for (const f of [notJson, wrongShape]) {
      const err = await createNppesClient({ fetch: f }).lookupNpi('1003000126').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NppesError);
      expect((err as NppesError).kind).toBe('bad_response');
    }
  });

  it('times out with NppesError kind "timeout" and aborts the request', async () => {
    let aborted = false;
    const hang = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    const started = Date.now();
    const err = await createNppesClient({ fetch: hang, timeoutMs: 30 }).lookupNpi('1003000126').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NppesError);
    expect((err as NppesError).kind).toBe('timeout');
    expect(aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('cache', () => {
  it('serves a repeated lookup from memory', async () => {
    const f = fakeFetch(lookupMd);
    const client = createNppesClient({ fetch: f });
    const a = await client.lookupNpi('1003000126');
    const b = await client.lookupNpi('1003000126');
    expect(b).toEqual(a);
    expect(f.calls).toHaveLength(1);
  });

  it('normalizes the search key (case, whitespace)', async () => {
    const f = fakeFetch(searchJohnSmith);
    const client = createNppesClient({ fetch: f });
    await client.search({ firstName: 'John', lastName: 'SMITH ', state: 'ca', limit: 5 });
    await client.search({ firstName: ' john', lastName: 'smith', state: 'CA', limit: 5 });
    expect(f.calls).toHaveLength(1);
  });

  it('caches empty results too', async () => {
    const f = fakeFetch(EMPTY);
    const client = createNppesClient({ fetch: f });
    expect(await client.lookupNpi('1234567893')).toBeNull();
    expect(await client.lookupNpi('1234567893')).toBeNull();
    expect(f.calls).toHaveLength(1);
  });

  it('refetches after the default 24h TTL, not before', async () => {
    let t = 1_000_000;
    const f = fakeFetch(lookupMd);
    const client = createNppesClient({ fetch: f, now: () => t });
    await client.lookupNpi('1003000126');
    t += 24 * 60 * 60 * 1000 - 1;
    await client.lookupNpi('1003000126');
    expect(f.calls).toHaveLength(1);
    t += 2;
    await client.lookupNpi('1003000126');
    expect(f.calls).toHaveLength(2);
  });

  it('honours an injected ttlMs', async () => {
    let t = 0;
    const f = fakeFetch(searchJohnSmith);
    const client = createNppesClient({ fetch: f, now: () => t, ttlMs: 1000 });
    await client.search({ lastName: 'Smith' });
    t = 1001;
    await client.search({ lastName: 'Smith' });
    expect(f.calls).toHaveLength(2);
  });

  it('does not cache failures', async () => {
    const f = fakeFetch(async () => new Response('', { status: 500 }), lookupMd);
    const client = createNppesClient({ fetch: f });
    await expect(client.lookupNpi('1003000126')).rejects.toBeInstanceOf(NppesError);
    expect(await client.lookupNpi('1003000126')).not.toBeNull();
    expect(f.calls).toHaveLength(2);
  });

  it('uses an injected cache store holding only mapped registry data', async () => {
    const cache = new Map<string, NppesCacheEntry>();
    const client = createNppesClient({ fetch: fakeFetch(lookupMd), cache });
    await client.lookupNpi('1003000126');
    expect(cache.size).toBe(1);
    const [entry] = [...cache.values()];
    expect(entry?.value).toEqual([expect.objectContaining({ npi: '1003000126', source: 'nppes' })]);
  });

  it('hands out copies, so callers cannot corrupt the cache', async () => {
    const client = createNppesClient({ fetch: fakeFetch(lookupMd) });
    const a = await client.lookupNpi('1003000126');
    a!.name = 'Mutated';
    expect((await client.lookupNpi('1003000126'))?.name).toBe('Ardalan Enkeshafi');
  });
});

describe('searchHcps (free text)', () => {
  it('treats a 10-digit string as an NPI lookup', async () => {
    const f = fakeFetch(lookupMd);
    const hcps = await createNppesClient({ fetch: f }).searchHcps(' 1003000126 ');
    expect(hcps.map((h) => h.npi)).toEqual(['1003000126']);
    expect(params(f.calls[0])).toEqual({ version: '2.1', number: '1003000126' });
  });

  it('returns [] for an NPI the registry does not have, or an organization', async () => {
    expect(await createNppesClient({ fetch: fakeFetch(EMPTY) }).searchHcps('1234567893')).toEqual([]);
    expect(await createNppesClient({ fetch: fakeFetch(lookupOrg) }).searchHcps('1255498432')).toEqual([]);
  });

  it('searches by name and state', async () => {
    const f = fakeFetch(searchJohnSmith);
    const hcps = await createNppesClient({ fetch: f }).searchHcps('Dr. John Smith CA');
    expect(hcps).toHaveLength(5);
    expect(params(f.calls[0])).toMatchObject({ first_name: 'John', last_name: 'Smith', state: 'CA' });
  });

  it('returns [] without a request for blank or unparseable input', async () => {
    const f = fakeFetch(searchJohnSmith);
    const client = createNppesClient({ fetch: f });
    expect(await client.searchHcps('')).toEqual([]);
    expect(await client.searchHcps('   ')).toEqual([]);
    expect(await client.searchHcps('Dr.')).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });
});

describe('parseHcpQuery', () => {
  it.each([
    ['1003000126', { kind: 'npi', npi: '1003000126' }],
    ['  1003000126  ', { kind: 'npi', npi: '1003000126' }],
    ['Ruiz', { kind: 'name', lastName: 'Ruiz' }],
    ['Ana Ruiz', { kind: 'name', firstName: 'Ana', lastName: 'Ruiz' }],
    ['Dr. Ana Ruiz', { kind: 'name', firstName: 'Ana', lastName: 'Ruiz' }],
    ['dr ana ruiz', { kind: 'name', firstName: 'ana', lastName: 'ruiz' }],
    ['Ana Ruiz CA', { kind: 'name', firstName: 'Ana', lastName: 'Ruiz', state: 'CA' }],
    ['ana ruiz ca', { kind: 'name', firstName: 'ana', lastName: 'ruiz', state: 'CA' }],
    ['Dr. Ana Ruiz, CA', { kind: 'name', firstName: 'Ana', lastName: 'Ruiz', state: 'CA' }],
    ['Ruiz CA', { kind: 'name', lastName: 'Ruiz', state: 'CA' }],
    // Two tokens, lowercase second token: a surname that happens to be a state code stays a surname.
    ['John Ma', { kind: 'name', firstName: 'John', lastName: 'Ma' }],
    ['Ana de la Cruz', { kind: 'name', firstName: 'Ana', lastName: 'de la Cruz' }],
    ['Ruiz, Ana', { kind: 'name', firstName: 'Ana', lastName: 'Ruiz' }],
    ['Ruiz, Ana TX', { kind: 'name', firstName: 'Ana', lastName: 'Ruiz', state: 'TX' }],
    ["Mary O'Brien-Smith", { kind: 'name', firstName: 'Mary', lastName: "O'Brien-Smith" }],
    // NPPES wildcards need two leading characters; otherwise the * is dropped.
    ['Ana Ru*', { kind: 'name', firstName: 'Ana', lastName: 'Ru*' }],
    ['A* Ruiz', { kind: 'name', firstName: 'A', lastName: 'Ruiz' }],
    ['', { kind: 'empty' }],
    ['Dr.', { kind: 'empty' }],
    ['CA', { kind: 'name', lastName: 'CA' }],
    ['123', { kind: 'empty' }],
  ])('%j → %j', (q, expected) => {
    expect(parseHcpQuery(q)).toEqual(expected);
  });
});
