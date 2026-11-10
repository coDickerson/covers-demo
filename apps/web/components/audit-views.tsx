'use client';
// The Audit tab's reference views, each a list with its record in the standard square: the rule packs (and Pack lab),
// the doctors' annual ledger, the sources every rule cites, and the proof (Break-It and the receipt reader).
import { useEffect, useMemo, useState } from 'react';
import type { CapStatus, CompileResult, PolicyDocument, ProgramPlan, ProofBundle, ReplayDiff, RulePack } from '@covers/contract';
import { covers, CoversClientError } from '../lib/client';
import { storedCard } from '../lib/doc-cards';
import { usd } from '../lib/dinner';
import { nameOf, type DocRef } from '../lib/map';
import { breakItCard, doctorCard, evalCard, packCard, realCard } from '../lib/page-cards';
import { ListBody, type ListGroup } from './list-detail';

const btn = 'cursor-pointer border border-ink-primary px-3 py-1.5 font-strong disabled:cursor-default disabled:opacity-50';

/** Rule packs, with Pack lab on top. `used` counts how often each pack shows up in the chosen section's events. */
export function RulesView({ onDoc, used }: { onDoc: (r: DocRef) => void; used: Record<string, number> | null }) {
  const [packs, setPacks] = useState<RulePack[] | null>(null);
  const [english, setEnglish] = useState('');
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const [replay, setReplay] = useState<ReplayDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => covers.listPacks().then(setPacks);
  useEffect(() => { void load(); }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof CoversClientError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  };
  const groups: ListGroup[] | null = packs && [{ title: 'Rule packs', items: packs.map((p) => ({ id: p.id, title: p.name, sub: `${p.id} · v${p.version} · effective ${p.effective}${used?.[p.id] ? ` · used ${used[p.id]} times in this section` : ''}`, right: p.status, tone: p.status === 'live' ? 'ok' as const : 'near' as const, card: packCard(p) })) }];
  return (
    <ListBody groups={groups} onDoc={onDoc}>
      <form className="border border-border bg-bg-surface p-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { setReplay(null); setCompiled(await covers.compilePack(english)); }); }}>
        <label className="text-small font-bold" htmlFor="rule">Write a rule in plain English</label>
        <textarea id="rule" rows={2} value={english} onChange={(e) => setEnglish(e.target.value)} placeholder="Flag any dinner on a Sunday." className="mt-1.5 block w-full border border-border bg-bg-canvas px-2 py-1.5" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button disabled={busy || !english.trim()} className={btn}>Compile</button>
          {compiled && <><button type="button" disabled={busy} className={btn} onClick={() => run(async () => setReplay(await covers.replayPack(compiled.pack.id)))}>Replay past dinners</button><button type="button" disabled={busy || !replay} className={btn} onClick={() => run(async () => { await covers.promotePack(compiled.pack.id); setCompiled(null); setReplay(null); setEnglish(''); await load(); })}>Make it live</button></>}
        </div>
        {compiled && <ul className="mt-2 text-small">{compiled.tests.map((t) => <li key={t.name} className={t.passed ? 'text-status-ok' : 'text-status-over'}>{t.passed ? 'Passed' : 'Failed'}: {t.name}</li>)}</ul>}
        {replay && <p className="mt-2 text-small">{replay.mealsReplayed} past dinners replayed, {replay.changed.length} would change.{replay.changed.map((c) => ` ${c.planId}: ${c.before} to ${c.after}.`).join('')}</p>}
        {error && <p role="alert" className="mt-2 text-small text-status-over">{error}</p>}
      </form>
    </ListBody>
  );
}

/** The annual ledger: every doctor's total this year against the limit. */
export function DoctorsView({ onDoc }: { onDoc: (r: DocRef) => void }) {
  const [data, setData] = useState<{ ledger: CapStatus[]; plans: ProgramPlan[] } | null>(null);
  useEffect(() => { void Promise.all([covers.getLedger(), covers.listPlans()]).then(([ledger, plans]) => setData({ ledger, plans })); }, []);
  const order: CapStatus['state'][] = ['over', 'near', 'ok'], title = { over: 'Over the annual limit', near: 'Near the annual limit', ok: 'Under the limit' };
  const groups: ListGroup[] | null = data && order.flatMap((state) => {
    const items = data.ledger.filter((c) => c.state === state).sort((a, b) => b.ytdCents - a.ytdCents);
    return items.length ? [{ title: title[state], items: items.map((c) => ({ id: c.npi, title: nameOf(c.npi), sub: `${c.sameTopicCount12mo} programs on the same topic`, right: `${usd(c.ytdCents)} of ${usd(c.capCents)}`, tone: state === 'over' ? 'over' as const : state === 'near' ? 'near' as const : 'ok' as const, card: doctorCard(c, data.plans) })) }] : [];
  });
  return <ListBody groups={groups} onDoc={onDoc} />;
}

const GROUP: [string, PolicyDocument['kind'][]][] = [['Law and regulation', ['statute', 'regulation']], ['Government guidance', ['guidance', 'agency_page']], ['Company policy', ['company_policy']]];

/** The sources every rule points to. A citation opens here at its passage. */
export function SourcesView({ doc, at, onDoc }: { doc?: string | undefined; at?: string | undefined; onDoc: (r: DocRef) => void }) {
  const [documents, setDocuments] = useState<PolicyDocument[] | null>(null);
  useEffect(() => { void covers.listDocuments().then(setDocuments); }, []);
  const groups: ListGroup[] | null = useMemo(() => documents && GROUP.flatMap(([title, kinds]) => {
    const items = documents.filter((d) => kinds.includes(d.kind));
    return items.length ? [{ title, items: items.map((d) => ({ id: d.id, title: d.title, sub: d.publisher, right: `${d.passages.length} passages`, card: storedCard(d, d.id === doc ? at : undefined) })) }] : [];
  }), [documents, doc, at]);
  return <ListBody groups={groups} selected={doc ?? null} onSelect={(id) => onDoc({ label: id, doc: id })} onDoc={onDoc} />;
}

/** Proof: the Break-It attacks (run them again here), the receipt reader's accuracy, and what is real or simulated. */
export function ProofView({ proof, onDoc }: { proof: ProofBundle | null; onDoc: (r: DocRef) => void }) {
  const [runs, setRuns] = useState<Record<number, string>>({});
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
    <ListBody groups={groups} onDoc={onDoc}>
      <button onClick={runAll} disabled={!proof} className={btn}>Run the Break-It cases now</button>
      {runs[1] && !/just now/.test(runs[1]) && <p role="alert" className="mt-2 text-small text-status-near">{runs[1]}</p>}
    </ListBody>
  );
}
