'use client';
// Audit: the administrative side. Every check, decision, card event and source, by section of the dinner, like a log per
// agent. Sections on the left; on the right the section's events, plus the rules, doctors, sources and proof behind them.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { AuditEvent, ProofBundle } from '@covers/contract';
import { covers } from '../lib/client';
import { actorOf, CHIPS, labelOf, sectionOf, SECTIONS, type SectionId } from '../lib/audit';
import { usd, type Role } from '../lib/dinner';
import type { DocRef } from '../lib/map';
import { AppBar, readRole, setRoleCookie } from './app-bar';
import { DoctorsView, ProofView, RulesView, SourcesView } from './audit-views';

export type AuditView = 'events' | 'rules' | 'doctors' | 'sources' | 'proof';
const VIEWS: [AuditView, string][] = [['events', 'Events'], ['rules', 'Rules'], ['doctors', 'Doctors'], ['sources', 'Sources'], ['proof', 'Proof']];

export function AuditPage({ view: startView = 'events', doc, at }: { view?: AuditView; doc?: string | undefined; at?: string | undefined }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('rep');
  const [view, setView] = useState<AuditView>(startView);
  const [section, setSection] = useState<SectionId | null>(null);
  const [chip, setChip] = useState(0);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [source, setSource] = useState<{ doc?: string | undefined; at?: string | undefined }>({ doc, at });
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [proof, setProof] = useState<ProofBundle | null>(null);
  useEffect(() => { setRole(readRole()); void covers.listAudit().then(setEvents); void covers.getProof().then(setProof); }, []);

  // A citation anywhere on this page opens its passage in Sources.
  const openDoc = (r: DocRef) => { setSource({ doc: r.doc, at: r.at }); setView('sources'); router.replace(`/audit?view=sources&doc=${encodeURIComponent(r.doc)}${r.at ? `&at=${encodeURIComponent(r.at)}` : ''}`, { scroll: false }); };
  const pick = (v: AuditView) => { setView(v); router.replace(`/audit${v === 'events' ? '' : `?view=${v}`}`, { scroll: false }); };

  const counts = useMemo(() => {
    const c = new Map<SectionId, number>();
    for (const e of events ?? []) c.set(sectionOf(e), (c.get(sectionOf(e)) ?? 0) + 1);
    return c;
  }, [events]);
  const inSection = useMemo(() => (events ?? []).filter((e) => section === null || sectionOf(e) === section), [events, section]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase(), test = CHIPS[chip]![1];
    return inSection.filter((e) => test(e) && (!q || `${labelOf(e.action)} ${e.detail} ${actorOf(e.actorId)} ${e.ruleId ?? ''}`.toLowerCase().includes(q))).slice().reverse();
  }, [inSection, chip, search]);
  // How often each rule pack shows up in the chosen section, for the Rules view.
  const used = useMemo(() => {
    if (section === null) return null;
    const u: Record<string, number> = {};
    for (const e of inSection) { const p = e.packId ?? e.ruleId?.split('.')[0]; if (p) u[p] = (u[p] ?? 0) + 1; }
    return u;
  }, [inSection, section]);

  const caught = proof ? proof.breakIt.filter((c) => c.passed).length : 0;
  const here = section === null ? null : SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="flex h-dvh flex-col px-5 pt-3 pb-4">
      <AppBar active="Audit" role={role} onRole={(r) => { setRoleCookie(r); setRole(r); }} />
      <header className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-title font-bold tracking-tight">Audit</h1>
        <span className="text-ink-muted">Every check, every decision, every source, in the order it happened.</span>
        {proof && <button onClick={() => pick('proof')} className="ml-auto cursor-pointer border border-status-ok px-2.5 py-1 text-small font-strong text-status-ok hover:bg-bg-surface">✓ {caught} of {proof.breakIt.length} attacks stopped</button>}
      </header>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] gap-6">
        {/* The sections, like one log per agent: each step of the dinner at its bar, then rule changes and tests. */}
        <nav aria-label="Sections" className="min-h-0 overflow-auto border-r border-border pr-3">
          {[{ id: null, name: 'All sections', place: 'Everything, newest first' } as const, ...SECTIONS].map((s) => {
            const on = section === s.id, n = s.id === null ? events?.length ?? 0 : counts.get(s.id) ?? 0;
            if (s.id === 'other' && !n) return null;
            return (
              <button key={String(s.id)} onClick={() => { setSection(s.id); setOpen(null); }} aria-current={on ? 'true' : undefined} className={`flex w-full cursor-pointer items-center gap-2.5 border-b border-border px-2 py-2 text-left ${on ? 'bg-accent-tint' : 'hover:bg-bg-surface'}`}>
                <span className="w-4 shrink-0 font-mono text-micro text-ink-muted">{typeof s.id === 'number' ? s.id + 1 : ''}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-small font-strong">{s.name}</b><small className="block truncate text-micro text-ink-muted">{s.place}</small></span>
                {on && typeof s.id === 'number' && <img src={`/crawl/cablecar-${s.id}-0.png`} alt="" width={32} height={30} className="shrink-0 [image-rendering:pixelated]" />}
                <span className="font-mono text-micro text-ink-muted">{n}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex min-h-0 flex-col">
          <div className="flex items-end gap-5 border-b border-ink-primary">
            {VIEWS.map(([v, name]) => <button key={v} onClick={() => pick(v)} aria-current={view === v ? 'page' : undefined} className={`-mb-px cursor-pointer border-b-2 pb-1.5 text-small ${view === v ? 'border-ink-primary font-strong' : 'border-transparent text-ink-muted hover:text-ink-primary'}`}>{name}{v === 'events' && here ? ` · ${here.name}` : ''}</button>)}
          </div>

          {view === 'events' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {CHIPS.map(([name], i) => <button key={name} onClick={() => setChip(i)} aria-pressed={chip === i} className={`cursor-pointer rounded-pill border px-2.5 py-0.5 text-small ${chip === i ? 'border-ink-primary bg-accent-tint font-strong' : 'border-border hover:border-ink-primary'}`}>{name}</button>)}
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions, people, rules" aria-label="Search the audit log" className="ml-auto w-64 border border-border bg-bg-surface px-2.5 py-1 text-small" />
              </div>
              {!events && <p className="mt-6 text-ink-muted">Loading…</p>}
              {events && shown.length === 0 && <p className="mt-6 text-ink-muted">{events.length === 0 ? 'Nothing has happened yet. Start the demo and every step lands here.' : 'No entries match.'}</p>}
              {events && shown.length > 0 && (
                <div className="mt-2 min-h-0 flex-1 overflow-auto">
                  <table className="w-full border-collapse text-small">
                    <thead className="sticky top-0 bg-bg-canvas text-left text-micro text-ink-muted">
                      <tr><th className="py-1.5 pr-3 font-strong">Time</th><th className="pr-3 font-strong">Who</th><th className="pr-3 font-strong">What happened</th><th className="pr-3 font-strong">Section</th><th className="pr-3 font-strong">Rule</th></tr>
                    </thead>
                    <tbody>
                      {shown.map((e) => {
                        const s = sectionOf(e), sec = SECTIONS.find((x) => x.id === s)!, expanded = open === e.id;
                        return [
                          <tr key={e.id} onClick={() => setOpen(expanded ? null : e.id)} aria-expanded={expanded} className={`cursor-pointer border-t border-border align-top ${expanded ? 'bg-accent-tint' : 'hover:bg-bg-surface'}`}>
                            <td className="py-2 pr-3 font-mono text-micro whitespace-nowrap text-ink-muted">{new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</td>
                            <td className="pr-3 whitespace-nowrap">{actorOf(e.actorId)}</td>
                            <td className="pr-3"><b className="font-strong">{labelOf(e.action)}</b>{e.model && <span className="ml-2 border border-border px-1 font-mono text-micro text-ink-muted">Claude</span>}{e.detail && e.action !== 'plan.updated' && <small className="block text-ink-secondary">{e.detail.replace(/(\d+) cents/g, (_, c: string) => usd(Number(c)))}</small>}</td>
                            <td className="pr-3 whitespace-nowrap">{sec.name}</td>
                            <td className="pr-3 font-mono text-micro whitespace-nowrap">{e.ruleId ?? e.packId ?? '—'}</td>
                          </tr>,
                          expanded && (
                            <tr key={`${e.id}-open`} className="bg-bg-surface">
                              <td colSpan={5} className="px-3 py-2.5">
                                <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
                                  <dt className="text-ink-muted">Action</dt><dd className="font-mono text-micro">{e.action}</dd>
                                  <dt className="text-ink-muted">When</dt><dd>{new Date(e.at).toLocaleString('en-US')}</dd>
                                  <dt className="text-ink-muted">Input hash</dt><dd className="font-mono text-micro">{e.inputHash}</dd>
                                  {e.model && <><dt className="text-ink-muted">Model</dt><dd className="font-mono text-micro">{e.model}{e.promptVersion ? ` · prompt ${e.promptVersion}` : ''}</dd></>}
                                  {(e.ruleId || e.packId) && <><dt className="text-ink-muted">Rule</dt><dd><button onClick={(ev) => { ev.stopPropagation(); pick('rules'); }} className="cursor-pointer font-mono text-micro underline">{e.ruleId ?? e.packId}</button></dd></>}
                                </dl>
                                {e.planId && <Link href={`/plans/${encodeURIComponent(e.planId)}`} className="mt-2 inline-block border border-ink-primary px-2.5 py-1 text-small font-strong hover:bg-accent-tint">Open this step on the crawl</Link>}
                              </td>
                            </tr>
                          ),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {view !== 'events' && (
            <div className="mt-3 flex min-h-0 flex-1 flex-col">
              {view === 'rules' && <RulesView onDoc={openDoc} used={used} />}
              {view === 'doctors' && <DoctorsView onDoc={openDoc} />}
              {view === 'sources' && <SourcesView doc={source.doc} at={source.at} onDoc={openDoc} />}
              {view === 'proof' && <ProofView proof={proof} onDoc={openDoc} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
