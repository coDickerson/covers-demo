import { AuditPage, type AuditView } from '../../components/audit-page';

const VIEWS: AuditView[] = ['events', 'rules', 'doctors', 'sources', 'proof'];

export default async function Audit({ searchParams }: { searchParams: Promise<{ view?: string; doc?: string; at?: string }> }) {
  const { view, doc, at } = await searchParams;
  return <AuditPage view={VIEWS.includes(view as AuditView) ? (view as AuditView) : 'events'} doc={doc} at={at} />;
}
