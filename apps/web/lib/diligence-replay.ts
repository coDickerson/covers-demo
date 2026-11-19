// Agents replay, for presenting. Every real agents run on a laptop is saved under cache/diligence/; with
// COVERS_AGENTS=replay the Agents tab plays the saved run for the same doctors and venue back, sped up to about 20 s,
// with no model or Apify calls and no cost. The report is the real one, and the page says it is a replay.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DiligenceEvent, DiligenceRun } from '@covers/integrations';

export type DiligenceRecording = DiligenceRun & {
  recordedAt: string;
  npis: string[];
  venue: string;
  /** How long the real run took. */
  seconds: number;
  /** Each progress event with its time since the run started. */
  events: { ms: number; event: DiligenceEvent }[];
};

export const agentsReplay = (env: NodeJS.ProcessEnv = process.env) => env.COVERS_AGENTS === 'replay';

const dir = (env: NodeJS.ProcessEnv) => join(env.COVERS_CACHE_DIR ?? join(process.cwd(), '..', '..', 'cache'), 'diligence');

/** Same doctors (in any order) and the same venue (ignoring case and spaces at the ends) → the same recording. */
export const recordingKey = (npis: string[], venue: string) =>
  createHash('sha256').update(`${[...npis].sort().join(',')}|${venue.trim().toLowerCase()}`).digest('hex').slice(0, 16);

export async function loadRecording(npis: string[], venue: string, env: NodeJS.ProcessEnv = process.env): Promise<DiligenceRecording | null> {
  try {
    return JSON.parse(await readFile(join(dir(env), `${recordingKey(npis, venue)}.json`), 'utf8')) as DiligenceRecording;
  } catch {
    return null;
  }
}

/** Best effort: a read-only disk (Vercel) just means nothing is saved. */
export async function saveRecording(rec: DiligenceRecording, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    await mkdir(dir(env), { recursive: true });
    await writeFile(join(dir(env), `${recordingKey(rec.npis, rec.venue)}.json`), `${JSON.stringify(rec, null, 2)}\n`);
  } catch {
    // not saved
  }
}

/** When each event plays: the run's real gaps, scaled down so the whole run takes about `targetMs`. */
export function replaySchedule(events: { ms: number }[], targetMs = 20_000): number[] {
  const last = events.at(-1)?.ms ?? 0;
  const k = last > targetMs ? targetMs / last : 1;
  return events.map((e) => Math.round(e.ms * k));
}
