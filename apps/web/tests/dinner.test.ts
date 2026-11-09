import { describe, expect, it } from 'vitest';
import { IDS } from '@covers/contract/fixtures';
import { FixtureService } from '../lib/fixtures/fixture-service';
import { MemoryStore } from '../lib/store';
import { afterMark, beforeMark, openFlag, stepOf } from '../lib/dinner';

const rep = { sessionId: 's', actorId: IDS.rep };
const cmp = { sessionId: 's', actorId: IDS.compliance };
const id = IDS.demoPlan;

describe('the dinner moves through one screen', () => {
  it('runs from propose to report on the scripted story', async () => {
    const svc = new FixtureService(new MemoryStore());
    const at = async (role: 'rep' | 'compliance' = 'rep') => stepOf(await svc.getPlan(rep, id), await svc.getReceipt(rep, id), await svc.getSettlement(rep, id), role);
    expect(await at()).toBe(0);

    const blocked = await svc.evaluatePlan(rep, id);
    expect(await at()).toBe(1);
    expect(beforeMark('P4', blocked)).toBe('blocked');
    expect(beforeMark('P5', blocked)).toBe('flagged');
    expect(beforeMark('P1', blocked)).toBe('clear');
    expect(beforeMark('P6', blocked)).toBe('none');

    const { plan } = await svc.getPlan(rep, id);
    await svc.updatePlan(rep, id, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== IDS.ruvane) });
    const cleared = await svc.evaluatePlan(rep, id);
    expect(beforeMark('P4', cleared)).toBe('clear');
    expect(await at()).toBe(2);

    expect((await svc.issueFund(rep, id)).limitCents).toBe(87500);
    expect(await at()).toBe(3);

    const receipt = await svc.submitReceipt(rep, id, { sampleId: IDS.cleanReceipt });
    expect(await at()).toBe(4);

    const invited = (await svc.getPlan(rep, id)).plan.inviteeNpis.filter((n) => n !== IDS.kinsale);
    const st = await svc.confirmAttendance(rep, { planId: id, attendedNpis: [...invited, IDS.patel], employeesPresent: 1, extraGuests: 0, confirmedBy: IDS.rep });
    expect(st.perPersonCents).toBe(10200);
    expect(await at()).toBe(5);
    expect(await at('compliance')).toBe(6);
    expect(afterMark('P5', st, receipt)).toBe('flagged');
    expect(afterMark('P6', st, receipt)).toBe('clear');
    expect(afterMark('P1', st, receipt)).toBe('none');

    const flag = openFlag(cleared, st)!;
    await expect(svc.approveException(rep, id, flag.id, 'no')).rejects.toMatchObject({ code: 'forbidden' });
    await svc.approveException(cmp, id, flag.id, 'One bottle, within policy.');

    const after = (await svc.getSettlement(rep, id))!;
    expect(openFlag(cleared, after)).toBeUndefined();
    expect(afterMark('P5', after, receipt)).toBe('clear');
    expect((await svc.getPlan(rep, id)).plan.status).toBe('closed');
    expect(await at()).toBe(6);
  });
});
