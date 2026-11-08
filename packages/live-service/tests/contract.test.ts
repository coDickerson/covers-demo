// Cole's shared contract suite against LiveService. Needs TEST_DATABASE_URL; skipped otherwise.
import { afterAll, describe, it } from 'vitest';
import { runContractSuite } from '@covers/contract/tests';
import { connect, LiveService, migrate, type Sql } from '../src/index';

const url = process.env.TEST_DATABASE_URL;

if (url) {
  let sql: Sql | undefined;
  let ready: Promise<unknown> | undefined;
  runContractSuite('LiveService', async () => {
    sql ??= connect(url);
    ready ??= migrate(sql);
    await ready;
    return new LiveService({ sql });
  });
  afterAll(async () => { await sql?.end(); });
} else {
  describe.skip('CoversService contract: LiveService (set TEST_DATABASE_URL)', () => { it('skipped', () => {}); });
}
