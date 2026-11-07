// CMS NPI Registry (NPPES) client.
// Endpoint and version confirmed against the live API on Nov 7 2026:
//   GET https://npiregistry.cms.hhs.gov/api/?version=2.1&...
// Quirks observed in the real API (see tests/fixtures/nppes):
//   - Errors come back as HTTP 200 with { Errors: [{ description, field, number }] }.
//   - The `version` param is required ("Unsupported Version" otherwise).
//   - `limit` max is 200. Wildcards (`ab*`) need at least two leading characters.
//   - First-name aliasing is ON by default: first_name=john also returns JACK, and records whose
//     *other_names* match (a JACKELYN KELLEY came back for "john smith"). We turn it off so a
//     pick-list only shows people whose registry name matches what was typed.
import { Hcp, type RecipientType } from '@covers/contract';
import { z } from 'zod';
import { isValidNpi } from './npi';
import { recipientTypeForTaxonomy } from './recipient-type';

export const NPPES_BASE_URL = 'https://npiregistry.cms.hhs.gov/api/';
export const NPPES_API_VERSION = '2.1';
export const NPPES_MAX_LIMIT = 200;
const DEFAULT_LIMIT = 20;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;

// ---- Errors ----

export type NppesErrorKind = 'network' | 'timeout' | 'registry' | 'bad_response';

export class NppesError extends Error {
  constructor(
    public readonly kind: NppesErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'NppesError';
  }
}

// ---- Registry response shape (only the fields we read; everything else passes through) ----

const NppesAddress = z.looseObject({ address_purpose: z.string().optional(), state: z.string().optional() });
const NppesTaxonomy = z.looseObject({ code: z.string().optional(), desc: z.string().optional(), primary: z.boolean().optional() });
const NppesRecord = z.looseObject({
  number: z.string(),
  enumeration_type: z.string(),
  basic: z.looseObject({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    credential: z.string().optional(),
  }),
  addresses: z.array(NppesAddress).optional(),
  taxonomies: z.array(NppesTaxonomy).optional(),
});
type NppesRecord = z.infer<typeof NppesRecord>;

const NppesErrorBody = z.object({
  Errors: z.array(z.looseObject({ description: z.string().optional(), field: z.string().optional() })),
});
const NppesResults = z.looseObject({ result_count: z.number(), results: z.array(NppesRecord) });

// ---- Mapping ----

function properCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Registry placeholders for "no value". */
const present = (s: string | undefined): s is string => s !== undefined && s.trim() !== '' && s.trim() !== '--';

/** Maps an individual (NPI-1) registry record to a contract Hcp. Uses only what the registry returned. */
export function toHcp(r: NppesRecord): Hcp | null {
  if (r.enumeration_type !== 'NPI-1') return null;
  const name = [r.basic.first_name, r.basic.last_name].filter(present).map((p) => properCase(p.trim())).join(' ');
  const taxonomies = r.taxonomies ?? [];
  const primary = taxonomies.find((t) => t.primary === true) ?? taxonomies[0];
  const addresses = r.addresses ?? [];
  const address = addresses.find((a) => a.address_purpose === 'LOCATION') ?? addresses[0];
  const recipientType: RecipientType = recipientTypeForTaxonomy(primary?.code);

  const hcp: Hcp = {
    npi: r.number,
    name,
    ...(present(r.basic.credential) ? { credential: r.basic.credential.trim() } : {}),
    ...(present(primary?.desc) ? { specialty: primary.desc.trim() } : {}),
    state: address?.state?.trim() ?? '',
    recipientType,
    source: 'nppes',
  };
  const parsed = Hcp.safeParse(hcp);
  return parsed.success ? parsed.data : null;
}

// ---- Free-text query parsing ----

const STATE_CODES = new Set(
  ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR ' +
    'PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP AA AE AP').split(' '),
);

export type HcpQuery =
  | { kind: 'npi'; npi: string }
  | { kind: 'name'; firstName?: string; lastName: string; state?: string }
  | { kind: 'empty' };

