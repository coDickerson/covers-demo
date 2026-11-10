// The dinner map's logic: turns real service results into dashboard rows and the stations the bell visits.
// Pure functions over contract types, so fixtures and live mode behave the same.
import type { AuditEvent, CheckResult, DinnerStep, Evaluation, PlanView, ProgramPlan, Receipt, Settlement, StepNote } from '@covers/contract';
import { fixtures } from '@covers/contract/fixtures';
import { tokens } from './tokens';
import { afterChecks, afterMark, beforeChecks, beforeMark, CHECKERS, openFlag, STEPS, stepOf, usd, type CheckerId, type Mark, type Role } from './dinner';

export type DinnerState = { view: PlanView; rounds: Evaluation[]; receipt: Receipt | null; settlement: Settlement | null; notes: StepNote[]; audit: AuditEvent[] };
export type Tone = '' | 'ok' | 'near' | 'over';
/** A document to open: 'receipt', 'ledger', 'roster', 'npi', 'ramp', 'attend', 'rows', 'audit', or a stored document id. */
export type DocRef = { label: string; doc: string; at?: string };
export type Station = { name: string; kind: string; mark: Mark; word?: string; card: [string, string, Tone?][]; found: string; looked: DocRef[]; think?: string[]; checks?: CheckResult[]; link?: { label: string; url: string } };

/** Simulated funds: the fixture service uses fund-sim-…, LiveService without Ramp keys uses sim-fund-…. */
export const isSimulatedFund = (fundId: string) => fundId.startsWith('fund-sim') || fundId.startsWith('sim-fund');
/** The fund's page in Ramp's sandbox web app (same path LiveService links from Slack). Null for a simulated fund. */
export const rampFundUrl = (fundId: string) => (isSimulatedFund(fundId) ? null : `https://demo.ramp.com/funds/issued#/d/funds/${encodeURIComponent(fundId)}`);
const rampLink = (fundId: string | undefined) => { const url = fundId ? rampFundUrl(fundId) : null; return url ? { link: { label: 'View in Ramp', url } } : {}; };

const CONFIDENCE_GATE = 0.8; // same as the engine's default
/** The Check stations whose results differ between two evaluation rounds: the only ones the bell needs to revisit. */
export function changedStations(before: Evaluation, after: Evaluation): number[] {
  const sign = (e: Evaluation, id: CheckerId) => beforeChecks(id, e).map((c) => `${c.id}|${c.outcome}|${c.message}`).sort().join('\n');
  return CHECKERS.flatMap((c, i) => (sign(before, c.id) === sign(after, c.id) ? [] : [i]));
}

/** What the agent looks at, line by line, while it is at a station. */
export const thinkingLines = (s: Station) => s.think?.length ? s.think : s.card.map(([a, b]) => (b ? `${a}: ${b}` : a));
/** The step of the map an audit action belongs to. */
export const AUDIT_STEP: Record<string, number> = { 'plan.created': 0, 'plan.updated': 1, 'plan.evaluated': 1, 'fund.issued': 2, 'charge.seen': 3, 'receipt.read': 4, 'receipt.line_fixed': 4, 'attendance.confirmed': 5, 'ramp.memo_written': 5, 'fund.locked': 5, 'exception.approved': 6, 'exception.denied': 6 };

export const STEP_KEYS: DinnerStep[] = ['propose', 'check', 'fund', 'dinner', 'close_out', 'settle', 'report'];

