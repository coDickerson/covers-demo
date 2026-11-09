// Every document opens in the same square: finding, table with a bottom line, source, why it matters, evidence.
// This file turns real service data into that one shape.
import type { PolicyDocument } from '@covers/contract';
import { fixtures } from '@covers/contract/fixtures';
import { usd } from './dinner';
import { AUDIT_LABEL } from './documents';
import { cardLimitOf, dayOf, headcountOf, nameOf, speakerOf, venueOf, type DinnerState, type DocRef, type Tone } from './map';

export type DocRow = { label: string; desc?: string; val: string; dot?: Tone; tag?: [string, Tone]; on?: boolean };
export type CardChip = DocRef & { on?: boolean };
export type DocCardModel = {
  eye: string; head: string; pill: [string, Tone];
  table: { title: string; sub: string; right?: string };
  quote?: string; rows: DocRow[]; foot: [string, string, Tone?];
  source: { tag: string; eye: string; title: string; chips: CardChip[]; url?: string };
  why: string; evidence: (string | DocRef)[];
};

const KIND: Record<PolicyDocument['kind'], string> = { statute: 'STATUTE', regulation: 'REGULATION', guidance: 'GUIDANCE', agency_page: 'AGENCY PAGE', company_policy: 'COMPANY POLICY' };
const POLICY = (label: string, at: string): DocRef => ({ label, doc: 'halden-policy', at });
const CFR: DocRef = { label: '42 CFR 403.904', doc: 'cfr-403-904', at: 'g1' };
const RECIPIENTS: DocRef = { label: 'Covered recipients', doc: 'cms-glossary', at: 'covered-recipients' };

function storedCard(doc: PolicyDocument, at?: string): DocCardModel {
  const passage = doc.passages.find((p) => p.id === at) ?? doc.passages[0]!;
  const fictional = doc.kind === 'company_policy';
  return {
    eye: `${KIND[doc.kind]} · ${doc.publisher}`, head: passage.label, pill: fictional ? ['fictional demo policy', ''] : ['checked against the original', 'ok'],
    table: { title: doc.title, sub: doc.note ?? doc.publisher }, quote: passage.text, rows: [], foot: ['Passage', passage.label],
    source: { tag: fictional ? 'DOC' : 'PDF', eye: 'Passages in this source', title: doc.title, chips: doc.passages.map((p) => ({ label: p.label.replace(/^Suspect characteristic: /, ''), doc: doc.id, at: p.id, on: p.id === passage.id })), ...(doc.url ? { url: doc.url } : {}) },
    why: fictional ? 'This is the rule Covers applies. It is a fictional policy written for this demo.' : 'Covers raises this for a person to decide. It does not make the legal conclusion.',
    evidence: [`Checked ${doc.checkedOn}`, doc.publisher],
  };
}

