'use client';
// Keeps the bell working when you change pages: runs live above every page, so the dashboard and the map watch the same one.
// A run paces results the service has already returned. Nothing here changes the record.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { tokens } from '../lib/tokens';

/** `start` picks up partway along a step's stations. `recheck` lists the only stations to revisit, from wherever the bell is. `exit` walks to the end of the path before the next stage begins. */
export type Stage = { step: number; names: string[]; lines: number[]; start?: number; recheck?: number[]; exit?: boolean };
/** `at` is the station the bell is heading for (-1 = the start of the path); `seen` is how many stations have shown their result; `line` is how far through its thinking the current station is. */
export type Run = { step: number; at: number; seen: number; line: number; label: string; exit?: boolean; recheck?: number[] };
type Runs = { runs: Record<string, Run>; play: (planId: string, stages: Stage[]) => Promise<void> };

const RunContext = createContext<Runs>({ runs: {}, play: async () => {} });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const WALK_MS = tokens['motion/duration/slow'] * 3.5; // the walker's pace between stations at one place
/** The longer walk from one place (bar) to the next, slow enough to see the cable car sway. */
export const TRAVEL_MS = tokens['motion/duration/slow'] * 11;
const DWELL = tokens['motion/duration/slow'];
const THINK = tokens['motion/duration/fast'];

export function RunProvider({ children }: { children: React.ReactNode }) {
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const play = useCallback(async (planId: string, stages: Stage[]) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const set = (run: Run) => setRuns((r) => ({ ...r, [planId]: run }));
    for (const { step, names, lines, start = 0, recheck, exit } of stages) {
      if (recheck) {
        for (let i = 0; i < recheck.length; i++) {
          const base = { step, at: recheck[i]!, seen: recheck[i]!, label: names[i]! };
          set({ ...base, line: 0, recheck: recheck.slice(i) });
          await sleep(WALK_MS);
          for (let line = 1; line <= (lines[i] ?? 0); line++) { set({ ...base, line, recheck: recheck.slice(i) }); await sleep(THINK); }
          set({ ...base, line: 0, recheck: recheck.slice(i + 1) });
          await sleep(DWELL);
        }
        if (exit) { set({ step, at: recheck.at(-1) ?? 0, seen: 0, line: 0, label: names.at(-1) ?? '', exit: true, recheck: [] }); await sleep(WALK_MS); }
        continue;
      }
      if (!start) { set({ step, at: -1, seen: 0, line: 0, label: names[0] ?? '' }); await sleep(DWELL); }
      for (let i = 0; i < names.length; i++) {
        set({ step, at: start + i, seen: start + i, line: 0, label: names[i]! });
        await sleep(i === 0 && !start ? TRAVEL_MS : WALK_MS);
        for (let line = 1; line <= (lines[i] ?? 0); line++) {
          set({ step, at: start + i, seen: start + i, line, label: names[i]! });
          await sleep(THINK);
        }
        set({ step, at: start + i, seen: start + i + 1, line: 0, label: names[i]! });
        await sleep(DWELL);
      }
      if (exit) { set({ step, at: start + names.length - 1, seen: start + names.length, line: 0, label: names[names.length - 1] ?? '', exit: true }); await sleep(WALK_MS); }
    }
    setRuns((r) => { const { [planId]: _done, ...rest } = r; return rest; });
  }, []);
  const value = useMemo(() => ({ runs, play }), [runs, play]);
  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export const useRuns = () => useContext(RunContext);
