import { describe, expect, it } from 'vitest';
import { addedAtCloseOut, guardAdded, guardCall, paddingFinding } from '../lib/guards';

describe('server-side close-out checks', () => {
  const plan = { inviteeNpis: ['9000000003', '9000000004'], employeeCount: 1 };
  it('counts uninvited doctors, extra employees and guests, not the speaker or invitees', () => {
    expect(addedAtCloseOut({ attendedNpis: ['9000000003', '9000000101', '1234567893'], employeesPresent: 3, extraGuests: 2 }, plan, '9000000101')).toBe(1 + 2 + 2);
  });
  it('refuses more than 10 added people', () => {
    expect(() => guardAdded(11)).toThrow(/Up to 10/);
    expect(() => guardAdded(10)).not.toThrow();
  });
  it('finds padding only when the added people pull the cost under the cap', () => {
    expect(paddingFinding(90_000, 8, 2, 12_500)).toContain('from $150.00 to $112.50');
    expect(paddingFinding(61_200, 8, 2, 12_500)).toBeNull();
    expect(paddingFinding(90_000, 6, 0, 12_500)).toBeNull();
  });
});

const now = new Date('2026-11-10T10:00:00-08:00');
const npis = (n: number) => Array.from({ length: n }, (_, i) => `90000000${String(i).padStart(2, '0')}`);
const none = async () => ({});
const speaker = async () => ({ speakerNpi: '9000000101', inviteeNpis: ['9000000003', '9000000101'] });

describe('guardCall', () => {
  it('refuses a $0 and a $1M estimate', async () => {
    await expect(guardCall('createPlan', [{ estimatedPerPerson: 0, inviteeNpis: npis(3) }], none, now)).rejects.toThrow(/above \$0/);
    await expect(guardCall('updatePlan', ['p', { estimatedPerPerson: 100_000_000 }], none, now)).rejects.toThrow(/over \$10,000/);
  });
  it('refuses 0 and 21 invitees, allows 20', async () => {
    await expect(guardCall('createPlan', [{ inviteeNpis: [] }], none, now)).rejects.toThrow(/at least one/);
    await expect(guardCall('updatePlan', ['p', { inviteeNpis: npis(21) }], none, now)).rejects.toThrow(/up to 20/);
    await expect(guardCall('updatePlan', ['p', { inviteeNpis: npis(20) }], none, now)).resolves.toBeUndefined();
  });
  it('refuses a past date, allows today and later', async () => {
    await expect(guardCall('updatePlan', ['p', { date: '2025-11-12T19:00:00-08:00' }], none, now)).rejects.toThrow(/has passed/);
    await expect(guardCall('updatePlan', ['p', { date: '2026-11-10T19:00:00-08:00' }], none, now)).resolves.toBeUndefined();
  });
  it('refuses inviting the speaker, who is already counted', async () => {
    await expect(guardCall('updatePlan', ['p', { inviteeNpis: ['9000000003', '9000000101'] }], speaker, now)).rejects.toThrow(/speaker is already at the table/);
    await expect(guardCall('updatePlan', ['p', { inviteeNpis: ['9000000003'] }], speaker, now)).resolves.toBeUndefined();
  });
  it('refuses swapping in a speaker who is already on the current invite list', async () => {
    await expect(guardCall('updatePlan', ['p', { speakerId: 'spk-patel' }], speaker, now)).rejects.toThrow(/speaker is already at the table/);
  });
  it('leaves edits without those fields and other methods alone', async () => {
    await expect(guardCall('updatePlan', ['p', { venue: 'Tosca Cafe' }], speaker, now)).resolves.toBeUndefined();
    await expect(guardCall('issueFund', ['p'], speaker, now)).resolves.toBeUndefined();
  });
});
