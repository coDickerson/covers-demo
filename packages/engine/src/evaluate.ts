// Before the dinner: packs P1–P5 over a plan. Pure function of its input.
import type { CapStatus, CheckResult, Evaluation, PlanStatus } from '@covers/contract';
import { Checks, capFor, capState, displayName, indexBy, sameTopic, sameTopicHistory, unique } from './common';
import { dayNumber, localDate } from './dates';
import { formatCents } from './money';
import { resolveSettings } from './settings';
import type { Approval, EvaluateInput } from './types';
import { customCitation, planFacts, ruleMatches } from './custom';

export function evaluate(input: EvaluateInput): Evaluation {
  const s = resolveSettings(input.settings);
  const { plan, speaker } = input;
  const hcps = indexBy(input.hcps, (h) => h.npi);
  const ledger = indexBy(input.ledger, (l) => l.npi);
  const checks = new Checks(new Set(s.enabledPacks));
  const dinnerDate = localDate(plan.date);

  // ---- P1 speaker eligibility (plan-level, blocks) ----
  if (!speaker || speaker.id !== plan.speakerId) {
    checks.add('P1.speaker-status', { kind: 'plan' }, 'block', `Speaker ${plan.speakerId} is not on the speaker roster.`, [`speaker:${plan.speakerId}`]);
  } else {
    const ev = [`speaker:${speaker.id}`];
    const statusText = { approved: 'approved', training_expired: 'not approved: training expired', not_contracted: 'not under contract' }[speaker.status];
    checks.add('P1.speaker-status', { kind: 'plan' }, speaker.status === 'approved' ? 'pass' : 'block',
      `${speaker.hcp.name} is ${statusText}.`, ev);

    const topicOk = speaker.approvedTopics.some((t) => sameTopic(t, plan.topic));
    checks.add('P1.topic', { kind: 'plan' }, topicOk ? 'pass' : 'block',
      topicOk ? `"${plan.topic.trim()}" is an approved topic for ${speaker.hcp.name}.`
        : `"${plan.topic.trim()}" is not on ${speaker.hcp.name}'s approved topics.`, ev);

    const active = dayNumber(dinnerDate) <= dayNumber(speaker.contractEnds);
    checks.add('P1.contract-active', { kind: 'plan' }, active ? 'pass' : 'block',
      active ? `${speaker.hcp.name}'s contract runs through ${speaker.contractEnds}.`
        : `${speaker.hcp.name}'s contract ended ${speaker.contractEnds}, before the dinner on ${dinnerDate}.`, ev);
  }

  // ---- P2 identity (per invitee, flags) ----
  const invitees = unique(plan.inviteeNpis);
  if (invitees.length !== plan.inviteeNpis.length) {
    const dups = unique(plan.inviteeNpis.filter((n, i) => plan.inviteeNpis.indexOf(n) !== i));
    checks.add('P2.duplicate-invitee', { kind: 'plan' }, 'flag',
      `${dups.map((n) => displayName(n, hcps)).join(', ')} listed more than once.`, dups.map((n) => `npi:${n}`));
  }
  for (const npi of invitees) {
    const h = hcps.get(npi);
    checks.add('P2.identity', { kind: 'hcp', npi }, h ? 'pass' : 'flag',
      h ? `${h.name} identified by NPI ${npi} (${h.recipientType.replace(/_/g, ' ')}).`
        : `NPI ${npi} does not match a known clinician; pick the right person before the dinner.`,
      [h ? `hcp:${npi}` : `npi:${npi}`]);
  }

  // ---- P3 per-person cap (plan-level, blocks) ----
  const estOk = plan.estimatedPerPerson <= s.perPersonCapCents;
  checks.add('P3.per-person-estimate', { kind: 'plan' }, estOk ? 'pass' : 'block',
    `Estimated ${formatCents(plan.estimatedPerPerson)} per person is ${estOk ? 'within' : 'over'} the ${formatCents(s.perPersonCapCents)} cap.`);

  // ---- Caps: every invitee plus the speaker, who also eats ----
  const diners = unique([...invitees, ...(speaker ? [speaker.hcp.npi] : [])]);
  const caps: CapStatus[] = [];
  for (const npi of diners) {
    const { capCents, ytdCents, priorRepeats } = capFor(npi, ledger, s);
    const projectedCents = ytdCents + plan.estimatedPerPerson;
    const repeats = sameTopicHistory(npi, plan.topic, dinnerDate, plan.id, input.history);
    const repeatCount = priorRepeats + repeats.length;
    const state = capState(projectedCents, capCents, s);
    caps.push({ npi, capCents, ytdCents, projectedCents, state, sameTopicCount12mo: repeatCount });

    // ---- P4 annual cap (block over, flag near) ----
    const name = displayName(npi, hcps);
    const left = Math.max(0, capCents - ytdCents);
    const message = state === 'over'
      ? `${name}: this dinner would bring the year to ${formatCents(projectedCents)} against a ${formatCents(capCents)} annual cap; only ${formatCents(left)} remains.`
      : state === 'near'
        ? `${name}: ${formatCents(projectedCents)} of ${formatCents(capCents)} annual cap after this dinner (above 80%).`
        : `${name}: ${formatCents(projectedCents)} of ${formatCents(capCents)} annual cap after this dinner.`;
    checks.add('P4.annual-cap', { kind: 'hcp', npi }, state === 'over' ? 'block' : state === 'near' ? 'flag' : 'pass', message, [`ledger:${npi}`]);

    // ---- P5 repeat attendance (invitees only; the speaker presents) ----
    if (invitees.includes(npi)) {
      const flagged = repeatCount >= s.repeatTopicThreshold;
      checks.add('P5.repeat-attendance', { kind: 'hcp', npi }, flagged ? 'flag' : 'pass',
        flagged ? `${name} already attended ${repeatCount} programs on this topic in the last 12 months.`
          : `${name}: ${repeatCount} same-topic program${repeatCount === 1 ? '' : 's'} in the last 12 months.`,
        [...repeats.map((id) => `plan:${id}`), ...(priorRepeats > 0 ? [`ledger:${npi}`] : [])]);
    }
  }

  // ---- Promoted Pack-lab packs: compiled by a model, applied here by code ----
  const facts = planFacts(plan);
  for (const p of input.customPacks ?? []) {
    for (const r of p.compiled.rules) {
      const hit = ruleMatches(r, facts);
      checks.addCustom(p.id, `${p.id}.${r.id}`, hit ? r.outcome : 'pass', hit ? r.message : `Does not apply: ${r.message}`, customCitation(p, r.id));
    }
  }

  // Approved flags carry who approved them. Blocks and the rep's own approvals are ignored.
  const approvals = (input.approvals ?? []).filter((a) => a.by !== plan.repId);
  const byCheck = new Map(approvals.map((a) => [a.checkId, a]));
  const finalChecks = checks.list.map((c) => {
    const a = c.outcome === 'flag' ? byCheck.get(c.id) : undefined;
    return a ? { ...c, approval: { by: a.by, note: a.note, at: a.at } } : c;
  });
  return { planId: plan.id, status: statusOf(finalChecks, approvals, plan.repId), checks: finalChecks, caps, evaluatedAt: input.now };
}

/** Any block → blocked; else any unapproved flag → needs_approval; else cleared. Reps cannot approve their own plan. */
export function statusOf(checks: readonly CheckResult[], approvals: readonly Approval[], repId: string): PlanStatus {
  const approved = new Set(approvals.filter((a) => a.by !== repId).map((a) => a.checkId));
  if (checks.some((c) => c.outcome === 'block')) return 'blocked';
  if (checks.some((c) => c.outcome === 'flag' && !approved.has(c.id))) return 'needs_approval';
  return 'cleared';
}
