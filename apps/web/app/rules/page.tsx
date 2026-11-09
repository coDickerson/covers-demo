'use client';
import { useEffect, useState } from 'react';
import type { CompileResult, ReplayDiff, RulePack } from '@covers/contract';
import { ListDetail, type ListGroup } from '../../components/list-detail';
import { covers, CoversClientError } from '../../lib/client';
import { packCard } from '../../lib/page-cards';

const btn = 'cursor-pointer border border-ink-primary px-3 py-1.5 font-strong disabled:cursor-default disabled:opacity-50';

export default function RulesPage() {
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
  const groups: ListGroup[] | null = packs && [{ title: 'Rule packs', items: packs.map((p) => ({ id: p.id, title: p.name, sub: `${p.id} · v${p.version} · effective ${p.effective}`, right: p.status, tone: p.status === 'live' ? 'ok' as const : 'near' as const, card: packCard(p) })) }];
  return (
    <ListDetail tab="Rules" title="Rules" summary={packs ? `${packs.filter((p) => p.status === 'live').length} live` : ''} groups={groups}>
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
    </ListDetail>
  );
}
