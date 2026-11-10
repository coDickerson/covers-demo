'use client';
// The rep's phone, the morning after: the card was charged, so snap the receipt and tap who came.
// Opened from the "Close it out" button in the close-out ping (/m/{planId}). Phone-sized, one column, big targets.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloseOut, PlanView, Receipt, ReceiptLine, Settlement } from '@covers/contract';
import { IDS } from '@covers/contract/fixtures';
import { covers, CoversClientError } from '../lib/client';
import { usd } from '../lib/dinner';
import { dayOf, nameOf, speakerOf, venueOf } from '../lib/map';

type Phase = 'loading' | 'receipt' | 'reading' | 'review' | 'who' | 'sending' | 'done' | 'missing';

const primary = 'block w-full cursor-pointer border border-ink-primary bg-accent px-4 py-3 text-center font-strong text-on-accent disabled:cursor-default disabled:opacity-60';
const secondary = 'block w-full cursor-pointer border border-ink-primary px-4 py-3 text-center font-strong';
const quiet = 'cursor-pointer text-small text-ink-secondary underline';
const LOW_CONFIDENCE = 0.8;
const MAX_EDGE = 1600; // pixels: plenty for a receipt, and keeps the upload and the model call small

/** Shrinks the photo in the browser and returns it as base64 JPEG (no data: prefix). */
async function shrink(file: File): Promise<{ base64: string; mime: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const preview = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: preview.slice(preview.indexOf(',') + 1), mime: 'image/jpeg', preview };
}

const errorText = (e: unknown, fallback: string) => (e instanceof CoversClientError ? e.message : fallback);

