import type { CapStatus, CheckResult, CheckSubject, Hcp } from '@covers/contract';
import { cite, packOf, type RuleId } from './citations';
import { dayNumber } from './dates';
import type { AttendanceHistory, EngineSettings, LedgerEntry, PackId } from './types';

const subjectKey = (s: CheckSubject) => (s.kind === 'plan' ? 'plan' : s.kind === 'hcp' ? `hcp:${s.npi}` : `line:${s.lineId}`);

/** Collects check results for enabled packs only. Ids are `<ruleId>:<subject>`, stable across runs. */
export class Checks {
  readonly list: CheckResult[] = [];
  constructor(private readonly enabled: ReadonlySet<PackId>) {}

  add(ruleId: RuleId, subject: CheckSubject, outcome: CheckResult['outcome'], message: string, evidence: string[] = []) {
    const packId = packOf(ruleId);
    if (!this.enabled.has(packId)) return;
    this.list.push({
      id: `${ruleId}:${subjectKey(subject)}`, ruleId, packId, subject, outcome, message,
      citation: cite(ruleId), evidence: [...evidence].sort(),
    });
  }

  /** Results from a promoted Pack-lab pack; always enabled when passed in. */
  addCustom(packId: string, ruleId: string, outcome: CheckResult['outcome'], message: string, citation: CheckResult['citation']) {
    this.list.push({ id: `${ruleId}:plan`, ruleId, packId, subject: { kind: 'plan' }, outcome, message, citation, evidence: ['plan'] });
  }
}

export function indexBy<T, K>(xs: readonly T[], key: (x: T) => K): Map<K, T> {
  return new Map(xs.map((x) => [key(x), x]));
}

export function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

export const displayName = (npi: string, hcps: Map<string, Hcp>) => hcps.get(npi)?.name ?? `NPI ${npi}`;

const normTopic = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

export const sameTopic = (a: string, b: string) => normTopic(a) === normTopic(b);

/** Past same-topic programs for an HCP in the 365 days before the dinner (excluding the dinner itself). */
export function sameTopicHistory(npi: string, topic: string, dinnerDate: string, planId: string, history: readonly AttendanceHistory[]) {
  const dinner = dayNumber(dinnerDate);
  const planIds = history
    .filter((h) => h.npi === npi && h.planId !== planId && sameTopic(h.topic, topic))
    .filter((h) => { const d = dayNumber(h.date); return d < dinner && d >= dinner - 365; })
    .map((h) => h.planId);
  return unique(planIds).sort();
}

export function capState(projected: number, cap: number, s: EngineSettings): CapStatus['state'] {
  if (projected > cap) return 'over';
  if (projected * s.nearDenominator > cap * s.nearNumerator) return 'near';
  return 'ok';
}

export function capFor(npi: string, ledger: Map<string, LedgerEntry>, s: EngineSettings) {
  const e = ledger.get(npi);
  return { capCents: e?.capCents ?? s.defaultAnnualCapCents, ytdCents: e?.ytdCents ?? 0, priorRepeats: e?.sameTopicCount12mo ?? 0 };
}

const VENUE_FILLER = new Set(['the', 'and', 'of', 'at', 'restaurant', 'restaurants', 'bar', 'grill', 'cafe', 'kitchen', 'co', 'inc', 'llc']);
/** The distinctive words of a venue or merchant name: "The Larder, Oakland" -> ["larder"]. Only the part before a comma. */
export function venueWords(name: string): string[] {
  return name.split(',')[0]!.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]s\b/g, '').replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !VENUE_FILLER.has(w));
}
/**
 * Does a card merchant name look like the planned venue? Card descriptors vary ("ALDER AND VINE SF" for "Alder & Vine"),
 * so: one name's words, run together, appear in the other's, or they share a word of 4+ letters. Null when the venue has no
 * distinctive words to compare.
 */
export function sameVenue(venue: string, merchant: string): boolean | null {
  const v = venueWords(venue), m = venueWords(merchant);
  if (v.length === 0 || m.length === 0) return null;
  const vj = v.join(''), mj = m.join('');
  return mj.includes(vj) || vj.includes(mj) || v.some((w) => w.length >= 4 && m.includes(w));
}
