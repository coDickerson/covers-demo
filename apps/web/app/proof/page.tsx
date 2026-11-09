'use client';
import { useEffect, useState } from 'react';
import type { ProofBundle } from '@covers/contract';
import { ListDetail, type ListGroup } from '../../components/list-detail';
import { covers, CoversClientError } from '../../lib/client';
import { breakItCard, evalCard, realCard } from '../../lib/page-cards';

export default function ProofPage() {
  const [proof, setProof] = useState<ProofBundle | null>(null);
  const [runs, setRuns] = useState<Record<number, string>>({});
  useEffect(() => { void covers.getProof().then(setProof); }, []);
  const runAll = async () => {
    for (const c of proof!.breakIt) {
      try { const r = await covers.runBreakIt(c.id); setRuns((x) => ({ ...x, [c.id]: r.passed ? 'Caught just now' : 'NOT caught just now' })); }
      catch (e) { setRuns((x) => ({ ...x, [c.id]: e instanceof CoversClientError ? e.message : 'Could not run' })); if (e instanceof CoversClientError && e.code === 'invalid_state') return; }
    }
  };
  const groups: ListGroup[] | null = proof && [
    { title: `Break-It: ${proof.breakIt.filter((c) => c.passed).length} of ${proof.breakIt.length} caught`, items: proof.breakIt.map((c) => ({ id: `b${c.id}`, title: `${c.id}. ${c.attack}`, sub: runs[c.id] ?? c.expected, right: c.passed ? 'Caught' : 'Missed', tone: c.passed ? 'ok' as const : 'over' as const, card: breakItCard(c) })) },
    { title: 'Receipt reader', items: proof.receiptEval.map((r) => ({ id: `e${r.cls}`, title: r.cls, sub: `${r.n} lines`, right: `${(r.precision * 100).toFixed(0)}% / ${(r.recall * 100).toFixed(0)}%`, tone: Math.min(r.precision, r.recall) >= 0.95 ? 'ok' as const : 'near' as const, card: evalCard(r) })) },
    { title: 'Real or simulated', items: proof.realVsSimulated.map((r) => ({ id: `r${r.piece}`, title: r.piece, sub: r.howWeKnow, right: r.status, tone: /^real/i.test(r.status) ? 'ok' as const : 'near' as const, card: realCard(r) })) },
  ];
  return (
    <ListDetail tab="Proof" title="Proof" summary={proof ? `Recorded ${new Date(proof.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''} groups={groups}>
      <button onClick={runAll} className="cursor-pointer border border-ink-primary px-3 py-1.5 font-strong">Run the Break-It cases now</button>
      {runs[1] && !/just now/.test(runs[1]) && <p role="alert" className="mt-2 text-small text-status-near">{runs[1]}</p>}
    </ListDetail>
  );
}
