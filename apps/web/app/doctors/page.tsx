'use client';
import { useEffect, useState } from 'react';
import type { CapStatus, ProgramPlan } from '@covers/contract';
import { ListDetail, type ListGroup } from '../../components/list-detail';
import { covers } from '../../lib/client';
import { usd } from '../../lib/dinner';
import { nameOf } from '../../lib/map';
import { doctorCard } from '../../lib/page-cards';

export default function DoctorsPage() {
  const [data, setData] = useState<{ ledger: CapStatus[]; plans: ProgramPlan[] } | null>(null);
  useEffect(() => { void Promise.all([covers.getLedger(), covers.listPlans()]).then(([ledger, plans]) => setData({ ledger, plans })); }, []);
  const order: CapStatus['state'][] = ['over', 'near', 'ok'], title = { over: 'Over the annual limit', near: 'Near the annual limit', ok: 'Under the limit' };
  const groups: ListGroup[] | null = data && order.flatMap((state) => {
    const items = data.ledger.filter((c) => c.state === state).sort((a, b) => b.ytdCents - a.ytdCents);
    return items.length ? [{ title: title[state], items: items.map((c) => ({ id: c.npi, title: nameOf(c.npi), sub: `${c.sameTopicCount12mo} programs on the same topic`, right: `${usd(c.ytdCents)} of ${usd(c.capCents)}`, tone: state === 'over' ? 'over' as const : state === 'near' ? 'near' as const : 'ok' as const, card: doctorCard(c, data.plans) })) }] : [];
  });
  return <ListDetail tab="Doctors" title="Doctors" summary={data ? `${data.ledger.length} doctors on the ledger · fictional demo data` : ''} groups={groups} />;
}
