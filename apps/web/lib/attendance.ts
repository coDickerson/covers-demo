// Close-out attendance: who came, including people the rep adds who were not on the invite, and the double check
// Covers runs before the rep closes out. Pure: no I/O. The engine's own checks (P2.uninvited, P5.non-hcp-guest,
// P6.covers, caps) still run on confirmAttendance; this only makes sure the rep has said who everyone is first.
import type { Attendance } from '@covers/contract';

export type Relation = 'spouse' | 'family' | 'friend' | 'other';
export const RELATIONS: [Relation, string][] = [['spouse', 'Spouse or partner'], ['family', 'Family member'], ['friend', 'Friend'], ['other', 'Something else']];

export type Added =
  | { kind: 'doctor'; id: string; npi: string; name: string }
  | { kind: 'coworker'; id: string; name: string }
  | { kind: 'guest'; id: string; name: string; withId?: string; relation?: Relation; reason?: string };

export type Present = { id: string; name: string }; // someone at the table: a doctor (id = NPI) or the rep (id = 'rep')

export type Finding = {
  addedId?: string;
  tone: 'ok' | 'review' | 'ask'; // ask = the rep must answer before closing out
  text: string;
};

export function buildAttendance(a: { planId: string; repId: string; people: string[]; absent: Set<string>; added: Added[] }): Attendance {
  const doctors = a.added.flatMap((x) => (x.kind === 'doctor' ? [x.npi] : []));
  return {
    planId: a.planId,
    attendedNpis: [...new Set([...a.people.filter((n) => !a.absent.has(n)), ...doctors])],
    employeesPresent: (a.absent.has('rep') ? 0 : 1) + a.added.filter((x) => x.kind === 'coworker').length,
    extraGuests: a.added.filter((x) => x.kind === 'guest').length,
    confirmedBy: a.repId,
  };
}

const lastName = (name: string) => name.replace(/,.*$/, '').trim().split(/\s+/).pop()?.toLowerCase() ?? '';

export function doubleCheck(a: { present: Present[]; added: Added[]; headcount: number; printedCovers?: number | undefined }): Finding[] {
  const out: Finding[] = [];
  const doctorsHere = a.present.filter((p) => p.id !== 'rep');

  if (a.printedCovers !== undefined && a.printedCovers !== a.headcount) {
    out.push(a.printedCovers > a.headcount
      ? { tone: 'ask', text: `The receipt prints ${a.printedCovers} covers but ${a.headcount} ${a.headcount === 1 ? 'person is' : 'people are'} marked. Add who else ate, or close out and compliance will check the difference.` }
      : { tone: 'ask', text: `The receipt prints ${a.printedCovers} covers but ${a.headcount} people are marked. Check that everyone marked actually ate.` });
  }

  for (const x of a.added) {
    if (x.kind === 'doctor') {
      out.push({ addedId: x.id, tone: 'review', text: `${x.name} was not on the invite. Compliance reviews it, and their share counts toward their annual total and an Open Payments row.` });
    } else if (x.kind === 'coworker') {
      out.push({ addedId: x.id, tone: 'ok', text: `${x.name} counts in the split as a coworker. No Open Payments row.` });
    } else {
      const namesake = doctorsHere.find((p) => lastName(p.name) && lastName(p.name) === lastName(x.name));
      if (namesake && x.relation !== 'spouse' && x.relation !== 'family') {
        out.push({ addedId: x.id, tone: 'ask', text: `${x.name} shares a last name with ${namesake.name}. Are they family? Set how they're related.` });
      }
      if (!x.withId) out.push({ addedId: x.id, tone: 'ask', text: `Who did ${x.name} come with?` });
      if (!x.relation) out.push({ addedId: x.id, tone: 'ask', text: `How is ${x.name} related to them?` });
      else if (x.relation === 'other' && !x.reason?.trim()) out.push({ addedId: x.id, tone: 'ask', text: `What was ${x.name}'s business reason for being there?` });
      else out.push({ addedId: x.id, tone: 'review', text: `${x.name} is not a clinician${x.relation === 'other' ? '' : ' and had no business reason to attend'}. Compliance reviews it under the HHS-OIG guest rule.` });
    }
  }
  return out;
}

export const needsAnswers = (f: Finding[]) => f.some((x) => x.tone === 'ask' && x.addedId !== undefined);

export function noteFor(x: Added, present: Present[]): string {
  if (x.kind === 'doctor') return `Added at close-out: ${x.name} (NPI ${x.npi}), not on the invite.`;
  if (x.kind === 'coworker') return `Added at close-out: ${x.name}, coworker.`;
  const withName = present.find((p) => p.id === x.withId)?.name ?? 'unknown';
  const rel = RELATIONS.find(([r]) => r === x.relation)?.[1].toLowerCase() ?? 'unknown';
  return `Added at close-out: ${x.name}, guest of ${withName} (${rel})${x.reason?.trim() ? `. Reason: ${x.reason.trim()}` : ''}.`;
}
