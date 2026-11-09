'use client';
// The side panel: dinner → checker → document. Each level links to the next, so every claim can be traced to its source.
import { useEffect, useState } from 'react';
import type { AuditEvent, CapStatus, CheckResult, PlanView, Receipt, Settlement } from '@covers/contract';
import { fixtures } from '@covers/contract/fixtures';
import { covers } from '../lib/client';
import { afterChecks, beforeChecks, CHECKERS, evidenceDoc, SOURCES, usd, type CheckerId } from '../lib/dinner';
import { AUDIT_DOC, AUDIT_LABEL, DOC_LIST, POLICY, type DocKey } from '../lib/documents';

export type PanelView =
  | { kind: 'checker'; id: CheckerId; pass?: 'before' | 'after' }
  | { kind: 'people' }
  | { kind: 'documents' };
export type DocRef = { key: DocKey; at?: string };

export type DinnerData = { view: PlanView; receipt: Receipt | null; settlement: Settlement | null; nameOf: (id: string) => string };

const linkClass = 'cursor-pointer underline decoration-ink-muted underline-offset-3 hover:decoration-ink-primary';
const rowClass = 'flex justify-between gap-5 border-b border-border py-2.5';

function CloseButton({ onClose }: { onClose: () => void }) {
  return <button aria-label="Close" onClick={onClose} className="float-right cursor-pointer px-1.5 text-heading leading-none">×</button>;
}

function Title({ kicker, children }: { kicker: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="text-small text-ink-muted">{kicker}</div>
      <h3 className="mt-2 mb-5 text-verdict font-bold leading-tight tracking-tight">{children}</h3>
    </>
  );
}

function CheckerDetail({ id, pass, data, onDoc, onPass, onRemove, onClose }: {
  id: CheckerId; pass?: 'before' | 'after'; data: DinnerData; onDoc: (d: DocRef) => void;
  onPass: (p: 'before' | 'after') => void; onRemove: (npi: string) => void; onClose: () => void;
}) {
  const { view, settlement } = data;
  const checker = CHECKERS.find((c) => c.id === id)!;
  const hasAfter = !!settlement && id !== 'P1';
  const shown = pass ?? (hasAfter ? 'after' : 'before');
  const checks = shown === 'after' ? afterChecks(id, settlement) : beforeChecks(id, view.evaluation);
  const order = { block: 0, flag: 1, pass: 2 } as const;
  const sorted = [...checks].sort((a, b) => order[a.outcome] - order[b.outcome]);
  const top = sorted[0];
  const failing = top && top.outcome !== 'pass';
  const heading = failing
    ? top.message
    : top
      ? checks.length === 1 ? top.message : `All ${checks.length} checks passed`
      : shown === 'after' ? 'Passed, based on the settlement' : id === 'P6' ? 'Reporting runs after the dinner' : view.evaluation ? 'Nothing to flag' : 'Waiting for the checks to run';

  const blockedCap: CapStatus | undefined = id === 'P4' && top?.outcome === 'block' && top.subject.kind === 'hcp'
    ? view.evaluation?.caps.find((c) => top.subject.kind === 'hcp' && c.npi === top.subject.npi)
    : undefined;

  return (
    <>
      <CloseButton onClose={onClose} />
      <Title kicker={`${checker.name} · ${shown === 'after' ? 'After the dinner' : 'Before the dinner'}`}>{heading}</Title>
      {hasAfter && id !== 'P6' && (
        <div className="-mt-2 mb-4 flex gap-4 text-small">
          {(['before', 'after'] as const).map((p) => (
            <button key={p} onClick={() => onPass(p)} className={`cursor-pointer capitalize ${p === shown ? 'font-bold' : 'text-ink-muted'}`}>{p}</button>
          ))}
        </div>
      )}
      {blockedCap && (
        <div className="font-mono text-small">
          <div className={rowClass}><span className="font-sans">Paid this year</span><button className={linkClass} onClick={() => onDoc({ key: 'ledger', at: blockedCap.npi })}>{usd(blockedCap.ytdCents)}</button></div>
          <div className={rowClass}><span className="font-sans">This dinner, estimated</span><span>+ {usd(blockedCap.projectedCents - blockedCap.ytdCents)}</span></div>
          <div className={rowClass}><span className="font-sans">Annual limit</span><button className={linkClass} onClick={() => onDoc({ key: 'policy', at: 'annual' })}>{usd(blockedCap.capCents)}</button></div>
          <div className="flex justify-between border-t border-ink-primary py-2.5 font-bold"><span className="font-sans">Over by</span><span>{usd(blockedCap.projectedCents - blockedCap.capCents)}</span></div>
        </div>
      )}
      {!blockedCap && sorted.map((c) => <CheckRow key={c.id} check={c} onDoc={onDoc} />)}
      <div className="mt-4 text-small text-ink-secondary">
        <b className="text-ink-primary">Source: </b>
        {SOURCES[id].map((s, i) => (
          <span key={s.doc}>{i > 0 && ', '}<button className={linkClass} onClick={() => onDoc({ key: s.doc, at: s.at })}>{DOC_LIST.find((d) => d.key === s.doc)!.title}</button></span>
        ))}
      </div>
      {blockedCap && top && (
        <div className="mt-6">
          <button onClick={() => onRemove(blockedCap.npi)} className="cursor-pointer bg-accent px-5 py-3 font-strong text-on-accent">Remove {data.nameOf(blockedCap.npi)}</button>
          <div className="mt-2 text-small text-ink-muted">This block can't be approved by anyone.</div>
        </div>
      )}
    </>
  );
}

