'use client';
// The rep's phone, the morning after: the card was charged, so snap the receipt and tap who came.
// Opened from the "Close it out" button in the close-out ping (/m/{planId}). Phone-sized, one column, big targets.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloseOut, Hcp, PlanView, Receipt, ReceiptLine, Settlement } from '@covers/contract';
import { fixtures, IDS } from '@covers/contract/fixtures';
import { covers, CoversClientError } from '../lib/client';
import { usd } from '../lib/dinner';
import { dayOf, nameOf, speakerOf, venueOf } from '../lib/map';
import { buildAttendance, doubleCheck, MAX_ADDED, needsAnswers, noteFor, RELATIONS, type Added, type Finding, type Present, type Relation } from '../lib/attendance';

type Phase = 'loading' | 'receipt' | 'reading' | 'review' | 'who' | 'check' | 'sending' | 'done' | 'missing';
type GuestDraft = Partial<Extract<Added, { kind: 'guest' }>>;

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
  const [added, setAdded] = useState<Added[]>([]);
  const [adding, setAdding] = useState(false);
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
  const attendance = buildAttendance({ planId, repId: plan.repId, people, absent, added });
  const headcount = attendance.attendedNpis.length + attendance.employeesPresent + attendance.extraGuests;
  const present: Present[] = [
    ...people.filter((n) => !absent.has(n)).map((id) => ({ id, name: nameOf(id) })),
    ...(absent.has('rep') ? [] : [{ id: 'rep', name: `You (${nameOf(plan.repId)})` }]),
  ];
  const findings = doubleCheck({ present, added, headcount, printedCovers: receipt?.printedCovers, totalCents: receipt?.totalCents, capCents: fixtures.company.perPersonCapCents });
  const coversGap = receipt?.printedCovers !== undefined && receipt.printedCovers > headcount;
  const blocked = needsAnswers(findings);
  const update = (id: string, patch: GuestDraft) => setAdded((xs) => xs.map((x) => (x.id === id && x.kind === 'guest' ? { ...x, ...patch, kind: 'guest' } : x)));
  const confirm = async () => {
    setPhase('sending'); setError(null);
    try {
      const s = await covers.confirmAttendance(attendance);
      // Every added person goes on the audit trail with who they are, so compliance sees what the rep said.
      for (const x of added) await covers.addNote(planId, { step: 'close_out', target: x.name, text: noteFor(x, present) });
      const flagged = findings.filter((f) => f.tone !== 'ok' && !f.addedId);
      if (flagged.length) await covers.addNote(planId, { step: 'close_out', target: 'Double check', text: flagged.map((f) => f.text).join(' ') });
      setSettlement(s);
      setPhase('done');
    } catch (e) { setError(errorText(e, 'That did not go through. Try again.')); setPhase('check'); }
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

      {phase === 'who' && (
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
            {added.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
                <span>{x.name}<span className="text-small text-ink-muted"> · {x.kind === 'doctor' ? 'doctor, not invited' : x.kind}</span></span>
                <button className={quiet} onClick={() => setAdded((xs) => xs.filter((y) => y.id !== x.id))}>Remove</button>
              </li>
            ))}
          </ul>
          {coversGap && <p className="mt-3 border-l-2 border-status-near pl-3 text-small">The receipt prints {receipt?.printedCovers} covers but {headcount} {headcount === 1 ? 'person is' : 'people are'} marked. Did someone else eat?</p>}
          {added.length >= MAX_ADDED
            ? <p className="mt-3 text-small text-ink-muted">Up to {MAX_ADDED} people can be added at close-out. Anyone else goes to compliance directly.</p>
            : adding
            ? <AddPerson present={present} taken={new Set([...people, ...attendance.attendedNpis])} onAdd={(x) => { setAdded((xs) => [...xs, x]); setAdding(false); }} onCancel={() => setAdding(false)} />
            : <button className={`${quiet} mt-3`} onClick={() => setAdding(true)}>+ Add someone who wasn&apos;t on the invite</button>}
          <button className={`${primary} mt-5`} onClick={() => { setAdding(false); setPhase('check'); }}>Close it out</button>
        </section>
      )}

      {(phase === 'check' || phase === 'sending') && (
        <section className="mt-8">
          <h2 className="text-heading font-bold">3. Double check</h2>
          <p className="mt-1 text-small text-ink-secondary">{headcount} {headcount === 1 ? 'person' : 'people'} ate{receipt?.printedCovers !== undefined ? `; the receipt prints ${receipt.printedCovers} covers` : ''}.</p>
          {findings.length === 0 && <p className="mt-3 border-l-2 border-status-ok pl-3 text-small">Everyone was on the invite and the headcount matches the receipt.</p>}
          <ul className="mt-3 space-y-3">
            {findings.map((f, i) => {
              const guest = added.find((x) => x.id === f.addedId);
              const firstAsk = guest?.kind === 'guest' && findings.findIndex((g) => g.addedId === f.addedId && g.tone === 'ask') === i;
              return (
                <li key={i} className={`border-l-2 pl-3 text-small ${toneBorder(f)}`}>
                  {f.text}
                  {firstAsk && guest.kind === 'guest' && <GuestFields guest={guest} present={present} onChange={(p) => update(guest.id, p)} />}
                </li>
              );
            })}
          </ul>
          <button className={`${primary} mt-5`} disabled={phase === 'sending' || blocked} onClick={() => void confirm()}>{phase === 'sending' ? 'Closing out…' : blocked ? 'Answer the questions above' : 'Confirm and close out'}</button>
          <button className={`${quiet} mt-3`} disabled={phase === 'sending'} onClick={() => setPhase('who')}>Back to who came</button>
        </section>
      )}

      {phase === 'done' && settlement && <Done settlement={settlement} planId={planId} />}
    </Shell>
  );
}

