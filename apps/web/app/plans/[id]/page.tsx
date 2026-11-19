import { redirect } from 'next/navigation';
import { IDS } from '@covers/contract/fixtures';
import { DinnerMap } from '../../../components/dinner-map';

// The demo follows one dinner; any other dinner's address opens it instead.
export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ start?: string; step?: string }> }) {
  const [{ id }, { start, step }] = await Promise.all([params, searchParams]);
  if (decodeURIComponent(id) !== IDS.demoPlan) redirect(`/plans/${IDS.demoPlan}`);
  const at = step !== undefined && /^[0-6]$/.test(step) ? Number(step) : undefined;
  // ?step=N opens that step (from the Audit tab's "Open this step on the crawl"); a step not reached yet opens the current one.
  return <DinnerMap planId={IDS.demoPlan} intro={start === '1'} {...(at !== undefined ? { openStep: at } : {})} />;
}
