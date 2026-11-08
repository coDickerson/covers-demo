// Stub rule math for FixtureService: just enough of P1–P6 for judge-created plans and the scripted dinner.
// The real engine is Person A's packages/engine; this never imports it. Numbers follow docs/decisions.md.
import type { Attendance, CapStatus, CheckResult, Citation, Evaluation, OpenPaymentsRow, ProgramPlan, Receipt, Settlement } from '@covers/contract';
import type { Fixtures } from '@covers/contract/fixtures';

export type Approval = NonNullable<CheckResult['approval']>;

type Seedish = Pick<Fixtures, 'company' | 'speakers' | 'hcps' | 'citations'> & { ledger: Fixtures['ledger'] };

const citation = (seed: Seedish, packId: string): Citation =>
  seed.citations[packId] ?? { label: `Pack ${packId}`, packId, ruleId: `${packId}.rule`, version: '1.0.0' };

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function capState(projected: number, cap: number, nearPct: number): CapStatus['state'] {
  if (projected > cap) return 'over';
  if (projected > (cap * nearPct) / 100) return 'near';
  return 'ok';
}

export function hcpName(seed: Seedish, npi: string): string {
  return seed.hcps.find((h) => h.npi === npi)?.name ?? seed.speakers.find((s) => s.hcp.npi === npi)?.hcp.name ?? `NPI ${npi}`;
}

export function evaluatePlan(
  seed: Seedish,
  plan: ProgramPlan,
  approvals: Record<string, Approval>,
  now: string,
): Evaluation {
  const { perPersonCapCents: perPersonCap, annualCapCents: annualCap, nearThresholdPct, repeatTopicFlagAt } = seed.company;
  const checks: CheckResult[] = [];
  const add = (c: Omit<CheckResult, 'id' | 'citation' | 'ruleId'> & { key: string }) => {
    const cit = citation(seed, c.packId);
    const id = `${plan.id}:${cit.ruleId}:${c.key}`;
    const { key: _key, ...rest } = c;
    const approval = c.outcome === 'flag' ? approvals[id] : undefined;
    checks.push({ ...rest, id, ruleId: cit.ruleId, citation: cit, ...(approval ? { approval } : {}) });
  };

  // P1 speaker eligibility
  const speaker = seed.speakers.find((s) => s.id === plan.speakerId);
  const dinnerDate = plan.date.slice(0, 10);
  const p1Problem = !speaker
    ? 'The speaker is not on the roster.'
    : speaker.status === 'training_expired'
      ? `${speaker.hcp.name}'s speaker training has expired.`
      : speaker.status === 'not_contracted'
        ? `${speaker.hcp.name} is not under a speaker contract.`
        : !speaker.approvedTopics.includes(plan.topic)
          ? `${speaker.hcp.name} is not approved to speak on "${plan.topic}".`
          : speaker.contractEnds < dinnerDate
            ? `${speaker.hcp.name}'s contract ends before the dinner.`
            : null;
  add({
    key: 'plan', packId: 'P1', subject: { kind: 'plan' },
    outcome: p1Problem ? 'block' : 'pass',
    message: p1Problem ?? `${speaker!.hcp.name} is approved to speak on ${plan.topic}.`,
    evidence: speaker ? [speaker.id] : [],
  });

  // P3 per-person cap (before the dinner: block)
  const overPerPerson = plan.estimatedPerPerson > perPersonCap;
  add({
    key: 'plan', packId: 'P3', subject: { kind: 'plan' },
    outcome: overPerPerson ? 'block' : 'pass',
    message: overPerPerson
      ? `Estimated ${usd(plan.estimatedPerPerson)} per person is over the ${usd(perPersonCap)} cap.`
      : `Estimated ${usd(plan.estimatedPerPerson)} per person is within the ${usd(perPersonCap)} cap.`,
    evidence: ['company'],
  });

  // P2 identity, P4 annual cap, P5 repeat attendance — per invitee; P4 also for the speaker.
  const caps: CapStatus[] = [];
  const people = [...plan.inviteeNpis, ...(speaker ? [speaker.hcp.npi] : [])];
  for (const npi of people) {
    const isInvitee = plan.inviteeNpis.includes(npi);
    const known = seed.hcps.some((h) => h.npi === npi) || seed.speakers.some((s) => s.hcp.npi === npi);
    const name = hcpName(seed, npi);
    if (isInvitee) {
      add({
        key: npi, packId: 'P2', subject: { kind: 'hcp', npi },
        outcome: known ? 'pass' : 'flag',
        message: known ? `${name} is identified by NPI ${npi}.` : `NPI ${npi} could not be confirmed.`,
        evidence: [npi],
      });
    }

    const ledger = seed.ledger.find((l) => l.npi === npi) ?? { npi, ytdCents: 0, sameTopicCount12mo: 0 };
    const projected = ledger.ytdCents + plan.estimatedPerPerson;
    const state = capState(projected, annualCap, nearThresholdPct);
    caps.push({ npi, capCents: annualCap, ytdCents: ledger.ytdCents, projectedCents: projected, state, sameTopicCount12mo: ledger.sameTopicCount12mo });
    add({
      key: npi, packId: 'P4', subject: { kind: 'hcp', npi },
      outcome: state === 'over' ? 'block' : state === 'near' ? 'flag' : 'pass',
      message:
        state === 'over'
          ? `${name} is ${usd(annualCap - ledger.ytdCents)} from the ${usd(annualCap)} annual limit; this dinner would pass it.`
          : state === 'near'
            ? `${name} would be at ${usd(projected)} of ${usd(annualCap)} this year.`
            : `${name} stays under the annual limit.`,
      evidence: [`ledger:${npi}`],
    });

    if (isInvitee && ledger.sameTopicCount12mo >= repeatTopicFlagAt) {
      add({
        key: npi, packId: 'P5', subject: { kind: 'hcp', npi },
        outcome: 'flag',
        message: `${name} has attended ${ledger.sameTopicCount12mo} programs on this topic in the last 12 months.`,
        evidence: [`ledger:${npi}`],
      });
    }
  }

  const status = checks.some((c) => c.outcome === 'block')
    ? 'blocked'
    : checks.some((c) => c.outcome === 'flag' && !c.approval)
      ? 'needs_approval'
      : 'cleared';
  return { planId: plan.id, status, checks, caps, evaluatedAt: now };
}