const toneBorder = (f: Finding) => (f.tone === 'ok' ? 'border-status-ok' : f.tone === 'review' ? 'border-status-near' : 'border-status-over');
const field = 'mt-1 block w-full border border-border bg-bg-surface px-3 py-2';
let nextId = 0;
const newId = () => `added-${++nextId}`;

/** The "+ Add someone" form: a doctor from the registry, a coworker, or a guest with who they came with and why. */
function AddPerson({ present, taken, onAdd, onCancel }: { present: Present[]; taken: Set<string>; onAdd: (x: Added) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<Added['kind']>('guest');
  const [name, setName] = useState('');
  const [hits, setHits] = useState<Hcp[] | null>(null);
  const [guest, setGuest] = useState<GuestDraft>({});
  const search = async () => {
    setHits(null);
    try { setHits((await covers.searchHcps(name.trim())).filter((h) => !taken.has(h.npi))); } catch { setHits([]); }
  };
  const [maybe, setMaybe] = useState<Hcp[] | null>(null); // registry matches for a "coworker" who may be a clinician
  const addCoworker = () => onAdd({ kind: 'coworker', id: newId(), name: name.trim() });
  const add = async () => {
    if (kind === 'guest') return onAdd({ ...guest, kind: 'guest', id: newId(), name: name.trim() });
    // A clinician entered as a coworker would skip the Open Payments row, so check the registry first.
    const parts = name.trim().split(/\s+/);
    let found: Hcp[] = [];
    if (parts.length >= 2) { try { found = (await covers.searchHcps(name.trim())).filter((h) => !taken.has(h.npi)); } catch { found = []; } }
    if (found.length) setMaybe(found.slice(0, 3)); else addCoworker();
  };
  return (
    <div className="mt-3 border border-border bg-bg-surface p-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Who are you adding?">
        {(['doctor', 'coworker', 'guest'] as const).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setHits(null); setMaybe(null); }}
            className={`flex-1 cursor-pointer border px-2 py-2 text-small font-strong ${kind === k ? 'border-ink-primary bg-accent text-on-accent' : 'border-border'}`}>
            {k === 'doctor' ? 'Doctor' : k === 'coworker' ? 'Coworker' : 'Guest'}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-small">{kind === 'doctor' ? 'Name or NPI' : 'Name'}
        <input id="add-person-name" className={field} value={name} onChange={(e) => { setName(e.target.value); setMaybe(null); }} />
      </label>
      {kind === 'guest' && <GuestFields guest={guest} present={present} onChange={(p) => setGuest((g) => ({ ...g, ...p }))} />}
      {kind === 'doctor' && hits && (
        <ul className="mt-2">
          {hits.length === 0 && <li className="text-small text-ink-muted">No match in the registry.</li>}
          {hits.slice(0, 5).map((h) => (
            <li key={h.npi}>
              <button className="w-full cursor-pointer border-b border-border py-2 text-left text-small" onClick={() => onAdd({ kind: 'doctor', id: newId(), npi: h.npi, name: h.name })}>
                {h.name}<span className="text-ink-muted"> · {h.specialty ?? 'clinician'} · {h.state} · NPI {h.npi}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {maybe && (
        <div className="mt-3 border-l-2 border-status-over pl-3 text-small">
          <p>The doctor registry has a clinician named {name.trim()}. Is this one of them?</p>
          <ul className="mt-1">
            {maybe.map((h) => (
              <li key={h.npi}>
                <button className="w-full cursor-pointer border-b border-border py-2 text-left" onClick={() => onAdd({ kind: 'doctor', id: newId(), npi: h.npi, name: h.name })}>
                  Yes: {h.name}<span className="text-ink-muted"> · {h.specialty ?? 'clinician'} · {h.state}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className={`${quiet} mt-2`} onClick={addCoworker}>No, a coworker with the same name</button>
        </div>
      )}
      <div className="mt-3 flex items-center gap-4">
        {kind === 'doctor'
          ? <button className={`${secondary} flex-1`} disabled={name.trim().length < 2} onClick={() => void search()}>Find in the registry</button>
          : <button className={`${secondary} flex-1`} disabled={!name.trim() || maybe !== null} onClick={() => void add()}>Add</button>}
        <button className={quiet} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function GuestFields({ guest, present, onChange }: { guest: GuestDraft; present: Present[]; onChange: (p: GuestDraft) => void }) {
  const key = guest.id ?? 'new';
  return (
    <div className="mt-2 space-y-2 text-ink-primary">
      <label className="block text-small">Came with
        <select id={`guest-with-${key}`} className={field} value={guest.withId ?? ''} onChange={(e) => onChange({ withId: e.target.value || undefined })}>
          <option value="">Choose…</option>
          {present.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block text-small">How they&apos;re related
        <select id={`guest-relation-${key}`} className={field} value={guest.relation ?? ''} onChange={(e) => onChange({ relation: (e.target.value || undefined) as Relation | undefined })}>
          <option value="">Choose…</option>
          {RELATIONS.map(([r, label]) => <option key={r} value={r}>{label}</option>)}
        </select>
      </label>
      {guest.relation === 'other' && (
        <label className="block text-small">Business reason
          <input id={`guest-reason-${key}`} className={field} value={guest.reason ?? ''} onChange={(e) => onChange({ reason: e.target.value })} />
        </label>
      )}
    </div>
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