function CheckRow({ check, onDoc }: { check: CheckResult; onDoc: (d: DocRef) => void }) {
  const tone = check.outcome === 'block' ? 'text-status-over' : check.outcome === 'flag' && !check.approval ? 'text-status-near' : 'text-status-ok';
  const word = check.outcome === 'block' ? 'Blocked' : check.approval ? 'Approved' : check.outcome === 'flag' ? 'Flagged' : 'Clear';
  const ev = check.evidence.map(evidenceDoc).find(Boolean);
  return (
    <div className={`${rowClass} text-small`}>
      <span>{check.message}{ev && <> <button className={`${linkClass} text-ink-muted`} onClick={() => onDoc({ key: ev.doc, at: ev.at })}>Evidence</button></>}</span>
      <span className={`font-strong ${tone}`}>{word}</span>
    </div>
  );
}

function People({ data, onDoc, onClose }: { data: DinnerData; onDoc: (d: DocRef) => void; onClose: () => void }) {
  const caps = data.settlement?.caps ?? data.view.evaluation?.caps ?? [];
  const ids = data.settlement ? data.settlement.byPerson.flatMap((p) => (p.npi ? [p.npi] : [])) : [...data.view.plan.inviteeNpis, speakerOf(data.view).hcp.npi];
  return (
    <>
      <CloseButton onClose={onClose} />
      <Title kicker="Who's on this dinner">{ids.length} clinicians, plus the rep</Title>
      {ids.map((npi) => {
        const c = caps.find((x) => x.npi === npi);
        return (
          <div key={npi} className={`${rowClass} text-small`}>
            <span>{data.nameOf(npi)}</span>
            <button className={`${linkClass} font-mono ${c?.state === 'over' ? 'text-status-over' : ''}`} onClick={() => onDoc({ key: 'ledger', at: npi })}>
              {c ? `${usd(c.projectedCents)} of ${usd(c.capCents)}` : 'Registry record'}
            </button>
          </div>
        );
      })}
      <div className="mt-3 text-small text-ink-muted">Yearly total including this dinner. Demo doctors are fictional.</div>
    </>
  );
}

const speakerOf = (view: PlanView) => fixtures.speakers.find((s) => s.id === view.plan.speakerId) ?? fixtures.speakers[0]!;

function DocList({ onDoc, onClose }: { onDoc: (d: DocRef) => void; onClose: () => void }) {
  return (
    <>
      <CloseButton onClose={onClose} />
      <Title kicker="Documents on this dinner">Everything behind these decisions</Title>
      {DOC_LIST.map((d) => (
        <div key={d.key} className={`${rowClass} text-small`}>
          <button className={`${linkClass} text-left`} onClick={() => onDoc({ key: d.key })}>{d.title}</button>
          <span className="text-ink-muted">{d.kind}</span>
        </div>
      ))}
    </>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="border border-dashed border-ink-muted p-3.5 text-small text-ink-secondary">
      <b className="text-ink-primary">Stored passage goes here: {what}.</b>
      <br />The document's exact wording isn't stored yet, so nothing is quoted until it is.
    </div>
  );
}