/** Largest-remainder split: leftover cents go to people in ascending order of id. */
export function split(totalCents: number, ids: string[]): Map<string, number> {
  const base = Math.floor(totalCents / ids.length);
  let leftover = totalCents - base * ids.length;
  const out = new Map<string, number>();
  for (const id of [...ids].sort()) {
    out.set(id, base + (leftover > 0 ? 1 : 0));
    if (leftover > 0) leftover--;
  }
  return out;
}

export function settlePlan(seed: Seedish, plan: ProgramPlan, receipt: Receipt, a: Attendance): Settlement {
  const { perPersonCapCents: perPersonCap, annualCapCents: annualCap, nearThresholdPct } = seed.company;
  const employees = Array.from({ length: a.employeesPresent }, (_, i) => (i === 0 ? plan.repId : `employee-${i + 1}`));
  const guests = Array.from({ length: a.extraGuests }, (_, i) => `guest-${i + 1}`);
  const ids = [...a.attendedNpis, ...employees, ...guests];
  const shares = split(receipt.totalCents, ids);
  const headcount = ids.length;
  const perPersonCents = Math.round(receipt.totalCents / headcount);

  const byPerson = [...shares.entries()].map(([who, amountCents]) =>
    a.attendedNpis.includes(who) ? { who, npi: who, amountCents } : { who, amountCents },
  );

  const checks: CheckResult[] = [];
  const add = (c: Omit<CheckResult, 'id' | 'citation' | 'ruleId'> & { key: string }) => {
    const cit = citation(seed, c.packId);
    const { key, ...rest } = c;
    checks.push({ ...rest, id: `${plan.id}:after:${cit.ruleId}:${key}`, ruleId: cit.ruleId, citation: cit });
  };

  // P3 after the dinner: over the cap is an exception for compliance (a flag), not a block.
  add({
    key: 'plan', packId: 'P3', subject: { kind: 'plan' },
    outcome: perPersonCents > perPersonCap ? 'flag' : 'pass',
    message: perPersonCents > perPersonCap
      ? `Actual ${usd(perPersonCents)} per person is over the ${usd(perPersonCap)} cap.`
      : `Actual ${usd(perPersonCents)} per person is within the ${usd(perPersonCap)} cap.`,
    evidence: [receipt.id],
  });
  // P5 alcohol lines and non-HCP guests
  for (const line of receipt.lines.filter((l) => l.category === 'alcohol')) {
    add({ key: line.id, packId: 'P5', subject: { kind: 'line', lineId: line.id }, outcome: 'flag', message: `Alcohol on the receipt: ${line.text}.`, evidence: [receipt.id] });
  }
  if (a.extraGuests > 0) {
    add({ key: 'guests', packId: 'P5', subject: { kind: 'plan' }, outcome: 'flag', message: `${a.extraGuests} non-HCP guest(s) ate at the dinner.`, evidence: [] });
  }

  // P6 Open Payments rows for covered recipients who attended
  const date = plan.date.slice(0, 10);
  const openPayments: OpenPaymentsRow[] = [];
  const caps: CapStatus[] = [];
  for (const npi of a.attendedNpis) {
    const hcp = seed.hcps.find((h) => h.npi === npi) ?? seed.speakers.find((s) => s.hcp.npi === npi)?.hcp;
    const amountCents = shares.get(npi)!;
    if (hcp && hcp.recipientType !== 'non_hcp') {
      openPayments.push({
        npi, recipientType: hcp.recipientType, date, natureOfPayment: 'food_and_beverage', formOfPayment: 'in_kind',
        amountCents, reportable: true, reason: 'Covered recipient who attended. Drafted, humans file.', citation: citation(seed, 'P6'),
      });
    }
    const ytd = (seed.ledger.find((l) => l.npi === npi)?.ytdCents ?? 0) + amountCents;
    const repeat = (seed.ledger.find((l) => l.npi === npi)?.sameTopicCount12mo ?? 0) + 1;
    caps.push({ npi, capCents: annualCap, ytdCents: ytd, projectedCents: ytd, state: capState(ytd, annualCap, nearThresholdPct), sameTopicCount12mo: repeat });
  }

  return {
    planId: plan.id, perPersonCents, headcount, byPerson, checks, caps, openPayments,
    exceptions: checks.filter((c) => c.outcome === 'flag'),
  };
}
