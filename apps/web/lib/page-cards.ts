// Doctors, Rules and Proof show their records in the same square as every other document.
import type { CapStatus, ProgramPlan, ProofBundle, RulePack } from '@covers/contract';
import { fixtures } from '@covers/contract/fixtures';
import { usd } from './dinner';
import type { DocCardModel } from './doc-cards';
import { dayOf, nameOf, type DocRef, type Tone } from './map';

const stateTone = (s: CapStatus['state']): Tone => (s === 'over' ? 'over' : s === 'near' ? 'near' : 'ok');
const STATE_WORD: Record<CapStatus['state'], string> = { over: 'over limit', near: 'near limit', ok: 'under limit' };
const person = (npi: string) => fixtures.hcps.find((h) => h.npi === npi) ?? fixtures.speakers.find((s) => s.hcp.npi === npi)?.hcp;
const PACK_SOURCES: Record<string, DocRef[]> = {
  P1: [{ label: '§1 Speakers', doc: 'halden-policy', at: 's1-speakers' }],
  P2: [{ label: 'Covered recipients', doc: 'cms-glossary', at: 'covered-recipients' }, { label: 'NPI', doc: 'cms-glossary', at: 'npi' }],
  P3: [{ label: '§2 Meals', doc: 'halden-policy', at: 's2-meals' }],
  P4: [{ label: 'Cal. §119402', doc: 'ca-hsc-119402', at: 'd1' }, { label: '§3 Annual limit', doc: 'halden-policy', at: 's3-annual' }],
  P5: [{ label: 'OIG: repeat attendance', doc: 'oig-speaker-programs', at: 'repeat' }, { label: 'OIG: alcohol', doc: 'oig-speaker-programs', at: 'alcohol' }, { label: 'OIG: attendees', doc: 'oig-speaker-programs', at: 'guests' }],
  P6: [{ label: '42 CFR 403.904', doc: 'cfr-403-904', at: 'g1' }, { label: '2026 thresholds', doc: 'cms-thresholds', at: 'py2026' }],
};

export function doctorCard(cap: CapStatus, plans: ProgramPlan[]): DocCardModel {
  const h = person(cap.npi), room = cap.capCents - cap.ytdCents;
  const on = plans.filter((p) => p.inviteeNpis.includes(cap.npi) || fixtures.speakers.find((s) => s.id === p.speakerId)?.hcp.npi === cap.npi);
  return {
    eye: h?.source === 'seed' ? 'LEDGER · FICTIONAL DEMO DOCTOR' : 'LEDGER', head: `${usd(cap.ytdCents)} of ${usd(cap.capCents)} this year`, pill: [STATE_WORD[cap.state], stateTone(cap.state)],
    table: { title: nameOf(cap.npi), sub: [h?.credential, h?.specialty, h?.state].filter(Boolean).join(' · ') },
    rows: [
      { label: 'NPI', val: cap.npi, dot: 'ok' },
      { label: 'Programs on the same topic', desc: 'last 12 months', val: String(cap.sameTopicCount12mo), dot: cap.sameTopicCount12mo >= fixtures.company.repeatTopicFlagAt ? 'near' : 'ok' },
      ...on.map((p) => ({ label: p.title.replace(/^Speaker dinner: /, ''), desc: dayOf(p), val: p.status.replace('_', ' ') })),
    ],
    foot: ['Room left this year', usd(Math.max(0, room)), cap.state === 'over' ? 'over' : ''],
    source: { tag: 'DATA', eye: 'Covers ledger', title: 'Checked against', chips: [...PACK_SOURCES.P4!, PACK_SOURCES.P5![0]!] },
    why: 'Each dinner is checked against this total before the card exists, and only people who actually ate add to it.', evidence: [`Limit ${usd(cap.capCents)}`],
  };
}

export function packCard(p: RulePack): DocCardModel {
  return {
    eye: `RULE PACK · ${p.id} · V${p.version}`, head: p.name, pill: p.status === 'live' ? ['live', 'ok'] : ['draft', 'near'],
    table: { title: 'The rule', sub: `Effective ${p.effective}` }, quote: p.english, rows: [],
    foot: ['Status', p.status], source: { tag: 'RULE', eye: 'What it rests on', title: PACK_SOURCES[p.id] ? 'Sources' : 'Written in Pack lab', chips: PACK_SOURCES[p.id] ?? [] },
    why: 'Every result from this rule cites its source. A rule that cannot be cited goes to compliance instead of deciding.', evidence: [p.id],
  };
}

export function breakItCard(c: ProofBundle['breakIt'][number]): DocCardModel {
  return {
    eye: `BREAK-IT · CASE ${c.id} OF 15`, head: c.attack, pill: c.passed ? ['caught', 'ok'] : ['not caught', 'over'], table: { title: 'What should happen', sub: c.expected }, quote: c.note, rows: [],
    foot: ['Result', c.passed ? 'Passed' : 'Failed', c.passed ? '' : 'over'], source: { tag: 'TEST', eye: 'Recorded test', title: 'From the proof run', chips: [] },
    why: 'Each case tries to get something past the checks. This is the recorded result of that run.', evidence: ['proof/proof.json'],
  };
}

export function evalCard(r: ProofBundle['receiptEval'][number]): DocCardModel {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return {
    eye: 'RECEIPT READER EVAL', head: r.cls, pill: [`${r.n} lines`, ''], table: { title: 'How accurately lines were classified', sub: 'Measured against labeled receipts' },
    rows: [{ label: 'Precision', desc: 'lines labeled this that really were', val: pct(r.precision), dot: r.precision >= 0.95 ? 'ok' : 'near' }, { label: 'Recall', desc: 'lines of this kind that were found', val: pct(r.recall), dot: r.recall >= 0.95 ? 'ok' : 'near' }],
    foot: ['Lines tested', String(r.n)], source: { tag: 'EVAL', eye: 'Recorded test', title: 'From the proof run', chips: [] }, why: 'A line below the confidence gate is confirmed by a person before it is used.', evidence: ['proof/proof.json'],
  };
}

export function realCard(r: ProofBundle['realVsSimulated'][number]): DocCardModel {
  const real = /^real/i.test(r.status);
  return {
    eye: 'REAL OR SIMULATED', head: r.piece, pill: [r.status, real ? 'ok' : 'near'], table: { title: 'How we know', sub: 'Stated plainly for reviewers' }, quote: r.howWeKnow, rows: [],
    foot: ['Status', r.status], source: { tag: 'NOTE', eye: 'Recorded', title: 'From the proof run', chips: [] }, why: 'Anything simulated in this demo is labeled as simulated.', evidence: ['proof/proof.json'],
  };
}
