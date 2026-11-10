import { describe, expect, it } from 'vitest';
import { guardCall } from '../lib/guards';

const now = new Date('2026-11-10T10:00:00-08:00');
const npis = (n: number) => Array.from({ length: n }, (_, i) => `90000000${String(i).padStart(2, '0')}`);
const none = async () => undefined;
const speaker = async () => '9000000101';

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
  it('leaves edits without those fields and other methods alone', async () => {
    await expect(guardCall('updatePlan', ['p', { venue: 'Tosca Cafe' }], speaker, now)).resolves.toBeUndefined();
    await expect(guardCall('issueFund', ['p'], speaker, now)).resolves.toBeUndefined();
  });
});
