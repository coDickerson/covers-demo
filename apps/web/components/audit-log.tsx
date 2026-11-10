'use client';
// The dinner's audit log: a pill at the bottom left that slides the log in from the left edge. Clicking an entry moves
// the cable car to that step and points the chat at that entry, so you can ask what happened, why, and what the options are.
import { useEffect, useRef, useState } from 'react';
import type { AuditEvent, CheckResult } from '@covers/contract';
import { HISTORY_LIMITS } from '../lib/ask-limits';
import { usd } from '../lib/dinner';
import { AUDIT_LABEL } from '../lib/documents';
import { AUDIT_STEP, nameOf, sourceOf, type DocRef } from '../lib/map';

const QUICK = ['What happened here?', 'Why did it happen?', 'What are my options?'];

export function AuditLog({ planId, audit, loadAudit, checks, onGo, onDoc }: {
  planId: string; audit: AuditEvent[]; loadAudit: () => Promise<unknown>; checks: CheckResult[];
  /** Move the cable car to this step, if the dinner has reached it. */ onGo: (step: number) => void;
  onDoc: (r: DocRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<string | null>(null);
  const [about, setAbout] = useState<{ id: string; label: string } | null>(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat.length, asking]);

  const pick = (e: AuditEvent) => {
    if (row === e.id) { setRow(null); return; }
    setRow(e.id);
    setAbout({ id: e.id, label: AUDIT_LABEL[e.action] ?? e.action });
    const to = AUDIT_STEP[e.action];
    if (to !== undefined) onGo(to);
  };
  const ask = async (text?: string) => {
    const q = (text ?? question).trim();
    if (!q || asking) return;
    const history = chat.slice(-HISTORY_LIMITS.turns).map((m) => ({ ...m, content: m.content.slice(0, HISTORY_LIMITS.chars) }));
    setChat((c) => [...c, { role: 'user', content: q }]); setQuestion(''); setAsking(true);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId, question: q, history, ...(about ? { about: about.id } : {}) }) });
      const body = (await res.json()) as { ok: true; answer: string } | { ok: false; error: string };
      setChat((c) => [...c, { role: 'assistant', content: body.ok ? body.answer : body.error }]);
    } catch { setChat((c) => [...c, { role: 'assistant', content: 'The agent could not be reached. Try again.' }]); }
    finally { setAsking(false); }
  };

  return (
    <>
      <button onClick={() => { setOpen(true); void loadAudit(); }} aria-expanded={open} className="absolute bottom-3 left-5 z-20 flex h-11 cursor-pointer items-center gap-3 rounded-pill border border-ink-primary bg-bg-surface px-5 hover:bg-accent-tint">
        <span className="text-small font-strong">Audit log</span><span className="font-mono text-micro text-ink-muted">{audit.length}</span><span aria-hidden="true">▸</span>
      </button>
      <aside inert={!open} aria-hidden={!open} aria-label="Audit log" className={`absolute inset-y-0 left-0 z-40 flex w-105 max-w-full flex-col overflow-hidden rounded-r-[var(--space-6)] border-y border-r border-ink-primary bg-bg-surface transition-transform duration-(--motion-duration-slow) ease-standard motion-reduce:transition-none ${open ? '' : 'pointer-events-none -translate-x-full'}`}>
        <div className="flex items-baseline justify-between border-b border-ink-primary px-5 py-3">
          <h2 className="text-heading font-bold tracking-tight">Audit log<small className="block text-small font-regular tracking-normal text-ink-muted">{audit.length} actions, oldest first. Click one to go there and ask about it.</small></h2>
          <button aria-label="Close audit log" onClick={() => setOpen(false)} className="cursor-pointer text-heading leading-none">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-3">
          {audit.length === 0 && <p className="py-2 text-ink-muted">Actions on this dinner appear here.</p>}
          {audit.map((e) => {
            const expanded = row === e.id, check = checks.find((c) => c.ruleId === e.ruleId);
            return (
              <div key={e.id}>
                <button onClick={() => pick(e)} aria-expanded={expanded} className={`block w-full cursor-pointer border-b border-border px-1.5 py-2 text-left ${expanded ? 'bg-accent-tint' : 'hover:bg-bg-canvas'}`}>
                  <span className="flex justify-between text-small text-ink-muted"><b className="font-strong text-ink-primary">{nameOf(e.actorId)}</b><span className="font-mono text-micro">{new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span></span>
                  <span className="mt-0.5 block">{AUDIT_LABEL[e.action] ?? e.action}</span>
                  {e.detail && e.action !== 'plan.updated' && <span className="mt-0.5 block text-small text-ink-secondary">{e.detail.replace(/(\d+) cents/g, (_, c: string) => usd(Number(c)))}</span>}
                </button>
                {expanded && (
                  <div className="border-b border-border bg-bg-canvas px-1.5 py-2 text-small">
                    {([['Date', new Date(e.at).toLocaleString('en-US')], ['Input hash', e.inputHash], ['Rule', e.ruleId ?? 'None']] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-0.5"><span className="text-ink-muted">{k}</span><span className="font-mono text-micro">{v}</span></div>)}
                    {check && <button className="mt-1.5 cursor-pointer border border-border px-1.5 py-0.5 hover:border-ink-primary" onClick={() => onDoc(sourceOf(check))}>See the rule</button>}
                  </div>
                )}
              </div>
            );
          })}
          {chat.map((m, i) => <div key={i} className={`mt-2.5 ${m.role === 'user' ? 'bg-accent-tint px-2.5 py-1.5' : 'text-ink-secondary'}`}>{m.content}</div>)}
          {asking && <div className="mt-2.5 text-ink-muted">Reading the record…</div>}
          <div ref={end} />
        </div>
        {about && (
          <div className="border-t border-border px-5 pt-2.5">
            <div className="flex items-baseline justify-between gap-2 text-small"><span className="text-ink-muted">About: <b className="font-strong text-ink-primary">{about.label}</b></span><button aria-label="Stop asking about this entry" onClick={() => setAbout(null)} className="cursor-pointer text-ink-muted hover:text-ink-primary">×</button></div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{QUICK.map((q) => <button key={q} disabled={asking} onClick={() => void ask(q)} className="cursor-pointer rounded-pill border border-border px-2.5 py-1 text-small hover:border-ink-primary disabled:cursor-default disabled:opacity-50">{q}</button>)}</div>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className={`flex gap-1.5 px-5 py-3 ${about ? '' : 'border-t border-border'}`}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} aria-label="Ask the audit log" placeholder={about ? `Ask about "${about.label}"` : 'Ask the audit log why something happened'} className="min-w-0 flex-1 border border-border bg-bg-canvas px-2.5 py-2" />
          <button disabled={asking || !question.trim()} className="cursor-pointer border border-ink-primary px-3 font-strong disabled:cursor-default disabled:opacity-50">Ask</button>
        </form>
      </aside>
    </>
  );
}
