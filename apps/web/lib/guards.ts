// Input limits checked at the API door, before either service runs, so fixtures and live mode refuse the same things.
// These catch nonsense a judge might type (a $0 or $1M estimate, 60 invitees, a dinner dated last year); the rules
// themselves still run in the engine. Seed dinners never pass through here, so their fixed dates are untouched.
import { CoversError } from '@covers/contract';

export const PLAN_LIMITS = { minPerPersonCents: 1, maxPerPersonCents: 1_000_000, lowPerPersonCents: 2_000, minInvitees: 1, maxInvitees: 20 };

type PlanFields = { estimatedPerPerson?: unknown; inviteeNpis?: unknown; date?: unknown };

/** Throws a CoversError with a plain message when a plan create or edit is out of bounds. */
export function guardPlanInput(fields: PlanFields, now = new Date()): void {
  const est = fields.estimatedPerPerson;
  if (typeof est === 'number') {
    if (est < PLAN_LIMITS.minPerPersonCents) throw new CoversError('validation', 'Enter an estimate above $0 per person.');
    if (est > PLAN_LIMITS.maxPerPersonCents) throw new CoversError('validation', 'That estimate is over $10,000 per person. Check the amount.');
  }
  const inv = fields.inviteeNpis;
  if (Array.isArray(inv)) {
    if (inv.length < PLAN_LIMITS.minInvitees) throw new CoversError('validation', 'Invite at least one doctor.');
    if (inv.length > PLAN_LIMITS.maxInvitees) throw new CoversError('validation', `A speaker dinner can have up to ${PLAN_LIMITS.maxInvitees} invited doctors.`);
  }
  if (typeof fields.date === 'string') {
    const when = new Date(fields.date);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(when.getTime()) && when < today) throw new CoversError('validation', 'That date has passed. Pick today or a later date.');
  }
}

/** The speaker is counted separately (inviteeNpis never lists them), so listing them again would count them twice. */
export function guardSpeakerNotInvited(inviteeNpis: unknown, speakerNpi: string | undefined): void {
  if (speakerNpi && Array.isArray(inviteeNpis) && inviteeNpis.includes(speakerNpi)) {
    throw new CoversError('validation', 'The speaker is already at the table. Remove them from the invite list.');
  }
}

/** What the guard needs to know about a plan: its speaker's NPI and its current invitees. */
export type PlanLookup = (q: { speakerId?: string; planId?: string }) => Promise<{ speakerNpi?: string | undefined; inviteeNpis?: string[] | undefined }>;

/** Runs the guard for the methods that take plan input. */
export async function guardCall(method: string, args: unknown[], lookup: PlanLookup = async () => ({}), now = new Date()): Promise<void> {
  if (method === 'createPlan') {
    const input = (args[0] ?? {}) as PlanFields & { speakerId?: string };
    guardPlanInput(input, now);
    guardSpeakerNotInvited(input.inviteeNpis, (await lookup({ speakerId: input.speakerId })).speakerNpi);
  }
  if (method === 'updatePlan') {
    const patch = (args[1] ?? {}) as PlanFields & { speakerId?: string };
    guardPlanInput(patch, now);
    if (patch.inviteeNpis || patch.speakerId) {
      // A new speaker is checked against the invitees the plan will have: the new list, or the current one if unchanged.
      const found = await lookup({ speakerId: patch.speakerId, planId: String(args[0]) });
      guardSpeakerNotInvited(patch.inviteeNpis ?? found.inviteeNpis, found.speakerNpi);
    }
  }
}

/** People at the table who weren't on the plan: uninvited doctors, extra employees and guests. */
export function addedAtCloseOut(a: { attendedNpis: string[]; employeesPresent: number; extraGuests: number }, plan: { inviteeNpis: string[]; employeeCount: number }, speakerNpi: string | undefined): number {
  const expected = new Set([...plan.inviteeNpis, ...(speakerNpi ? [speakerNpi] : [])]);
  return a.attendedNpis.filter((n) => !expected.has(n)).length + Math.max(0, a.employeesPresent - plan.employeeCount) + a.extraGuests;
}

export const MAX_ADDED_AT_CLOSE_OUT = 10;

/** Refuses a close-out that adds more people than the phone allows, for anyone calling the API directly. */
export function guardAdded(added: number): void {
  if (added > MAX_ADDED_AT_CLOSE_OUT) throw new CoversError('validation', `Up to ${MAX_ADDED_AT_CLOSE_OUT} people who weren't on the plan can be added at close-out.`);
}

/** The padding finding, worked out on the server: added people that pull the cost per person under the cap. */
export function paddingFinding(totalCents: number, headcount: number, added: number, capCents: number): string | null {
  const base = headcount - added;
  if (added <= 0 || base <= 0 || totalCents <= capCents * base || totalCents > capCents * headcount) return null;
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  return `Adding ${added} ${added === 1 ? 'person' : 'people'} at close-out brought the cost from ${usd(totalCents / base)} to ${usd(totalCents / headcount)} a person, under the ${usd(capCents)} limit. Check who was added.`;
}
