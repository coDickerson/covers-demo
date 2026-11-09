import { DinnerMap } from '../../../components/dinner-map';

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DinnerMap planId={decodeURIComponent(id)} />;
}
