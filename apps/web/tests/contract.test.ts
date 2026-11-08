// The shared contract suite against FixtureService: always on memory, and on Upstash when its env vars are set.
import { runContractSuite } from '@covers/contract/tests';
import { FixtureService } from '../lib/fixtures/fixture-service';
import { MemoryStore, storeFromEnv, UpstashStore } from '../lib/store';

runContractSuite('FixtureService (memory)', () => new FixtureService(new MemoryStore()));

const upstash = storeFromEnv();
if (upstash instanceof UpstashStore) {
  runContractSuite('FixtureService (Upstash)', () => new FixtureService(upstash));
}
