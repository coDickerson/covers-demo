// The Audit tab's sections: the seven steps of the dinner (each at its bar on the crawl), plus rule changes and tests.
import type { AuditEvent } from '@covers/contract';
import { STEPS } from './dinner';
import { AUDIT_LABEL } from './documents';
import { AUDIT_STEP, nameOf } from './map';
import { STOPS } from './crawl';

export type SectionId = number | 'rules' | 'other';
export const RULES_SECTION = 'rules' as const;

/** Actions that belong to a step but don't move the dinner on, so AUDIT_STEP leaves them out. */
const MORE_STEPS: Record<string, number> = { 'hcp.registry_lookup': 1, 'input.suspicious': 1, 'ramp.charge_chosen': 3, 'ramp.no_transaction': 3 };

export function sectionOf(e: AuditEvent): SectionId {
  const step = AUDIT_STEP[e.action] ?? MORE_STEPS[e.action];
  if (step !== undefined) return step;
  if (/^(pack|breakit)\./.test(e.action)) return RULES_SECTION;
  return 'other';
}

export const SECTIONS: { id: SectionId; name: string; place: string }[] = [
  ...STEPS.map((name, i) => ({ id: i, name, place: STOPS[i]!.name })),
  { id: RULES_SECTION, name: 'Rule changes & tests', place: 'Pack lab and Break-It' },
  { id: 'other', name: 'Everything else', place: 'Pings, notes and resets' },
];

const MORE_LABELS: Record<string, string> = {
  'hcp.registry_lookup': 'Looked up a doctor in the NPI registry',
  'input.suspicious': 'Flagged suspicious input',
  'ramp.charge_chosen': 'Matched the card charge',
  'ramp.no_transaction': 'Found no card charge yet',
  'ramp.failed': 'A Ramp call failed',
  'slack.sent': 'Sent a Slack ping',
  'slack.failed': 'A Slack ping failed',
  'pack.compiled': 'Compiled a rule from plain English',
  'pack.replayed': 'Replayed a rule over past dinners',
  'pack.promoted': 'Made a rule live',
  'breakit.run': 'Ran a Break-It attack',
  'breakit.setup': 'Set up a Break-It attack',
  'session.reset': 'Started the demo over',
  'session.seeded': 'Loaded the demo data',
};
export const labelOf = (action: string) => AUDIT_LABEL[action] ?? MORE_LABELS[action] ?? action;
export const actorOf = (id: string) => (id === 'covers' ? 'Covers' : nameOf(id));

/** The filter chips over the events table. */
export const CHIPS = [
  ['All', () => true],
  ['Decisions', (e: AuditEvent) => e.actorId !== 'covers' && !e.model],
  ['Rule results', (e: AuditEvent) => !!e.ruleId || e.action === 'plan.evaluated'],
  ['Claude', (e: AuditEvent) => !!e.model],
  ['Failed', (e: AuditEvent) => /failed|suspicious/.test(e.action)],
] as const;
