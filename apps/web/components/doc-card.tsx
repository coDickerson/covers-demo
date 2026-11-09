'use client';
// The one document format: same square, same zones, for every receipt, record and legal source.
import type { DocCardModel, DocRow } from '../lib/doc-cards';
import type { DocRef, Tone } from '../lib/map';

const CHIP: Record<Tone, string> = { '': 'bg-bg-canvas text-ink-secondary', ok: 'bg-status-ok/10 text-status-ok', near: 'bg-status-near/10 text-status-near', over: 'bg-status-over/10 text-status-over' };
const DOT: Record<Tone, string> = { '': 'bg-border', ok: 'bg-status-ok', near: 'bg-status-near', over: 'bg-status-over' };
const tag = 'inline-block px-1.5 py-0.5 font-mono text-micro whitespace-nowrap';

function Row({ r }: { r: DocRow }) {
  return (
    <div className={`flex items-center gap-2.5 border-b border-border px-3.5 py-1.5 last:border-b-0 ${r.on ? 'bg-accent-tint' : ''}`}>
      <i className={`size-2 shrink-0 rounded-pill ${DOT[r.dot ?? '']}`} />
      <span className="min-w-0 flex-1">{r.label}{r.desc && <small className="ml-1.5 text-small text-ink-muted">{r.desc}</small>}</span>
      {r.tag && <em className={`${tag} not-italic ${CHIP[r.tag[1]]}`}>{r.tag[0]}</em>}
      <span className="font-mono text-small whitespace-nowrap">{r.val}</span>
    </div>
  );
}

export function DocCard({ model: m, back, onDoc, onBack, onClose }: { model: DocCardModel; back?: string; onDoc: (r: DocRef) => void; onBack?: () => void; onClose?: () => void }) {
  return (
    <div role="dialog" aria-label={m.head} className="absolute top-1/2 left-1/2 z-30 flex size-170 max-h-[96%] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 border border-ink-primary bg-bg-surface px-6 pt-5 pb-4.5">
      {onClose && <button aria-label="Close" onClick={onClose} className="absolute top-2.5 right-3.5 cursor-pointer text-heading leading-none">×</button>}
      <div className="flex gap-2 overflow-hidden pr-7 font-mono text-micro whitespace-nowrap text-ink-muted">
        {back && <><button onClick={onBack} className="cursor-pointer text-ink-primary underline">← {back}</button><span>·</span></>}<span>{m.eye}</span>
      </div>
      <h2 className="line-clamp-2 text-verdict leading-tight font-bold tracking-tight">{m.head}</h2>
      <div><span className={`${tag} ${CHIP[m.pill[1]]}`}>{m.pill[0]}</span></div>
      <div className="flex min-h-0 flex-1 flex-col border border-border">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-bg-canvas px-3.5 py-2">
          <span className="min-w-0"><b className="block truncate">{m.table.title}</b><small className="block truncate text-small text-ink-muted">{m.table.sub}</small></span>
          {m.table.right && <span className="font-mono text-amount">{m.table.right}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {m.quote && <div className="m-3.5 bg-accent-tint p-3 leading-snug">{m.quote}</div>}
          {m.rows.map((r, i) => <Row key={i} r={r} />)}
        </div>
        <div className={`flex justify-between gap-4 border-t border-border px-3.5 py-2 font-strong ${m.foot[2] === 'over' ? 'bg-status-over/10 text-status-over' : ''}`}><span>{m.foot[0]}</span><span className="font-mono">{m.foot[1]}</span></div>
      </div>
      <div className="flex h-27 gap-3 border border-border bg-bg-canvas p-2.5">
        <div className="flex h-15 w-11.5 shrink-0 flex-col gap-1 border border-border bg-bg-surface p-1.5"><b className="font-mono text-[9px]">{m.source.tag}</b>{[0, 1, 2, 3].map((i) => <u key={i} className="block h-0.5 bg-border" />)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between font-mono text-micro text-ink-muted"><span>{m.source.eye}</span>{m.source.url && <a href={m.source.url} target="_blank" rel="noopener" className="text-ink-primary underline">Open ↗</a>}</div>
          <b className="mt-0.5 block truncate">{m.source.title}</b>
          <div className="mt-1 flex h-13.5 flex-wrap content-start gap-1.5 overflow-y-auto">
            {m.source.chips.map((c) => <button key={`${c.doc}:${c.at}`} onClick={() => onDoc(c)} className={`cursor-pointer border px-1.5 py-0.5 text-small ${c.on ? 'border-ink-primary bg-accent-tint' : 'border-border bg-bg-surface hover:border-ink-primary'}`}>{c.label}</button>)}
          </div>
        </div>
      </div>
      <p className="line-clamp-2 h-10 text-ink-secondary">{m.why}</p>
      <div className="flex gap-1.5 overflow-hidden whitespace-nowrap">
        {m.evidence.map((v) => typeof v === 'string' ? <span key={v} className={`${tag} ${CHIP['']}`}>{v}</span> : <button key={v.label} onClick={() => onDoc(v)} className={`${tag} ${CHIP['']} cursor-pointer underline`}>{v.label}</button>)}
      </div>
    </div>
  );
}