export function CloseOutPhone({ planId }: { planId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [view, setView] = useState<PlanView | null>(null);
  const [charge, setCharge] = useState<CloseOut | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const v = await covers.getPlan(planId);
      setView(v);
      // Opening this page also asks Ramp whether the card has been charged, so it works without the watcher.
      const [seen, r, s] = await Promise.all([v.closeOut ? Promise.resolve(v.closeOut) : covers.checkForCharge(planId).catch(() => null), covers.getReceipt(planId), covers.getSettlement(planId)]);
      setCharge(seen ?? null); setReceipt(r); setSettlement(s);
      setPhase(s ? 'done' : r ? 'review' : 'receipt');
    } catch (e) {
      setError(errorText(e, 'This dinner could not be loaded.'));
      setPhase('missing');
    }
  }, [planId]);
  useEffect(() => { void load(); }, [load]);

  const read = async (image: Parameters<typeof covers.submitReceipt>[1]) => {
    setPhase('reading'); setError(null);
    try { setReceipt(await covers.submitReceipt(planId, image)); setPhase('review'); }
    catch (e) { setError(errorText(e, 'The receipt could not be read. Try another photo.')); setPhase('receipt'); }
  };
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    try { const img = await shrink(file); setPreview(img.preview); await read({ base64: img.base64, mime: img.mime }); }
    catch { setError('That file could not be opened as a photo.'); setPhase('receipt'); }
    finally { if (camera.current) camera.current.value = ''; }
  };

  if (phase === 'loading') return <Shell><p className="text-ink-secondary">Loading…</p></Shell>;
  if (phase === 'missing' || !view) return <Shell><h1 className="text-title font-bold">Dinner not found</h1><p className="mt-2 text-ink-secondary">{error}</p></Shell>;

  const { plan } = view;
  const speakerNpi = speakerOf(plan)?.hcp.npi;
  const people = [...(speakerNpi ? [speakerNpi] : []), ...plan.inviteeNpis];
  const toggle = (id: string) => setAbsent((a) => { const n = new Set(a); if (!n.delete(id)) n.add(id); return n; });
  const confirm = async () => {
    setPhase('sending'); setError(null);
    try {
      setSettlement(await covers.confirmAttendance({ planId, attendedNpis: people.filter((n) => !absent.has(n)), employeesPresent: absent.has('rep') ? 0 : 1, extraGuests: 0, confirmedBy: plan.repId }));
      setPhase('done');
    } catch (e) { setError(errorText(e, 'That did not go through. Try again.')); setPhase('who'); }
  };

  return (
    <Shell>
      <p className="text-small font-strong text-ink-muted">CLOSE OUT</p>
      <h1 className="mt-1 text-title leading-tight font-bold tracking-tight">{plan.title.replace(/^Speaker dinner: /, '')}</h1>
      <p className="mt-1 text-ink-secondary">{dayOf(plan)} · {venueOf(plan)}</p>

      <div className="mt-5 border border-border bg-bg-surface p-4">
        <p className="text-small text-ink-muted">Card activity</p>
        {charge
          ? <p className="mt-1"><b className="font-mono text-amount tabular">{usd(charge.chargedCents)}</b>{charge.merchantName && <span className="text-ink-secondary"> at {charge.merchantName}</span>}</p>
          : <p className="mt-1 text-ink-secondary">No charge on the card yet.</p>}
      </div>

      {error && <p role="alert" className="mt-4 border border-status-over p-3 text-small text-status-over">{error}</p>}

      {phase === 'receipt' && (
        <section className="mt-6">
          <h2 className="text-heading font-bold">1. Snap the receipt</h2>
          <p className="mt-1 text-small text-ink-secondary">Every line is read and checked. Cover the card number if you like.</p>
          <label className={`${primary} mt-4`}>
            Take a photo
            <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
          <button className={`${quiet} mt-4`} onClick={() => void read({ sampleId: IDS.cleanReceipt })}>No receipt handy? Use the sample one</button>
        </section>
      )}

      {phase === 'reading' && (
        <section className="mt-6" aria-live="polite">
          {preview && <img src={preview} alt="The receipt photo" className="max-h-64 w-full border border-border object-contain" />}
          <p className="mt-4 font-strong">Reading the receipt…</p>
          <p className="text-small text-ink-secondary">Each line becomes food, alcohol, tax or tip.</p>
        </section>
      )}

      {(phase === 'review' || phase === 'who' || phase === 'sending') && receipt && (
        <section className="mt-6">
          <h2 className="text-heading font-bold">1. Receipt</h2>
          <Lines lines={receipt.lines} />
          <div className="flex justify-between border-t border-ink-primary pt-2 font-strong"><span>Total</span><span className="font-mono tabular">{usd(receipt.totalCents)}</span></div>
          {charge && charge.chargedCents !== receipt.totalCents && (
            <p className="mt-2 text-small text-status-near">The card was charged {usd(charge.chargedCents)}, {usd(Math.abs(charge.chargedCents - receipt.totalCents))} {charge.chargedCents > receipt.totalCents ? 'more' : 'less'} than this receipt. Compliance will see both.</p>
          )}
          {phase === 'review' && (
            <div className="mt-5 space-y-3">
              <button className={primary} onClick={() => setPhase('who')}>Looks right</button>
              <button className={quiet} onClick={() => { setReceipt(null); setPreview(null); setPhase('receipt'); }}>Retake the photo</button>
            </div>
          )}
        </section>
      )}

      {(phase === 'who' || phase === 'sending') && (
        <section className="mt-8">
          <h2 className="text-heading font-bold">2. Who came?</h2>
          <p className="mt-1 text-small text-ink-secondary">Tap anyone who did not make it.</p>
          <ul className="mt-3">
            {[...people, 'rep'].map((id) => {
              const here = !absent.has(id);
              const who = id === 'rep' ? `You (${nameOf(plan.repId)})` : nameOf(id);
              return (
                <li key={id}>
                  <button aria-pressed={here} onClick={() => toggle(id)} className="flex w-full cursor-pointer items-center justify-between border-b border-border py-3 text-left">
                    <span className={here ? '' : 'text-ink-muted line-through'}>{who}{id === speakerNpi && <span className="text-small text-ink-muted"> · speaker</span>}</span>
                    <span className={`text-small font-strong ${here ? 'text-status-ok' : 'text-ink-muted'}`}>{here ? 'Came' : 'No-show'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button className={`${primary} mt-5`} disabled={phase === 'sending'} onClick={() => void confirm()}>{phase === 'sending' ? 'Closing out…' : 'Close it out'}</button>
        </section>
      )}

      {phase === 'done' && settlement && <Done settlement={settlement} planId={planId} />}
    </Shell>
  );
}

function Lines({ lines }: { lines: ReceiptLine[] }) {
  return (
    <ul className="mt-3">
      {lines.map((l, n) => {
        // Lines stream in one by one (the storyboard's "lines stream in with confidence dots; the wine tags itself").
        const delay = { animationDelay: `calc(var(--motion-stagger) * ${n * 4})` };
        const sure = l.confidence >= LOW_CONFIDENCE;
        return (
          <li key={l.id} style={delay} className="covers-line flex items-baseline justify-between gap-3 border-b border-border py-2">
            <span className="flex min-w-0 items-baseline gap-2">
              <i title={sure ? 'Read confidently' : 'Needs a check'} className={`size-2 shrink-0 ${sure ? 'bg-status-ok' : 'bg-status-near'}`} />
              <span className="min-w-0">
                <span className="block truncate">{l.text}</span>
                <span style={l.category === 'alcohol' ? delay : undefined} className={`text-micro font-strong ${l.category === 'alcohol' ? 'covers-flash px-1 -mx-1 text-status-near' : 'text-ink-muted'}`}>{l.category.toUpperCase()}{!sure && <span className="text-status-near"> · CHECK THIS LINE</span>}</span>
              </span>
            </span>
            <span className="font-mono tabular">{usd(l.amountCents)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Done({ settlement, planId }: { settlement: Settlement; planId: string }) {
  const toCompliance = settlement.exceptions.length > 0;
  return (
    <section className="mt-8" aria-live="polite">
      <p className={`text-small font-strong ${toCompliance ? 'text-status-near' : 'text-status-ok'}`}>{toCompliance ? 'SENT TO COMPLIANCE' : 'CLOSED OUT'}</p>
      <h2 className="mt-1 text-verdict leading-tight font-bold tracking-tight">{usd(settlement.perPersonCents)} per person</h2>
      <p className="mt-1 text-ink-secondary">{settlement.headcount} people ate. {settlement.openPayments.length} Open Payments {settlement.openPayments.length === 1 ? 'row is' : 'rows are'} drafted.</p>
      {toCompliance && (
        <ul className="mt-4 space-y-2">
          {settlement.exceptions.map((x) => <li key={x.id} className="border-l-2 border-status-near pl-3 text-small">{x.message}</li>)}
        </ul>
      )}
      <Link href={`/plans/${encodeURIComponent(planId)}`} className={`${secondary} mt-6`}>Open the full dinner</Link>
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-bg-canvas px-4 py-6">
      <p className="mb-6 font-bold">Covers</p>
      {children}
    </main>
  );
}
