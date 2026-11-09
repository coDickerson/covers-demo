'use client';
import { useEffect, useMemo, useState } from 'react';
import type { PolicyDocument } from '@covers/contract';
import { covers } from '../lib/client';
import { storedCard } from '../lib/doc-cards';
import type { DocRef } from '../lib/map';
import { ListDetail, type ListGroup } from './list-detail';

const GROUP: [string, PolicyDocument['kind'][]][] = [['Law and regulation', ['statute', 'regulation']], ['Government guidance', ['guidance', 'agency_page']], ['Company policy', ['company_policy']]];

export function DocumentsPage({ doc, at }: { doc?: string | undefined; at?: string | undefined }) {
  const [documents, setDocuments] = useState<PolicyDocument[] | null>(null);
  const [selected, setSelected] = useState<{ doc?: string | undefined; at?: string | undefined }>({ doc, at });
  useEffect(() => { void covers.listDocuments().then(setDocuments); }, []);
  const groups: ListGroup[] | null = useMemo(() => documents && GROUP.flatMap(([title, kinds]) => {
    const items = documents.filter((d) => kinds.includes(d.kind));
    return items.length ? [{ title, items: items.map((d) => ({ id: d.id, title: d.title, sub: d.publisher, right: `${d.passages.length} passages`, card: storedCard(d, d.id === selected.doc ? selected.at : undefined) })) }] : [];
  }), [documents, selected]);
  const open = (r: DocRef) => setSelected({ doc: r.doc, at: r.at });
  return <ListDetail tab="Documents" title="Documents" summary={documents ? 'The sources every rule points to' : ''} groups={groups} selected={selected.doc ?? null} onSelect={(id) => setSelected({ doc: id })} onDoc={open} />;
}
