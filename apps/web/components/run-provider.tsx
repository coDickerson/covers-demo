'use client';
// Keeps the bell working when you change pages: runs live above every page, so the dashboard and the map watch the same one.
// A run paces results the service has already returned. Nothing here changes the record.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { tokens } from '../lib/tokens';

export type Stage = { step: number; names: string[] };
/** `at` is the station the bell is heading for (-1 = the start of the path); `seen` is how many stations have shown their result. */
export type Run = { step: number; at: number; seen: number; label: string };
type Runs = { runs: Record<string, Run>; play: (planId: string, stages: Stage[]) => Promise<void> };

const RunContext = createContext<Runs>({ runs: {}, play: async () => {} });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WALK = tokens['motion/duration/slow'] * 2;
const DWELL = tokens['motion/duration/slow'];

export function RunProvider({ children }: { children: React.ReactNode }) {
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const play = useCallback(async (planId: string, stages: Stage[]) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const set = (run: Run) => setRuns((r) => ({ ...r, [planId]: run }));
    for (const { step, names } of stages) {
      set({ step, at: -1, seen: 0, label: names[0] ?? '' });
      await sleep(DWELL);
      for (let i = 0; i < names.length; i++) {
        set({ step, at: i, seen: i, label: names[i]! });
        await sleep(WALK);
        set({ step, at: i, seen: i + 1, label: names[i]! });
        await sleep(DWELL);
      }
    }
    setRuns((r) => { const { [planId]: _done, ...rest } = r; return rest; });
  }, []);
  const value = useMemo(() => ({ runs, play }), [runs, play]);
  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export const useRuns = () => useContext(RunContext);
