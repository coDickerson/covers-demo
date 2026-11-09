// Replay mode (COVERS_CACHE=1) with a call nobody recorded: the judge gets a readable 409, not a 500.
// Runs against a real Postgres. Set TEST_DATABASE_URL; skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { CoversError } from '@covers/contract';
import { createLiveServiceFromEnv } from '../src/from-env';

const url = process.env.TEST_DATABASE_URL;
const ctx = { sessionId: `test-${Math.random().toString(36).slice(2)}`, actorId: 'rep-jordan-lee' };

describe.skipIf(!url)('replay mode: unrecorded calls', () => {
  let live: Awaited<ReturnType<typeof createLiveServiceFromEnv>>;
  beforeAll(async () => {
    live = await createLiveServiceFromEnv({
      DATABASE_URL: url, COVERS_CACHE: '1', COVERS_CACHE_DIR: join(__dirname, '../../../cache'), ANTHROPIC_API_KEY: undefined,
    });
  });
  afterAll(async () => { await live?.close(); });

  it('an unrecorded registry search is invalid_state with a message, not a crash', async () => {
    const err = await live.service.searchHcps(ctx, 'Zzyzx Notrecorded').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CoversError);
    expect((err as CoversError).code).toBe('invalid_state');
    expect((err as CoversError).message).toMatch(/Replaying recorded responses/);
  });

  it('the recorded search still replays', async () => {
    const found = await live.service.searchHcps(ctx, 'John Smith CA');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((h) => h.source === 'nppes')).toBe(true);
  });

  it('seed doctors are found without touching the registry', async () => {
    const found = await live.service.searchHcps(ctx, 'Ruvane');
    expect(found.some((h) => h.source === 'seed')).toBe(true);
  });
});
