// getService() must not keep a failed live start: after a database outage the next request tries again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createLiveService = vi.fn();
vi.mock('../lib/live', () => ({ createLiveService: () => createLiveService() }));

const g = globalThis as typeof globalThis & { __coversService?: unknown };

describe('getService in live mode', () => {
  beforeEach(() => {
    vi.stubEnv('COVERS_MODE', 'live');
    g.__coversService = undefined;
    createLiveService.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    g.__coversService = undefined;
  });

  it('retries after a failed start instead of failing forever', async () => {
    const { getService } = await import('../lib/service');
    const live = { name: 'live' };
    createLiveService.mockRejectedValueOnce(new Error('tenant/user not found')).mockResolvedValueOnce(live);

    await expect(getService()).rejects.toThrow('tenant/user not found');
    await Promise.resolve(); // let the cleanup run
    await expect(getService()).resolves.toBe(live);
    expect(createLiveService).toHaveBeenCalledTimes(2);
  });

  it('keeps a successful start', async () => {
    const { getService } = await import('../lib/service');
    createLiveService.mockResolvedValue({ name: 'live' });

    const first = await getService();
    expect(await getService()).toBe(first);
    expect(createLiveService).toHaveBeenCalledTimes(1);
  });
});
