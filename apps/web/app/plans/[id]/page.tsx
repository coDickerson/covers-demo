import { redirect } from 'next/navigation';
import { IDS } from '@covers/contract/fixtures';
import { DinnerMap } from '../../../components/dinner-map';

// The demo follows one dinner; any other dinner's address opens it instead.
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (decodeURIComponent(id) !== IDS.demoPlan) redirect(`/plans/${IDS.demoPlan}`);
  return <DinnerMap planId={IDS.demoPlan} />;
}
