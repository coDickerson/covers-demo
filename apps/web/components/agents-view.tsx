'use client';
// Agents: the diligence crew at work, on real doctors and a real venue. Each agent is a card that lights up as it works,
// with its tool calls streaming in; then the verified report. Risk first, every fact verified; the agents report facts,
// the rule engine decides and people approve. Runs through /api/diligence (local live mode, real public data).
import { useEffect, useRef, useState } from 'react';
import type { Hcp } from '@covers/contract';
import type { DiligenceEvent, DiligenceReport, DiligenceRun } from '@covers/integrations';
import { covers } from '../lib/client';
import { usd } from '../lib/dinner';

type AgentId = DiligenceEvent['agent'];
type State = 'waiting' | 'working' | 'done' | 'skipped';
const CREW: { id: AgentId; step: string; name: string; tool: string; job: string; code?: boolean }[] = [
  { id: 'history', step: '1', name: 'History agent', tool: 'CMS Open Payments', job: 'Pulls what companies already paid each doctor' },
  { id: 'risk', step: '·', name: 'Risk scoring', tool: 'Code, no model', job: 'Ranks the guests so the riskiest come first', code: true },
  { id: 'identity', step: '2', name: 'Identity agent', tool: 'NPI registry', job: 'Confirms each guest is a real clinician' },
  { id: 'venue', step: '3', name: 'Venue agent', tool: 'Google Maps via Apify', job: 'Checks what kind of place it is, and how pricey' },
  { id: 'verifier', step: '4', name: 'Verifier agent', tool: 'All three, again', job: 'Re-checks every fact against its source' },
  { id: 'lead', step: '5', name: 'Lead agent', tool: 'Verified facts only', job: 'Writes the summary for the reviewer' },
];
/** Real California cardiovascular clinicians from 2025 Open Payments, for a quick start. */
const SAMPLE = ['1861526451', '1164957957', '1437151180'];
const TIER: Record<DiligenceReport['risk'][number]['tier'], string> = { high: 'border-status-over text-status-over', medium: 'border-status-near text-status-near', low: 'border-status-ok text-status-ok', none: 'border-border text-ink-muted' };
const STATE_CHIP: Record<State, string> = { waiting: 'border-border text-ink-muted', working: 'border-ink-primary bg-accent text-on-accent', done: 'border-status-ok text-status-ok', skipped: 'border-border text-ink-muted' };
const STATE_WORD: Record<State, string> = { waiting: 'WAITING', working: 'WORKING', done: 'DONE', skipped: 'SKIPPED' };
const emptyLog = () => Object.fromEntries(CREW.map((a) => [a.id, [] as string[]])) as unknown as Record<AgentId, string[]>;

function Source({ href }: { href: string }) {
  return /^https?:/.test(href) ? <a href={href} target="_blank" rel="noreferrer" className="shrink-0 text-small text-ink-muted underline hover:text-ink-primary">source ↗</a> : <span className="shrink-0 font-mono text-micro text-ink-muted">{href}</span>;
}

