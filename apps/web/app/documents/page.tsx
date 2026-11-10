import { redirect } from 'next/navigation';

// Documents now live in the Audit tab as Sources; a citation link keeps its document and passage.
export default async function Documents({ searchParams }: { searchParams: Promise<{ doc?: string; at?: string }> }) {
  const { doc, at } = await searchParams;
  const q = new URLSearchParams({ view: 'sources', ...(doc ? { doc } : {}), ...(at ? { at } : {}) });
  redirect(`/audit?${q.toString()}`);
}