function cleanToken(raw: string): string {
  const t = raw.replace(/[^\p{L}'\-*]/gu, '');
  if (!t.includes('*')) return t;
  // NPPES wildcards need two leading characters and only work as a trailing `*`.
  return /^[\p{L}'-]{2,}\*$/u.test(t) ? t : t.replace(/\*/g, '');
}

const tokens = (s: string) =>
  s
    .split(/\s+/)
    .filter((t, i) => !(i === 0 && /^dr\.?$/i.test(t)))
    .map(cleanToken)
    .filter(Boolean);

const isState = (t: string | undefined) => t !== undefined && STATE_CODES.has(t.toUpperCase());

/**
 * Parses what a rep types into the search box:
 *   "1003000126" → NPI; "Ruiz"; "Ana Ruiz"; "Dr. Ana Ruiz"; "Ruiz, Ana"; with an optional trailing
 *   two-letter state ("Ana Ruiz CA", "Ruiz, Ana TX", "Ana Ruiz, CA").
 * A trailing state code is only taken as a state when there are 3+ tokens or it is typed in
 * capitals, so "John Ma" stays a surname. Everything after the first name is the last name
 * ("Ana de la Cruz").
 */
export function parseHcpQuery(input: string): HcpQuery {
  const raw = input.trim();
  if (/^\d{10}$/.test(raw)) return { kind: 'npi', npi: raw };

  const comma = raw.indexOf(',');
  let first: string | undefined;
  let last: string;
  let state: string | undefined;

  if (comma >= 0) {
    const main = tokens(raw.slice(0, comma));
    const rest = tokens(raw.slice(comma + 1));
    if (rest.length === 1 && isState(rest[0])) {
      state = rest[0]!.toUpperCase();
      ({ first, last } = splitName(main));
    } else {
      if (rest.length >= 2 && isState(rest.at(-1))) state = rest.pop()!.toUpperCase();
      first = rest[0];
      last = main.join(' ');
    }
  } else {
    const main = tokens(raw);
    const tail = main.at(-1);
    if (main.length >= 2 && isState(tail) && (main.length >= 3 || tail === tail!.toUpperCase())) {
      state = main.pop()!.toUpperCase();
    }
    ({ first, last } = splitName(main));
  }

  if (!last) {
    if (!first) return { kind: 'empty' };
    last = first;
    first = undefined;
  }
  return { kind: 'name', ...(first ? { firstName: first } : {}), lastName: last, ...(state ? { state } : {}) };
}

function splitName(t: string[]): { first: string | undefined; last: string } {
  if (t.length === 0) return { first: undefined, last: '' };
  if (t.length === 1) return { first: undefined, last: t[0]! };
  return { first: t[0], last: t.slice(1).join(' ') };
}

// ---- Client ----

export interface NppesCacheEntry {
  value: Hcp[];
  expiresAt: number;
}

/** Anything Map-like works; the default is a per-client in-memory Map. */
export interface NppesCache {
  get(key: string): NppesCacheEntry | undefined;
  set(key: string, entry: NppesCacheEntry): unknown;
  delete(key: string): unknown;
}

export interface NppesClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  cache?: NppesCache;
  /** How long a registry answer is reused. Default 24h. */
  ttlMs?: number;
  /** Per-request timeout. Default 5s. */
  timeoutMs?: number;
  /** Clock, for tests. */
  now?: () => number;
}

export interface NppesSearch {
  firstName?: string;
  lastName?: string;
  state?: string;
  limit?: number;
}

export interface NppesClient {
  lookupNpi(npi: string): Promise<Hcp | null>;
  search(q: NppesSearch): Promise<Hcp[]>;
  /** Free-text entry point used by CoversService.searchHcps: an NPI or a name, optionally with a state. */
  searchHcps(q: string): Promise<Hcp[]>;
}

export function createNppesClient(opts: NppesClientOptions = {}): NppesClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const baseUrl = opts.baseUrl ?? NPPES_BASE_URL;
  const cache: NppesCache = opts.cache ?? new Map<string, NppesCacheEntry>();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = opts.now ?? Date.now;

  async function cached(key: string, params: Record<string, string>): Promise<Hcp[]> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return structuredClone(hit.value);
    if (hit) cache.delete(key);
    const value = await request(params);
    cache.set(key, { value: structuredClone(value), expiresAt: now() + ttlMs });
    return value;
  }

  async function request(params: Record<string, string>): Promise<Hcp[]> {
    const url = new URL(baseUrl);
    url.searchParams.set('version', NPPES_API_VERSION);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await doFetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      } catch (e) {
        if (controller.signal.aborted) throw new NppesError('timeout', `NPPES did not answer within ${timeoutMs} ms`);
        throw new NppesError('network', `NPPES request failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!res.ok) throw new NppesError('registry', `NPPES returned HTTP ${res.status}`, res.status);

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        if (controller.signal.aborted) throw new NppesError('timeout', `NPPES did not answer within ${timeoutMs} ms`);
        throw new NppesError('bad_response', 'NPPES returned a body that is not JSON', res.status);
      }
      const failure = NppesErrorBody.safeParse(body);
      if (failure.success) {
        const msg = failure.data.Errors.map((e) => [e.field, e.description].filter(Boolean).join(': ')).join('; ');
        throw new NppesError('registry', `NPPES rejected the query: ${msg || 'unknown error'}`, res.status);
      }
      const parsed = NppesResults.safeParse(body);
      if (!parsed.success) throw new NppesError('bad_response', 'NPPES returned an unexpected response shape', res.status);
      return parsed.data.results.map(toHcp).filter((h): h is Hcp => h !== null);
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookupNpi(npi: string): Promise<Hcp | null> {
    if (!isValidNpi(npi)) return null;
    const [hcp] = await cached(`npi:${npi}`, { number: npi });
    return hcp ?? null;
  }

  async function search(q: NppesSearch): Promise<Hcp[]> {
    const firstName = q.firstName?.trim() ?? '';
    const lastName = q.lastName?.trim() ?? '';
    if (!firstName && !lastName) return []; // the registry refuses a state-only search
    const state = q.state?.trim().toUpperCase() ?? '';
    const limit = Math.max(1, Math.min(NPPES_MAX_LIMIT, Math.floor(q.limit ?? DEFAULT_LIMIT)));

    const params: Record<string, string> = {};
    if (firstName) params.first_name = firstName;
    if (lastName) params.last_name = lastName;
    if (state) params.state = state;
    params.limit = String(limit);
    params.enumeration_type = 'NPI-1';
    params.use_first_name_alias = 'False';

    const key = `search:${JSON.stringify([firstName.toLowerCase(), lastName.toLowerCase(), state, limit])}`;
    return cached(key, params);
  }

  async function searchHcps(text: string): Promise<Hcp[]> {
    const q = parseHcpQuery(text);
    if (q.kind === 'empty') return [];
    if (q.kind === 'npi') {
      const hcp = await lookupNpi(q.npi);
      return hcp ? [hcp] : [];
    }
    return search(q);
  }

  return { lookupNpi, search, searchHcps };
}