const NAMES = new Map<string, string>([
  ...fixtures.hcps.map((h) => [h.npi, h.name] as const),
  ...fixtures.speakers.map((s) => [s.hcp.npi, s.hcp.name] as const),
  ...fixtures.users.map((u) => [u.id, u.name] as const),
  ...fixtures.reps.map((r) => [r.id, r.name] as const),
]);
export const nameOf = (id: string) => NAMES.get(id) ?? (/^\d{10}$/.test(id) ? `NPI ${id}` : id);
export const speakerOf = (plan: ProgramPlan) => fixtures.speakers.find((s) => s.id === plan.speakerId);
export const headcountOf = (plan: ProgramPlan) => plan.inviteeNpis.length + 1 + plan.employeeCount;
export const cardLimitOf = (plan: ProgramPlan) => fixtures.company.perPersonCapCents * headcountOf(plan);
export const dayOf = (plan: ProgramPlan) => new Date(plan.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const venueOf = (plan: ProgramPlan) => plan.venue.split(',')[0]!;

/** Where the dinner stands, for its dashboard row. */
export function standing(view: PlanView, receipt: Receipt | null, settlement: Settlement | null): { step: number; who: Role | null; say: string; tone: Tone } {
  const { plan, evaluation } = view;
  const step = stepOf(view, receipt, settlement, 'compliance');
  const flag = openFlag(evaluation, settlement);
  if (plan.status === 'closed') return { step, who: null, say: 'Closed', tone: 'ok' };
  if (settlement) return flag ? { step, who: 'compliance', say: flag.message, tone: 'near' } : { step, who: 'compliance', say: 'Ready to close', tone: '' };
  if (receipt) return { step, who: 'rep', say: 'Confirm who ate', tone: '' };
  if (plan.fundId) return { step, who: 'rep', say: 'Add the receipt after the dinner', tone: '' };
  if (plan.status === 'cleared') return { step, who: 'rep', say: 'Cleared. Issue the card', tone: 'ok' };
  if (plan.status === 'blocked') return { step, who: 'rep', say: `Blocked: ${evaluation?.checks.find((c) => c.outcome === 'block' || c.denial)?.message ?? 'needs a change'}`, tone: 'over' };
  if (plan.status === 'needs_approval') return { step, who: 'compliance', say: flag?.message ?? 'Waiting on compliance', tone: 'near' };
  return { step, who: 'rep', say: 'Draft, ready to check', tone: '' };
}

/** The document a check rests on. Live citations carry it; demo-data citations don't, so they map by rule pack. */
export function sourceOf(c: CheckResult): DocRef {
  const label = 'Rule source';
  if (c.citation.docId) return { label, doc: c.citation.docId, ...(c.citation.passageId ? { at: c.citation.passageId } : {}) };
  if (c.packId === 'P1') return { label, doc: 'halden-policy', at: 's1-speakers' };
  if (c.packId === 'P2') return { label, doc: 'cms-glossary', at: 'covered-recipients' };
  if (c.packId === 'P3') return { label, doc: 'halden-policy', at: 's2-meals' };
  if (c.packId === 'P4') return { label, doc: 'ca-hsc-119402', at: 'd1' };
  if (c.packId === 'P5') return { label, doc: 'oig-speaker-programs', at: c.subject.kind === 'line' ? 'alcohol' : c.subject.kind === 'hcp' ? 'repeat' : 'guests' };
  return { label, doc: 'cfr-403-904', at: 'g1' };
}

function evidenceRefs(checks: CheckResult[]): DocRef[] {
  const out = new Map<string, DocRef>();
  for (const id of checks.flatMap((c) => c.evidence)) {
    if (id.startsWith('ledger:')) out.set('ledger', { label: 'Annual totals', doc: 'ledger', at: id.slice('ledger:'.length) });
    else if (id.startsWith('spk-')) out.set('roster', { label: 'Speaker record', doc: 'roster' });
    else if (/^\d{10}$/.test(id)) out.set('npi', { label: 'NPI records', doc: 'npi' });
    else if (id.startsWith('rcpt') || id.startsWith('receipt:')) out.set('receipt', { label: 'Receipt', doc: 'receipt' });
  }
  return [...out.values()];
}

const MARK_TONE: Partial<Record<Mark, Tone>> = { blocked: 'over', flagged: 'near' };

function checkerStation(id: CheckerId, name: string, kind: string, checks: CheckResult[], mark: Mark, idle: string): Station {
  const trouble = checks.filter((c) => c.outcome !== 'pass');
  const shown = trouble.length ? trouble : checks;
  const tone = MARK_TONE[mark] ?? '';
  const card: Station['card'] = !checks.length ? [[idle, '']] : trouble.length ? trouble.slice(0, 2).map((c) => [c.message, '', tone]) : [[`${checks.length} passed`, '']];
  const sources = new Map(shown.map(sourceOf).map((r) => [`${r.doc}:${r.at}`, r]));
  return { name, kind, mark, card, checks, think: checks.map((c) => c.message), found: checks.length ? shown.map((c) => c.message).join(' ') : idle, looked: [...evidenceRefs(shown), ...sources.values()] };
}

const done = (name: string, kind: string, card: Station['card'], found: string, looked: DocRef[] = []): Station => ({ name, kind, mark: 'clear', word: 'Done', card, found, looked });
const waiting = (name: string, kind: string, found: string): Station => ({ name, kind, mark: 'waiting', card: [['Waiting', '']], found, looked: [] });

/** The stations on one step of the map. `round` picks an earlier evaluation on the Check step. */
export function stationsFor(step: number, d: DinnerState, round?: number): Station[] {
  const { plan } = d.view;
  const { receipt, settlement } = d;
  const speaker = speakerOf(plan);
  const speakerName = speaker?.hcp.name ?? plan.speakerId;
  switch (step) {
    case 0: {
      // The dinner as Covers proposes it from the rep's calendar invite: each station reads one part of the invite.
      const people = headcountOf(plan);
      const [speakerS, guestsS, venueS, estimateS] = [
        done('Speaker', 'Speaker', [[speakerName, ''], ['Topic', plan.topic]], `${speakerName} will speak on ${plan.topic}.`, [{ label: 'Speaker record', doc: 'roster' }]),
        done('Guests', 'Invited', plan.inviteeNpis.slice(0, 3).map((n) => [nameOf(n), '']).concat(plan.inviteeNpis.length > 3 ? [[`+${plan.inviteeNpis.length - 3} more`, '']] : []) as Station['card'], `${plan.inviteeNpis.map(nameOf).join(', ')}.`, [{ label: 'NPI records', doc: 'npi' }]),
        done('Venue', 'Where and when', [[venueOf(plan), ''], [dayOf(plan), '']], `${plan.venue}, ${dayOf(plan)}.`),
        done('Estimate', 'All in', [['Per person', usd(plan.estimatedPerPerson)], ['People', String(people)]], `${usd(plan.estimatedPerPerson)} per person including tax and tip, for ${people} people.`, [{ label: 'Meal limit', doc: 'halden-policy', at: 's2-meals' }]),
      ];
      return [
        { ...speakerS, think: [`Reading ${nameOf(plan.repId)}'s calendar invite`, `Speaker: ${speakerName}`, `Topic: ${plan.topic}`] },
        { ...guestsS, think: [`${plan.inviteeNpis.length} doctors on the invite`, 'Matching each one to the NPI registry', 'Every guest identified'] },
        { ...venueS, think: ['Reading where and when', `${venueOf(plan)}, ${dayOf(plan)}`] },
        { ...estimateS, think: ['Pulling the reservation estimate', `${usd(plan.estimatedPerPerson)} a person, ${people} people`] },
      ];
    }
    case 1: {
      const ev = round !== undefined ? d.rounds[round] ?? d.view.evaluation : d.view.evaluation;
      return CHECKERS.map((c) => checkerStation(c.id, c.name, 'Before the dinner', beforeChecks(c.id, ev), c.id === 'P6' ? 'none' : beforeMark(c.id, ev), c.id === 'P6' ? 'Runs after the dinner' : 'Not checked yet'));
    }
    case 2: {
      const limit = cardLimitOf(plan), issued = !!plan.fundId;
      return [
        done('Headcount', 'Who the card covers', [['People', String(headcountOf(plan))]], `${plan.inviteeNpis.length} clinicians, the speaker and ${plan.employeeCount} employee(s).`),
        done('Limit', 'Card limit', [[usd(limit), '']], `${headcountOf(plan)} people at ${usd(fixtures.company.perPersonCapCents)}.`, [{ label: 'Card', doc: 'ramp', at: 'limit' }, { label: 'Meal limit', doc: 'halden-policy', at: 's2-meals' }]),
        done('Merchant', 'Where it works', [['Restaurants only', '']], 'The card is restricted to restaurants, and the charge is confirmed after the dinner.', [{ label: 'Card policy', doc: 'halden-policy', at: 's5-card' }]),
        issued ? { ...done('Ramp', 'Card', [['Issued', ''], ...(isSimulatedFund(plan.fundId!) ? [['Simulated', ''] as [string, string]] : [])], isSimulatedFund(plan.fundId!) ? `A simulated card is ready for ${dayOf(plan)}.` : `The Ramp card is ready for ${dayOf(plan)}.`, [{ label: 'Card', doc: 'ramp', at: 'limit' }]), ...rampLink(plan.fundId) } : waiting('Ramp', 'Card', 'The card is issued once every check has cleared.'),
      ];
    }
    case 3: {
      const charged = settlement?.charge?.amountCents ?? d.view.closeOut?.chargedCents ?? receipt?.totalCents;
      return [
        plan.fundId ? { ...done('Card live', 'Card', [[usd(cardLimitOf(plan)), '']], 'The card is live for the dinner.', [{ label: 'Card', doc: 'ramp', at: 'limit' }]), ...rampLink(plan.fundId) } : waiting('Card live', 'Card', 'Waiting for the card.'),
        receipt ? done('Dinner', 'The night', [[venueOf(plan), ''], [dayOf(plan), '']], `The dinner took place at ${plan.venue}.`) : waiting('Dinner', 'The night', `Scheduled for ${dayOf(plan)} at ${plan.venue}.`),
        charged !== undefined ? { ...done('Charge', 'Card activity', [['Charged', usd(charged)]], `The card was charged ${usd(charged)}${d.view.closeOut?.merchantName ? ` at ${d.view.closeOut.merchantName}` : ''}.`, [{ label: 'Card', doc: 'ramp', at: 'charge' }]), ...rampLink(plan.fundId) } : waiting('Charge', 'Card activity', 'No charge yet.'),
        receipt ? done('Reminder', 'To the rep', [['Asked for the receipt', '']], 'The rep was asked for the receipt and who came.') : waiting('Reminder', 'To the rep', 'Sent when the card is charged.'),
      ];
    }
    case 4: {
      if (!receipt) return ['Photo', 'Read', 'Adds up', 'Who ate'].map((n) => waiting(n, 'Close out', 'Waiting for the receipt.'));
      const sum = receipt.lines.reduce((n, l) => n + l.amountCents, 0), adds = sum === receipt.totalCents, unsure = receipt.lines.filter((l) => l.confidence < CONFIDENCE_GATE);
      return [
        done('Photo', 'Receipt', [[venueOf(plan), '']], 'The rep added the receipt.', [{ label: 'Receipt', doc: 'receipt' }]),
        { ...done('Read', 'Lines', [['Lines', String(receipt.lines.length)], ['Unsure', String(unsure.length), unsure.length ? 'near' : '']], unsure.length ? `${unsure.length} line(s) need a person to confirm.` : 'Every line was read confidently.', [{ label: 'Receipt', doc: 'receipt' }, { label: 'Receipts policy', doc: 'halden-policy', at: 's6-receipts' }]), mark: unsure.length ? 'flagged' : 'clear', word: unsure.length ? 'Flagged' : 'Done' },
        { ...done('Adds up', 'Check the math', [['Lines', usd(sum)], ['Printed', usd(receipt.totalCents)]], adds ? 'The lines add up to the printed total.' : `The lines add up to ${usd(sum)}, but the printed total is ${usd(receipt.totalCents)}.`, [{ label: 'Receipt', doc: 'receipt', at: 'total' }]), mark: adds ? 'clear' : 'flagged', word: adds ? 'Clear' : 'Flagged' },
        settlement ? done('Who ate', 'Attendance', [['People', String(settlement.headcount)], ['Each', usd(settlement.perPersonCents)]], `${settlement.headcount} people ate, at ${usd(settlement.perPersonCents)} each.`, [{ label: 'Attendance', doc: 'attend' }]) : waiting('Who ate', 'Attendance', 'The rep confirms who ate.'),
      ];
    }
    case 5: return CHECKERS.map((c) => checkerStation(c.id, c.name, 'After the dinner', afterChecks(c.id, settlement), afterMark(c.id, settlement, receipt), c.id === 'P1' ? 'Checked before the dinner' : settlement ? 'Nothing to flag' : 'Runs after the dinner'));
    default: {
      if (!settlement) return ['Exception', 'Decision', 'Rows', 'Record'].map((n) => waiting(n, 'Report', 'Waiting for the settlement.'));
      const ex = settlement.exceptions, open = ex.filter((c) => !c.approval && !c.denial), rows = settlement.openPayments.filter((r) => r.reportable);
      const decided = ex.filter((c) => c.approval || c.denial);
      const exLooked = [...evidenceRefs(ex), ...ex.map(sourceOf)];
      return [
        ex.length ? { name: 'Exception', kind: 'For compliance', mark: open.length ? 'flagged' : 'clear', word: open.length ? 'Flagged' : 'Done', card: ex.slice(0, 2).map((c) => [c.message, '', open.includes(c) ? 'near' : '']), found: ex.map((c) => c.message).join(' '), looked: exLooked } : done('Exception', 'For compliance', [['None', '']], 'Nothing needed review.'),
        open.length ? waiting('Decision', nameOf(fixtures.users.find((u) => u.role === 'compliance')!.id), 'Waiting for compliance to approve or deny.') : done('Decision', 'Compliance', decided.length ? decided.slice(0, 2).map((c) => [c.denial ? 'Denied' : 'Approved', '']) : [['Not needed', '']], decided.length ? decided.map((c) => `${c.denial ? 'Denied' : 'Approved'}: ${(c.denial ?? c.approval)!.note}`).join(' ') : 'Nothing needed a decision.'),
        done('Rows', 'Open Payments', [['Drafted', String(rows.length)], ['Each', usd(settlement.perPersonCents)]], `${rows.length} rows drafted for people to file.`, [{ label: 'Draft rows', doc: 'rows' }]),
        plan.status === 'closed' ? done('Record', 'Closed', [['Closed', '']], 'Every exception is decided, and this dinner is closed.', [{ label: 'Audit trail', doc: 'audit' }]) : waiting('Record', 'Closed', 'Closes when every exception is decided.'),
      ];
    }
  }
}

/** The standard easing token, for animations started from script. */
export const EASE_STANDARD = `cubic-bezier(${tokens['motion/ease/standard']})`;

const RAIL = { left: 0.12, right: 0.88, high: 0.36, low: 0.54, side: 0.45, inset: 72 }; // inset keeps the path clear of the side arrows

/** Spreads stations across the given area on a path that swings between two heights. `stops` are percent along the path: start, each station, end. */
export function layoutPath(count: number, width: number, height: number): { d: string; points: { x: number; y: number }[]; stops: number[] } {
  const gap = ((RAIL.right - RAIL.left) * width) / Math.max(1, count - 1);
  const points = Array.from({ length: count }, (_, i) => ({ x: RAIL.left * width + i * gap, y: (i % 2 ? RAIL.high : RAIL.low) * height }));
  const all = [{ x: RAIL.inset, y: RAIL.side * height }, ...points, { x: width - RAIL.inset, y: RAIL.side * height }];
  let d = `M${all[0]!.x} ${all[0]!.y}`, length = 0;
  const lengths = [0];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1]!, b = all[i]!, mx = (a.x + b.x) / 2;
    d += ` C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
    let px = a.x, py = a.y;
    for (let n = 1; n <= 40; n++) {
      const t = n / 40, u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y;
      length += Math.hypot(x - px, y - py); px = x; py = y;
    }
    lengths.push(length);
  }
  return { d, points, stops: lengths.map((l) => (length ? (l / length) * 100 : 0)) };
}

/** Which station the bell rests at: the first that needs attention, otherwise the last one finished. */
export function restingStation(stations: Station[]): number {
  const stuck = stations.findIndex((s) => s.mark === 'blocked' || s.mark === 'flagged');
  if (stuck >= 0) return stuck;
  return stations.reduce((last, s, i) => (s.mark === 'clear' ? i : last), 0);
}

export const stepName = (i: number) => STEPS[i]!;
