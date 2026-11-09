// The engine on the SHARED seed (packages/contract/fixtures), checked against every number in docs/decisions.md.
// If Cole's fixtures and the engine ever drift apart, this file fails.
import { describe, expect, it } from 'vitest';
import { Evaluation, Settlement, type Attendance, type ProgramPlan } from '@covers/contract';
import { fixtures, IDS } from '@covers/contract/fixtures';
import { evaluate, settle, type EngineSettings } from '../src/index';

const f = fixtures;
const settings: Partial<EngineSettings> = {
  perPersonCapCents: f.company.perPersonCapCents, defaultAnnualCapCents: f.company.annualCapCents,
  nearNumerator: f.company.nearThresholdPct, nearDenominator: 100, repeatTopicThreshold: f.company.repeatTopicFlagAt,
};
const demo = f.plans.find((p) => p.id === IDS.demoPlan)!;
const withoutRuvane: ProgramPlan = { ...demo, inviteeNpis: demo.inviteeNpis.filter((n) => n !== IDS.ruvane) };
const speakerOf = (p: ProgramPlan) => f.speakers.find((s) => s.id === p.speakerId) ?? null;
const input = (plan: ProgramPlan) => ({
  plan, speaker: speakerOf(plan), hcps: [...f.hcps, ...f.speakers.map((s) => s.hcp)],
  ledger: f.ledger.map((l) => ({ npi: l.npi, ytdCents: l.ytdCents, sameTopicCount12mo: l.sameTopicCount12mo })),
  history: [], settings, now: '2026-11-08T12:00:00-08:00',
});
const clean = f.sampleReceipts.find((r) => r.id === IDS.cleanReceipt)!;
const kinsaleNoShow: Attendance = {
  planId: IDS.demoPlan, attendedNpis: [IDS.patel, IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery],
  employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep,
};

describe('shared seed: before the dinner', () => {
  const ev = Evaluation.parse(evaluate(input(demo)));

  it('blocks the scripted plan: Dr. Ruvane $1,940 + $110 = $2,050 > $2,000, $60 left', () => {
    expect(ev.status).toBe('blocked');
    expect(ev.caps.find((c) => c.npi === IDS.ruvane)).toMatchObject({ ytdCents: 194_000, projectedCents: 205_000, capCents: 200_000, state: 'over', sameTopicCount12mo: 2 });
    const p4 = ev.checks.find((c) => c.packId === 'P4' && c.subject.kind === 'hcp' && c.subject.npi === IDS.ruvane);
    expect(p4).toMatchObject({ outcome: 'block' });
    expect(p4?.message).toContain('$60');
  });

  it('flags Dr. Ruvane for repeat attendance (third same-topic program)', () => {
    expect(ev.checks.some((c) => c.packId === 'P5' && c.outcome === 'flag' && c.subject.kind === 'hcp' && c.subject.npi === IDS.ruvane)).toBe(true);
  });

  it('blocks Dr. Ortwell as speaker (training expired)', () => {
    const ortwell = evaluate(input({ ...withoutRuvane, speakerId: IDS.ortwellSpeaker }));
    expect(ortwell.status).toBe('blocked');
    expect(ortwell.checks.find((c) => c.ruleId === 'P1.speaker-status')?.outcome).toBe('block');
  });

  it('clears once Dr. Ruvane is removed, with no other issues', () => {
    const cleared = evaluate(input(withoutRuvane));
    expect(cleared.status).toBe('cleared');
    expect(cleared.checks.filter((c) => c.outcome !== 'pass')).toEqual([]);
  });

  it('headcount for the fund is 5 invitees + speaker + 1 employee = 7 → $875 at $125', () => {
    expect((new Set(withoutRuvane.inviteeNpis).size + 1 + withoutRuvane.employeeCount) * f.company.perPersonCapCents).toBe(87_500);
  });
});

describe('shared seed: after the dinner (clean receipt, Dr. Kinsale no-show)', () => {
  const st = Settlement.parse(settle({ ...input(withoutRuvane), receipt: clean, attendance: kinsaleNoShow }));

  it('the clean sample is $612 for 6 covers and reconciles to the cent', () => {
    expect(clean.totalCents).toBe(61_200);
    expect(clean.printedCovers).toBe(6);
    expect(clean.lines.reduce((a, l) => a + l.amountCents, 0)).toBe(61_200);
  });

  it('splits $612 over 6 who ate: $102 each, nothing lost', () => {
    expect(st.headcount).toBe(6);
    expect(st.perPersonCents).toBe(10_200);
    expect(st.byPerson.every((p) => p.amountCents === 10_200)).toBe(true);
    expect(st.byPerson.reduce((a, p) => a + p.amountCents, 0)).toBe(61_200);
  });

  it('Dr. Kinsale: total unchanged, no Open Payments row', () => {
    const k = st.caps.find((c) => c.npi === IDS.kinsale)!;
    expect(k.projectedCents).toBe(k.ytdCents);
    expect(st.openPayments.some((r) => r.npi === IDS.kinsale)).toBe(false);
  });

  it('drafts rows for the 4 attending clinicians and the speaker, including the NP', () => {
    expect(st.openPayments.map((r) => r.npi).sort()).toEqual([IDS.okafor, IDS.lindqvist, IDS.brennick, IDS.ellery, IDS.patel].sort());
    expect(st.openPayments.find((r) => r.npi === IDS.brennick)?.recipientType).toBe('nurse_practitioner');
    expect(st.openPayments.every((r) => r.amountCents === 10_200 && r.reportable)).toBe(true);
  });

  it('flags the wine and nothing else on the clean receipt', () => {
    expect(st.exceptions.map((e) => e.ruleId)).toEqual(['P5.alcohol']);
  });
});

describe('shared seed: the other three dinners on the dashboard', () => {
  const plan = (id: string) => f.plans.find((p) => p.id === id)!;
  const problems = (id: string) => evaluate(input(plan(id))).checks.filter((c) => c.outcome !== 'pass').map((c) => c.ruleId);

  it('uses only seed people: every invitee and speaker is a fictional seed record', () => {
    const seeded = new Set([...f.hcps.map((h) => h.npi), ...f.speakers.map((s) => s.hcp.npi)]);
    for (const p of f.plans) {
      expect(p.repId, `${p.id}: the web sandbox always acts as ${IDS.rep}, so only that rep can confirm who came`).toBe(IDS.rep);
      expect(speakerOf(p), p.id).not.toBeNull();
      for (const npi of p.inviteeNpis) expect(seeded.has(npi), `${p.id} ${npi}`).toBe(true);
      expect(p.inviteeNpis, p.id).not.toContain(speakerOf(p)!.hcp.npi);
    }
  });

  it('clears Dr. Okafor on device safety and Dr. Lindqvist on vascular access with no issues', () => {
    for (const id of ['plan-okafor', 'plan-lindqvist']) {
      expect(evaluate(input(plan(id))).status, id).toBe('cleared');
      expect(problems(id), id).toEqual([]);
    }
  });

  it('blocks Dr. Ortwell on valve durability for one reason only: her speaker training expired', () => {
    expect(evaluate(input(plan('plan-ortwell'))).status).toBe('blocked');
    expect(problems('plan-ortwell')).toEqual(['P1.speaker-status']);
  });
});
