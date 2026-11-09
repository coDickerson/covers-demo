// After the dinner: split the bill, update caps, run after-dinner rules, draft Open Payments rows.
import { CoversError, type CapStatus, type OpenPaymentsRow, type Settlement } from '@covers/contract';
import { cite } from './citations';
import { Checks, capFor, capState, displayName, indexBy, sameTopicHistory, unique } from './common';
import { localDate } from './dates';
import { divideRounded, formatCents, splitEvenly } from './money';
import { resolveSettings } from './settings';
import type { SettleInput } from './types';

export function settle(input: SettleInput): Settlement {
  const s = resolveSettings(input.settings);
  const { plan, speaker, receipt, attendance: att } = input;
  if (att.planId !== plan.id) throw new CoversError('validation', `Attendance is for plan ${att.planId}, not ${plan.id}.`);
  if (receipt.planId !== plan.id) throw new CoversError('validation', `Receipt is for plan ${receipt.planId}, not ${plan.id}.`);
  if (unique(att.attendedNpis).length !== att.attendedNpis.length) throw new CoversError('validation', 'An attendee is listed twice.');

  const headcount = att.attendedNpis.length + att.employeesPresent + att.extraGuests;
  if (headcount === 0) throw new CoversError('validation', 'Nobody is marked as having eaten.');

  const hcps = indexBy(input.hcps, (h) => h.npi);
  const ledger = indexBy(input.ledger, (l) => l.npi);
  const checks = new Checks(new Set(s.enabledPacks));
  const dinnerDate = localDate(plan.date);
  const total = receipt.totalCents;

  // ---- Split: everyone who ate, largest remainder, leftover cents to the lowest ids ----
  const employeeIds = Array.from({ length: att.employeesPresent }, (_, i) => `employee:${i + 1}`);
  const guestIds = Array.from({ length: att.extraGuests }, (_, i) => `guest:${i + 1}`);
  const shares = splitEvenly(total, [...att.attendedNpis, ...employeeIds, ...guestIds]);
  const shareOf = new Map(shares.map((x) => [x.id, x.amountCents]));
  const byPerson = shares.map(({ id, amountCents }) => {
    if (id.startsWith('employee:')) return { who: `Employee ${id.slice(9)}`, amountCents };
    if (id.startsWith('guest:')) return { who: `Guest ${id.slice(6)}`, amountCents };
    return { who: displayName(id, hcps), npi: id, amountCents };
  });

  // ---- Receipt integrity (P6) ----
  const linesSum = receipt.lines.reduce((a, l) => a + l.amountCents, 0);
  const off = Math.abs(linesSum - total);
  checks.add('P6.reconcile', { kind: 'plan' }, off <= s.reconcileToleranceCents ? 'pass' : 'flag',
    off <= s.reconcileToleranceCents ? `Receipt lines add up to the printed ${formatCents(total)}.`
      : `Receipt lines add up to ${formatCents(linesSum)} but the printed total is ${formatCents(total)}.`, [`receipt:${receipt.id}`]);
  // The card charge read from Ramp should equal the printed total. A simulated charge is the printed total, so it is not checked.
  if (input.charge?.source === 'ramp') {
    const ok = input.charge.amountCents === total;
    checks.add('P6.card-charge', { kind: 'plan' }, ok ? 'pass' : 'flag',
      ok ? `The card charge of ${formatCents(input.charge.amountCents)} matches the printed total.`
        : `The card was charged ${formatCents(input.charge.amountCents)} but the receipt's printed total is ${formatCents(total)}.`,
      [`receipt:${receipt.id}`, ...(input.charge.transactionId ? [`ramp:${input.charge.transactionId}`] : [])]);
  }
  // The charge should be at a restaurant. Ramp stores a restaurants-only restriction but the sandbox does not enforce it.
  if (input.charge?.source === 'ramp' && input.charge.categoryId !== undefined) {
    const ok = s.restaurantCategoryIds.includes(input.charge.categoryId);
    const where = `${input.charge.merchantName || 'the merchant'} (${input.charge.categoryName || `category ${input.charge.categoryId}`})`;
    checks.add('P6.card-merchant', { kind: 'plan' }, ok ? 'pass' : 'flag',
      ok ? `The card was charged at ${where}, a restaurant.` : `The card was charged at ${where}, which is not a restaurant.`,
      input.charge.transactionId ? [`ramp:${input.charge.transactionId}`] : []);
  }
  if (receipt.printedCovers !== undefined) {
    const ok = receipt.printedCovers === headcount;
    checks.add('P6.covers', { kind: 'plan' }, ok ? 'pass' : 'flag',
      ok ? `Receipt prints ${receipt.printedCovers} covers, matching ${headcount} who ate.`
        : `Receipt prints ${receipt.printedCovers} covers but ${headcount} people are marked as having eaten; confirm who else came.`,
      [`receipt:${receipt.id}`]);
  }
  for (const line of receipt.lines) {
    if (line.confidence < s.confidenceGate) {
      checks.add('P6.line-confidence', { kind: 'line', lineId: line.id }, 'flag',
        `"${line.text}" (${formatCents(line.amountCents)}) was hard to read; confirm it.`, [`receipt:${receipt.id}`]);
    }
  }

  // ---- P3 actual per person (exception after the dinner) ----
  const overCap = total > s.perPersonCapCents * headcount;
  const perPersonCents = divideRounded(total, headcount);
  checks.add('P3.per-person-actual', { kind: 'plan' }, overCap ? 'flag' : 'pass',
    `Actual ${formatCents(perPersonCents)} per person is ${overCap ? 'over' : 'within'} the ${formatCents(s.perPersonCapCents)} cap.`,
    [`receipt:${receipt.id}`]);

  // ---- P5 alcohol and non-HCP guests ----
  for (const line of receipt.lines) {
    if (line.category === 'alcohol') {
      checks.add('P5.alcohol', { kind: 'line', lineId: line.id }, 'flag', `Alcohol on the receipt: "${line.text}" (${formatCents(line.amountCents)}).`, [`receipt:${receipt.id}`]);
    }
  }
  const nonHcpAttendees = att.attendedNpis.filter((n) => hcps.get(n)?.recipientType === 'non_hcp');
  if (att.extraGuests > 0 || nonHcpAttendees.length > 0) {
    const n = att.extraGuests + nonHcpAttendees.length;
    checks.add('P5.non-hcp-guest', { kind: 'plan' }, 'flag', `${n} guest${n === 1 ? '' : 's'} at the dinner ${n === 1 ? 'is' : 'are'} not a clinician (for example a spouse).`,
      nonHcpAttendees.map((x) => `hcp:${x}`));
  }

  // ---- Caps: invitees and speaker always shown (no-shows hold still), plus anyone else who ate ----
  const speakerNpi = speaker?.hcp.npi;
  const expected = unique([...plan.inviteeNpis, ...(speakerNpi ? [speakerNpi] : [])]);
  const attended = new Set(att.attendedNpis);
  const caps: CapStatus[] = [];
  const openPayments: OpenPaymentsRow[] = [];

  for (const npi of unique([...expected, ...att.attendedNpis])) {
    const { capCents, ytdCents, priorRepeats } = capFor(npi, ledger, s);
    const share = attended.has(npi) ? shareOf.get(npi)! : 0;
    const projectedCents = ytdCents + share;
    const state = capState(projectedCents, capCents, s);
    const repeats = sameTopicHistory(npi, plan.topic, dinnerDate, plan.id, input.history);
    const repeatCount = priorRepeats + repeats.length;
    caps.push({ npi, capCents, ytdCents, projectedCents, state, sameTopicCount12mo: repeatCount });
    if (!attended.has(npi)) continue;

    const h = hcps.get(npi);
    const name = displayName(npi, hcps);
    if (!h) {
      checks.add('P2.identity', { kind: 'hcp', npi }, 'flag', `NPI ${npi} ate at the dinner but does not match a known clinician.`, [`npi:${npi}`]);
    }
    if (!expected.includes(npi)) {
      checks.add('P2.uninvited', { kind: 'hcp', npi }, 'flag', `${name} ate at the dinner but was not on the plan.`, [`npi:${npi}`]);
    }
    checks.add('P4.annual-cap', { kind: 'hcp', npi }, state === 'over' ? 'flag' : 'pass',
      state === 'over' ? `${name}'s share brings the year to ${formatCents(projectedCents)}, over the ${formatCents(capCents)} cap.`
        : `${name}: ${formatCents(projectedCents)} of ${formatCents(capCents)} annual cap.`, [`ledger:${npi}`]);
    if (npi !== speakerNpi && repeatCount >= s.repeatTopicThreshold) {
      checks.add('P5.repeat-attendance', { kind: 'hcp', npi }, 'flag',
        `${name} attended ${repeatCount} earlier programs on this topic in the last 12 months.`, repeats.map((id) => `plan:${id}`));
    }

    // ---- P6 Open Payments draft: covered recipients who ate ----
    if (h && h.recipientType !== 'non_hcp' && s.enabledPacks.includes('P6')) {
      const op = s.openPayments;
      const reportable = share >= op.smallPaymentCents || projectedCents > op.aggregateCents;
      openPayments.push({
        npi, recipientType: h.recipientType, date: dinnerDate, natureOfPayment: 'food_and_beverage', formOfPayment: 'in_kind',
        amountCents: share, reportable,
        reason: reportable
          ? share >= op.smallPaymentCents
            ? `${formatCents(share)} meets the ${op.programYear} per-payment threshold of ${formatCents(op.smallPaymentCents)}.`
            : `Under ${formatCents(op.smallPaymentCents)}, but the year's total of ${formatCents(projectedCents)} exceeds ${formatCents(op.aggregateCents)}.`
          : `${formatCents(share)} is under ${formatCents(op.smallPaymentCents)} and the year's total stays at or under ${formatCents(op.aggregateCents)}.`,
        citation: cite('P6.open-payments'),
      });
    }
  }

  const all = checks.list;
  return {
    planId: plan.id, perPersonCents, headcount, byPerson, checks: all, caps, openPayments,
    exceptions: all.filter((c) => c.outcome !== 'pass'),
    ...(input.charge ? { charge: input.charge } : {}),
  };
}