function DocBody({ doc, data, onDoc }: { doc: DocRef; data: DinnerData; onDoc: (d: DocRef) => void }) {
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [ledger, setLedger] = useState<CapStatus[] | null>(null);
  const planId = data.view.plan.id;
  useEffect(() => {
    if (doc.key === 'audit') void covers.listAudit({ planId }).then(setAudit);
    if (doc.key === 'ledger') void covers.getLedger().then(setLedger);
  }, [doc.key, planId]);

  const hl = (on: boolean) => (on ? 'bg-accent-tint -mx-2 px-2' : '');
  const empty = (t: string) => <div className="text-small text-ink-muted">{t}</div>;
  const { plan } = data.view;

  switch (doc.key) {
    case 'policy':
      return <>{POLICY.map((p) => <p key={p.at} className={`mb-2 py-2 ${hl(p.at === doc.at)}`}>{p.text}</p>)}</>;
    case 'oig':
      return <Missing what={doc.at === 'speaker' ? 'speaker selection' : 'alcohol and repeat attendance'} />;
    case 'cms':
      return <Missing what="what must be reported for each recipient" />;
    case 'cal':
      return (
        <>
          <p className="bg-accent-tint px-2.5 py-2">"Each pharmaceutical company shall establish explicitly in its Comprehensive Compliance Program a specific annual dollar limit…"</p>
          <div className="mt-2 text-small text-ink-muted">From a 2009 copy of the code. Confirm the current text, and whether it covers device companies.</div>
        </>
      );
    case 'audit':
      if (!audit) return empty('Loading…');
      return audit.length ? (
        <>
          {audit.map((e) => {
            const target = AUDIT_DOC[e.action];
            const label = AUDIT_LABEL[e.action] ?? e.action;
            return (
              <div key={e.id} className={`${rowClass} text-small`}>
                <span>{target ? <button className={`${linkClass} text-left`} onClick={() => onDoc({ key: target })}>{label}</button> : label}<br /><span className="text-ink-muted">{data.nameOf(e.actorId)} · {e.detail}</span></span>
                <span className="shrink-0 text-right font-mono text-micro text-ink-muted">{new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<br />#{e.inputHash.slice(0, 8)}</span>
              </div>
            );
          })}
        </>
      ) : empty('Nothing has happened on this dinner yet.');
    case 'ledger':
      if (!ledger) return empty('Loading…');
      return (
        <>
          {[...ledger].sort((a, b) => b.ytdCents - a.ytdCents).map((l) => (
            <div key={l.npi} className={`${rowClass} text-small ${hl(l.npi === doc.at)}`}>
              <span>{data.nameOf(l.npi)}{l.sameTopicCount12mo > 0 && <span className="text-ink-muted"> · {l.sameTopicCount12mo} on this topic in 12 months</span>}</span>
              <span className="font-mono">{usd(l.ytdCents)}</span>
            </div>
          ))}
        </>
      );
    case 'npi': {
      const npis = [...new Set([speakerOf(data.view).hcp.npi, ...plan.inviteeNpis, ...(doc.at ? [doc.at] : [])])];
      return <>{npis.map((n) => <div key={n} className={`${rowClass} text-small ${hl(n === doc.at)}`}><span>{data.nameOf(n)}</span><span className="font-mono">{n}</span></div>)}</>;
    }
    case 'speaker': {
      const s = speakerOf(data.view);
      return (
        <div className="text-small">
          <div className={rowClass}><span>Speaker</span><span>{s.hcp.name}</span></div>
          <div className={rowClass}><span>Status</span><span className="capitalize">{s.status.replace('_', ' ')}</span></div>
          <div className={rowClass}><span>Approved topics</span><span>{s.approvedTopics.join(', ')}</span></div>
          <div className={rowClass}><span>Contract ends</span><span className="font-mono">{s.contractEnds}</span></div>
        </div>
      );
    }
    case 'receipt':
      if (!data.receipt) return empty('No receipt yet.');
      return (
        <div className="border border-border bg-bg-canvas px-5 py-4 font-mono text-small leading-loose">
          {data.receipt.lines.map((l) => <div key={l.id} className={`flex justify-between gap-3 ${hl(l.category === 'alcohol')}`}><span>{l.text}</span><span>{(l.amountCents / 100).toFixed(2)}</span></div>)}
          <div className="mt-2 flex justify-between border-t border-dashed border-ink-muted pt-1.5 font-bold"><span>Total</span><span>{(data.receipt.totalCents / 100).toFixed(2)}</span></div>
        </div>
      );
    case 'attendance': {
      const st = data.settlement;
      if (!st) return empty('Not confirmed yet.');
      const ate = new Set(st.byPerson.map((p) => p.npi ?? p.who));
      const everyone = [speakerOf(data.view).hcp.npi, ...plan.inviteeNpis, ...st.byPerson.filter((p) => !p.npi).map((p) => p.who)];
      return <>{everyone.map((id) => <div key={id} className={`${rowClass} text-small ${ate.has(id) ? '' : 'text-ink-muted'}`}><span>{data.nameOf(id)}</span><span>{ate.has(id) ? usd(st.byPerson.find((p) => (p.npi ?? p.who) === id)!.amountCents) : 'Did not eat'}</span></div>)}</>;
    }
    case 'fund':
      if (!plan.fundId) return empty('No card issued yet.');
      return (
        <div className="text-small">
          <div className={rowClass}><span>Card limit, restaurants only</span><span className="font-mono">{usd(fixtures.company.perPersonCapCents * (plan.inviteeNpis.length + 1 + plan.employeeCount))}</span></div>
          <div className={rowClass}><span>Fund</span><span className="font-mono">{plan.fundId}</span></div>
        </div>
      );
  }
}

function DocumentView({ doc, back, data, onDoc, onBack, onClose }: { doc: DocRef; back: string; data: DinnerData; onDoc: (d: DocRef) => void; onBack: () => void; onClose: () => void }) {
  const d = DOC_LIST.find((x) => x.key === doc.key)!;
  return (
    <>
      <CloseButton onClose={onClose} />
      <button className={`${linkClass} text-small text-ink-secondary`} onClick={onBack}>← {back}</button>
      <h3 className="mt-3.5 text-verdict font-bold leading-tight tracking-tight">{d.title}</h3>
      <div className="mt-1.5 mb-4.5 text-small text-ink-muted">{d.meta}{d.url && <> · <a className={linkClass} href={d.url} target="_blank" rel="noopener noreferrer">Original ↗</a></>}</div>
      <DocBody doc={doc} data={data} onDoc={onDoc} />
    </>
  );
}

export function DinnerPanel({ panel, doc, data, onPanel, onDoc, onRemove, onClose }: {
  panel: PanelView | null; doc: DocRef | null; data: DinnerData;
  onPanel: (p: PanelView) => void; onDoc: (d: DocRef | null) => void; onRemove: (npi: string) => void; onClose: () => void;
}) {
  const back = !panel ? '' : panel.kind === 'checker' ? CHECKERS.find((c) => c.id === panel.id)!.name : panel.kind === 'people' ? 'People' : 'Documents';
  return (
    <aside className={`fixed inset-y-0 right-0 w-115 max-w-full overflow-auto border-l border-ink-primary bg-bg-surface p-8 transition-transform duration-(--motion-duration-base) ease-standard ${panel ? 'translate-x-0' : 'translate-x-[102%]'}`}>
      {panel && doc && <DocumentView doc={doc} back={back} data={data} onDoc={onDoc} onBack={() => onDoc(null)} onClose={onClose} />}
      {panel && !doc && panel.kind === 'checker' && <CheckerDetail id={panel.id} pass={panel.pass} data={data} onDoc={onDoc} onPass={(pass) => onPanel({ ...panel, pass })} onRemove={onRemove} onClose={onClose} />}
      {panel && !doc && panel.kind === 'people' && <People data={data} onDoc={onDoc} onClose={onClose} />}
      {panel && !doc && panel.kind === 'documents' && <DocList onDoc={onDoc} onClose={onClose} />}
    </aside>
  );
}