export function AgentsView() {
  const [doctors, setDoctors] = useState<Hcp[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Hcp[]>([]);
  const [venue, setVenue] = useState('Tosca Cafe, San Francisco');
  const [states, setStates] = useState<Record<AgentId, State>>(() => Object.fromEntries(CREW.map((a) => [a.id, 'waiting'])) as Record<AgentId, State>);
  const [log, setLog] = useState<Record<AgentId, string[]>>(emptyLog);
  const [result, setResult] = useState<(DiligenceRun & { seconds: number }) | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  // Search the real NPI registry as the person types.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setFound([]); return; }
    const id = window.setTimeout(() => { void covers.searchHcps(q).then((list: Hcp[]) => setFound(list.filter((h) => !h.npi.startsWith('9')).slice(0, 6))).catch(() => setFound([])); }, 350);
    return () => window.clearTimeout(id);
  }, [query]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const add = (h: Hcp) => { setDoctors((d) => (d.some((x) => x.npi === h.npi) || d.length >= 6 ? d : [...d, h])); setQuery(''); setFound([]); };
  const sample = async () => {
    const list = await Promise.all(SAMPLE.map((n) => covers.searchHcps(n).then((r: Hcp[]) => r[0]).catch(() => undefined)));
    setDoctors(list.filter((h): h is Hcp => !!h));
  };

  const run = async () => {
    setRunning(true); setError(null); setResult(null); started.current = Date.now(); setElapsed(0);
    setStates(Object.fromEntries(CREW.map((a) => [a.id, 'waiting'])) as Record<AgentId, State>);
    setLog(emptyLog());
    try {
      const res = await fetch('/api/diligence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ npis: doctors.map((d) => d.npi), venue, estimatedPerPersonCents: 11_000 }) });
      if (!res.ok || !res.body) { const b = (await res.json().catch(() => null)) as { error?: string } | null; throw new Error(b?.error ?? 'The agents could not start.'); }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as { type: 'event'; event: DiligenceEvent } | ({ type: 'report'; seconds: number } & DiligenceRun) | { type: 'error'; error: string };
          if (msg.type === 'event') {
            const { agent, phase, detail } = msg.event;
            setStates((s) => ({ ...s, [agent]: phase === 'start' || phase === 'tool' ? 'working' : phase }));
            if (detail) setLog((l) => ({ ...l, [agent]: [...l[agent], phase === 'tool' ? detail : `→ ${detail}`].slice(-4) }));
          } else if (msg.type === 'report') setResult({ report: msg.report, trace: msg.trace, seconds: msg.seconds });
          else throw new Error(msg.error);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'The agents could not finish.'); }
    finally { setRunning(false); }
  };

  const nameOf = (npi: string) => result?.report.identity?.guests.find((g) => g.npi === npi)?.name ?? doctors.find((d) => d.npi === npi)?.name ?? `NPI ${npi}`;
  const tokens = result?.trace.reduce((t, a) => ({ in: t.in + a.inputTokens, out: t.out + a.outputTokens }), { in: 0, out: 0 });

  return (
    <div className="min-h-0 flex-1 overflow-auto pb-6">
      <p className="max-w-3xl text-ink-secondary">A crew of Claude agents researches <b className="font-strong text-ink-primary">real doctors and a real venue</b> from public data before the rules run. Risk comes first, and a verifier re-checks every fact before anyone sees it. <b className="font-strong text-ink-primary">Agents investigate, the rule engine decides, people approve.</b></p>

      {/* Who and where */}
      <section className="mt-4 grid gap-4 border border-border bg-bg-surface p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <label className="text-small font-strong" htmlFor="agents-search">Guests <span className="font-regular text-ink-muted">(real NPIs, up to six)</span></label>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {doctors.map((d) => <span key={d.npi} className="flex items-center gap-1.5 border border-ink-primary bg-accent-tint px-2 py-0.5 text-small"><b className="font-strong">{d.name}</b><span className="font-mono text-micro text-ink-muted">{d.npi}</span><button aria-label={`Remove ${d.name}`} disabled={running} onClick={() => setDoctors((x) => x.filter((y) => y.npi !== d.npi))} className="cursor-pointer text-ink-muted hover:text-ink-primary">×</button></span>)}
            <input id="agents-search" value={query} disabled={running} onChange={(e) => setQuery(e.target.value)} placeholder="Search the NPI registry: a name or an NPI" className="min-w-56 flex-1 border border-border bg-bg-canvas px-2.5 py-1.5 text-small" />
          </div>
          {found.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full border border-ink-primary bg-bg-surface">
              {found.map((h) => <li key={h.npi}><button onClick={() => add(h)} className="flex w-full cursor-pointer justify-between gap-3 px-2.5 py-1.5 text-left text-small hover:bg-accent-tint"><span><b className="font-strong">{h.name}</b> <span className="text-ink-muted">{h.specialty ?? ''}{h.state ? ` · ${h.state}` : ''}</span></span><span className="font-mono text-micro text-ink-muted">{h.npi}</span></button></li>)}
            </ul>
          )}
          {!doctors.length && <button onClick={() => void sample()} disabled={running} className="mt-2 cursor-pointer text-small underline">Use three real California cardiologists from 2025 Open Payments</button>}
        </div>
        <div className="min-w-0">
          <label className="text-small font-strong" htmlFor="agents-venue">Venue <span className="font-regular text-ink-muted">(a real place)</span></label>
          <input id="agents-venue" value={venue} disabled={running} onChange={(e) => setVenue(e.target.value)} className="mt-1.5 w-full border border-border bg-bg-canvas px-2.5 py-1.5 text-small" />
        </div>
        <div className="flex items-end">
          <button onClick={() => void run()} disabled={running || !doctors.length || venue.trim().length < 2} className="cursor-pointer border border-ink-primary bg-accent px-4 py-2.5 font-strong text-on-accent disabled:cursor-default disabled:opacity-60">{running ? `Agents working · ${elapsed}s` : result ? 'Send the agents again' : 'Send the agents'}</button>
        </div>
      </section>
      {error && <p role="alert" className="mt-3 text-status-over">{error}</p>}

      {/* The crew */}
      <section aria-label="The agents" className="mt-5">
        <h2 className="text-small font-bold text-ink-muted">THE CREW · in this order, risk first</h2>
        <ol className="mt-2 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {CREW.map((a) => {
            const st = states[a.id], t = result?.trace.find((x) => x.agent === a.id);
            return (
              <li key={a.id} className={`flex min-h-44 flex-col border p-3 transition-colors duration-(--motion-duration-base) ease-standard ${st === 'working' ? 'border-ink-primary bg-accent-tint motion-safe:animate-pulse' : st === 'done' ? 'border-status-ok bg-bg-surface' : 'border-border bg-bg-surface'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex size-6 items-center justify-center border font-mono text-micro ${a.code ? 'border-border text-ink-muted' : 'border-ink-primary'}`}>{a.step}</span>
                  <small className={`border px-1.5 py-0.5 font-mono text-micro ${STATE_CHIP[st]}`}>{STATE_WORD[st]}</small>
                </div>
                <b className="mt-2 text-small font-strong">{a.name}</b>
                <small className="text-micro text-ink-muted">{a.tool}</small>
                <p className="mt-1 text-small text-ink-secondary">{a.job}</p>
                <ul className="mt-auto pt-2">
                  {log[a.id].map((line, i) => <li key={i} className="truncate font-mono text-micro text-ink-secondary" title={line}>{line}</li>)}
                  {t && <li className="font-mono text-micro text-ink-muted">{t.toolCalls} tool calls · {(t.inputTokens + t.outputTokens).toLocaleString()} tokens</li>}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      {/* The report */}
      {result && (
        <section aria-label="Diligence report" className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="border border-ink-primary bg-bg-surface p-4">
            <span className="font-mono text-micro text-ink-muted">DILIGENCE REPORT · VERIFIED FACTS ONLY</span>
            <p className="mt-1.5">{result.report.summary}</p>
            <p className="mt-1 text-small text-ink-muted">Public CMS Open Payments data, for a reviewer to look at. Not a finding of wrongdoing.</p>
            <h3 className="mt-4 text-small font-bold text-ink-muted">Look at these first</h3>
            <ul className="mt-1">
              {result.report.concerns.map((c, i) => <li key={i} className="flex items-start justify-between gap-3 border-b border-border py-2 text-small last:border-b-0"><span><span className="mr-1.5 text-status-ok">✓</span>{c.fact}</span><Source href={c.source} /></li>)}
              {!result.report.concerns.length && <li className="py-2 text-small text-ink-muted">Nothing a reviewer needs to look at.</li>}
            </ul>
            {result.report.unverified.length > 0 && <>
              <h3 className="mt-4 text-small font-bold text-ink-muted">Sent to a person: the verifier could not confirm these</h3>
              <ul className="mt-1">{result.report.unverified.map((u, i) => <li key={i} className="border-b border-border py-2 text-small last:border-b-0">{u.fact}<small className="block text-ink-muted">{u.evidence}</small></li>)}</ul>
            </>}
          </div>
          <div className="flex flex-col gap-4">
            <div className="border border-border bg-bg-surface p-4">
              <h3 className="text-small font-bold text-ink-muted">Risk, highest first <span className="font-regular">(scored by code from CMS data)</span></h3>
              <ul className="mt-1">
                {result.report.risk.map((r) => {
                  const h = result.report.history?.doctors.find((d) => d.npi === r.npi);
                  return <li key={r.npi} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0"><span className="min-w-0"><b className="block text-small font-strong">{nameOf(r.npi)}</b><small className="block text-small text-ink-secondary">{r.why}</small>{h && <small className="block font-mono text-micro text-ink-muted">{usd(h.totalCents)} from industry in {result.report.history?.year}{h.topPayer ? ` · most from ${h.topPayer}` : ''}</small>}</span><small className={`shrink-0 border px-1.5 py-0.5 font-mono text-micro uppercase ${TIER[r.tier]}`}>{r.tier}</small></li>;
                })}
              </ul>
            </div>
            {result.report.venue && (
              <div className="border border-border bg-bg-surface p-4">
                <h3 className="text-small font-bold text-ink-muted">Venue</h3>
                <p className="mt-1 text-small">{result.report.venue.found ? <><b className="font-strong">{result.report.venue.name}</b> · {result.report.venue.category ?? 'uncategorised'}{result.report.venue.priceLevel ? ` · ${'$'.repeat(result.report.venue.priceLevel)}` : ''}{result.report.venue.isBarFirst ? ' · a bar first' : ''}</> : 'Not found on Google Maps'}</p>
              </div>
            )}
            <p className="text-micro text-ink-muted">{result.seconds}s · {tokens ? `${(tokens.in + tokens.out).toLocaleString()} tokens across ${result.trace.length} agents` : ''} · real public data: CMS Open Payments, the NPI registry, Google Maps via Apify. The agents report facts; nothing here passes or blocks a dinner.</p>
          </div>
        </section>
      )}
    </div>
  );
}
