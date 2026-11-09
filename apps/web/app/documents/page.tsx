import { DocumentsPage } from '../../components/documents-page';

export default async function Documents({ searchParams }: { searchParams: Promise<{ doc?: string; at?: string }> }) {
  const { doc, at } = await searchParams;
  return <DocumentsPage doc={doc} at={at} />;
}