export function buildCard(ref: Pick<DocRef, 'doc' | 'at'>, d: DinnerState, documents: PolicyDocument[]): DocCardModel | null {
  const { plan, evaluation } = d.view, { receipt, settlement, audit } = d;
  const stored = documents.find((x) => x.id === ref.doc);
  if (stored) return storedCard(stored, ref.at);
  const speaker = speakerOf(plan), speakerName = speaker?.hcp.name ?? plan.speakerId, place = `${venueOf(plan)} · ${dayOf(plan)}`;
  const limit = cardLimitOf(plan), meal = POLICY('§2 Meals', 's2-meals');

  switch (ref.doc) {
    case 'receipt': {
      if (!receipt) return null;
      const alcohol = receipt.lines.filter((l) => l.category === 'alcohol').reduce((n, l) => n + l.amountCents, 0);
      return {
        eye: 'RECEIPT · READ FROM THE PHOTO', head: `${usd(receipt.totalCents)} read across ${receipt.lines.length} lines`, pill: alcohol ? [`${usd(alcohol)} alcohol`, 'near'] : ['no alcohol', 'ok'],
        table: { title: venueOf(plan), sub: dayOf(plan), right: usd(receipt.totalCents) },
        rows: receipt.lines.map((l) => ({ label: l.text, val: usd(l.amountCents), dot: l.category === 'alcohol' ? 'near' : 'ok', ...(l.category === 'alcohol' ? { tag: ['alcohol', 'near'] as [string, Tone], on: true } : {}) })),
        foot: settlement ? ['Per person, all in', usd(settlement.perPersonCents)] : ['Printed total', usd(receipt.totalCents)],
        source: { tag: 'JPG', eye: `Added by ${nameOf(plan.repId)}`, title: 'Checked against', chips: [meal, CFR, { label: 'OIG: alcohol', doc: 'oig-speaker-programs', at: 'alcohol' }] },
        why: 'Each line is read from the photo, and the total is what gets divided among the people who ate.', evidence: [{ label: 'Attendance', doc: 'attend' }, { label: 'Card', doc: 'ramp', at: 'charge' }],
      };
    }
    case 'ledger': {
      const caps = settlement?.caps.length ? settlement.caps : evaluation?.caps ?? [];
      const over = caps.find((c) => c.state === 'over');
      return {
        eye: 'LEDGER · FICTIONAL DEMO DOCTORS', head: over ? `${usd(over.projectedCents)} would pass the ${usd(over.capCents)} limit` : 'Everyone stays under the annual limit', pill: over ? [nameOf(over.npi), 'over'] : ['all clear', 'ok'],
        table: { title: 'Annual totals by clinician', sub: settlement ? 'After this dinner' : 'Before this dinner, and with it' },
        rows: caps.map((c) => ({ label: nameOf(c.npi), desc: `${usd(c.ytdCents)} so far`, val: usd(c.projectedCents), dot: c.state === 'over' ? 'over' : c.state === 'near' ? 'near' : 'ok', ...(c.state === 'over' ? { tag: ['over limit', 'over'] as [string, Tone] } : {}), on: c.npi === ref.at })),
        foot: ['Limit per clinician', usd(fixtures.company.annualCapCents)],
        source: { tag: 'DATA', eye: 'Covers ledger', title: 'Checked against', chips: [POLICY('§3 Annual limit', 's3-annual'), { label: 'Cal. §119402', doc: 'ca-hsc-119402', at: 'd1' }] },
        why: 'Each clinician is checked before the card exists, so a dinner that would pass the limit never gets funded.', evidence: [`${caps.length} clinicians`],
      };
    }
    case 'roster': {
      const ok = speaker?.status === 'approved';
      return {
        eye: 'SPEAKER ROSTER · FICTIONAL', head: `${speakerName}: ${speaker?.status.replace('_', ' ') ?? 'not found'}`, pill: ok ? ['can present', 'ok'] : ['cannot present', 'over'],
        table: { title: 'Speaker record', sub: 'Company speaker roster' },
        rows: [{ label: 'Status', val: speaker?.status.replace('_', ' ') ?? 'Not found', dot: ok ? 'ok' : 'over' }, { label: 'Approved topics', val: speaker?.approvedTopics.join(', ') ?? '', dot: 'ok' }, { label: 'Contract ends', val: speaker?.contractEnds ?? '', dot: 'ok' }],
        foot: ['Topic for this dinner', plan.topic], source: { tag: 'DATA', eye: 'Company roster', title: 'Checked against', chips: [POLICY('§1 Speakers', 's1-speakers')] },
        why: 'Status, topic and contract date are each checked against this dinner.', evidence: [place],
      };
    }
    case 'npi': {
      const npis = [...(speaker ? [speaker.hcp.npi] : []), ...plan.inviteeNpis];
      return {
        eye: 'NPI REGISTRY · FICTIONAL SEED RECORDS', head: `${npis.length} clinicians identified by NPI`, pill: ['seed records', ''], table: { title: 'NPI records', sub: 'Real lookups use the NPPES registry' },
        rows: npis.map((n) => ({ label: nameOf(n), val: n, dot: 'ok' })), foot: ['Records', String(npis.length)], source: { tag: 'DATA', eye: 'Seed records', title: 'Checked against', chips: [RECIPIENTS] },
        why: 'Everyone on the dinner has to be identified before anything can be reported about them.', evidence: ['Fictional NPIs start with 9'],
      };
    }
    case 'ramp': {
      const charge = settlement?.charge?.amountCents ?? d.view.closeOut?.chargedCents ?? (ref.at === 'charge' ? receipt?.totalCents : undefined);
      const simulated = plan.fundId?.startsWith('fund-sim') || settlement?.charge?.source === 'simulated';
      return {
        eye: `RAMP CARD · ${simulated ? 'SIMULATED' : 'SANDBOX'}`, head: charge !== undefined ? `${usd(charge)} charged of a ${usd(limit)} limit` : `${usd(limit)} limit for ${headcountOf(plan)} people`, pill: charge !== undefined ? ['charged', 'ok'] : ['issued', 'ok'],
        table: { title: 'Dinner card', sub: place, right: usd(limit) },
        rows: [{ label: 'Limit', desc: `${headcountOf(plan)} × ${usd(fixtures.company.perPersonCapCents)}`, val: usd(limit), dot: 'ok', on: ref.at === 'limit' }, { label: 'Merchant', desc: 'Restricted on the card, confirmed from the charge', val: 'Restaurants', dot: 'ok' }, ...(charge !== undefined ? [{ label: 'Charged', val: usd(charge), dot: 'ok' as Tone, on: ref.at === 'charge' }] : [])],
        foot: charge !== undefined ? ['Unused', usd(limit - charge)] : ['Available', usd(limit)], source: { tag: 'RAMP', eye: simulated ? 'Simulated card' : 'Ramp sandbox', title: 'Checked against', chips: [meal, POLICY('§5 Card charge', 's5-card')] },
        why: 'The limit is the most this headcount allows. After the dinner the charge is compared with the receipt.', evidence: receipt ? [{ label: 'Receipt', doc: 'receipt' }] : [place],
      };
    }
    case 'attend': {
      if (!settlement) return null;
      const invited = headcountOf(plan);
      return {
        eye: 'ATTENDANCE · CONFIRMED BY THE REP', head: `${settlement.headcount} of ${invited} people ate`, pill: invited > settlement.headcount ? [`${invited - settlement.headcount} did not eat`, 'near'] : ['everyone came', 'ok'], table: { title: 'Who ate', sub: `Confirmed by ${nameOf(plan.repId)}`, right: receipt ? usd(receipt.totalCents) : '' },
        rows: settlement.byPerson.map((p) => ({ label: nameOf(p.who), val: usd(p.amountCents), dot: 'ok' })), foot: ['Each person who ate', usd(settlement.perPersonCents)], source: { tag: 'FORM', eye: 'Rep confirmation', title: 'Checked against', chips: [CFR, RECIPIENTS] },
        why: 'A person who did not eat gets no share and no report row, and their annual total does not move.', evidence: [{ label: 'Receipt', doc: 'receipt' }],
      };
    }
    case 'rows': {
      if (!settlement) return null;
      const rows = settlement.openPayments.filter((r) => r.reportable);
      return {
        eye: 'OPEN PAYMENTS · DRAFTED, PEOPLE FILE', head: `${rows.length} rows drafted at ${usd(settlement.perPersonCents)}`, pill: ['food and beverage, in kind', ''], table: { title: 'Draft report rows', sub: place },
        rows: rows.map((r) => ({ label: nameOf(r.npi), desc: r.npi, val: usd(r.amountCents), dot: 'ok' })), foot: ['Total on these rows', usd(rows.reduce((n, r) => n + r.amountCents, 0))], source: { tag: 'CSV', eye: 'Covers draft', title: 'Checked against', chips: [CFR, { label: '2026 thresholds', doc: 'cms-thresholds', at: 'py2026' }, RECIPIENTS] },
        why: 'One row for each covered recipient who ate. Employees share in the split but are not reported.', evidence: [{ label: 'Attendance', doc: 'attend' }, { label: 'Receipt', doc: 'receipt' }],
      };
    }
    case 'audit':
      return {
        eye: 'AUDIT TRAIL · THIS DINNER', head: `${audit.length} actions recorded`, pill: ['in order', ''], table: { title: plan.title, sub: place },
        rows: audit.map((e) => ({ label: AUDIT_LABEL[e.action] ?? e.action, desc: nameOf(e.actorId), val: new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) })), foot: ['Plan status', plan.status.replace('_', ' ')], source: { tag: 'LOG', eye: 'Covers', title: 'Rules used on this dinner', chips: [meal, CFR] },
        why: 'Every action on this dinner is recorded here in the order it happened.', evidence: [nameOf(plan.repId)],
      };
    default: return null;
  }
}
