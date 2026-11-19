// Agents replay: a saved run plays back in about 20 seconds, found by the same doctors and venue.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecording, recordingKey, replaySchedule, saveRecording, type DiligenceRecording } from '../lib/diligence-replay';

describe('agents replay', () => {
  it('squeezes an 80-second run into 20 seconds, keeping its rhythm', () => {
    expect(replaySchedule([{ ms: 0 }, { ms: 40_000 }, { ms: 80_000 }])).toEqual([0, 10_000, 20_000]);
  });
  it('leaves a run that is already short alone', () => {
    expect(replaySchedule([{ ms: 0 }, { ms: 5_000 }])).toEqual([0, 5_000]);
  });
  it('finds a run by its doctors in any order and its venue in any case', async () => {
    expect(recordingKey(['2', '1'], ' Tosca Cafe ')).toBe(recordingKey(['1', '2'], 'tosca cafe'));
    const env = { COVERS_CACHE_DIR: mkdtempSync(join(tmpdir(), 'covers-')) } as unknown as NodeJS.ProcessEnv;
    const rec = { recordedAt: '2026-11-18T20:00:00Z', npis: ['1', '2'], venue: 'Tosca Cafe', seconds: 81, events: [], report: {}, trace: [] } as unknown as DiligenceRecording;
    await saveRecording(rec, env);
    expect((await loadRecording(['2', '1'], 'tosca cafe', env))?.seconds).toBe(81);
    expect(await loadRecording(['3'], 'Tosca Cafe', env)).toBeNull();
  });
});
