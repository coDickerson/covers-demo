'use client';
// One dinner: the bell walks real results, the decision opens in the middle, the right side follows what is happening.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AuditEvent, PlanView, PolicyDocument, Receipt, Settlement, StepNote, Evaluation } from '@covers/contract';
import { fixtures, IDS } from '@covers/contract/fixtures';
import { covers, CoversClientError } from '../lib/client';
import { buildCard } from '../lib/doc-cards';
import { AUDIT_LABEL } from '../lib/documents';
import { openFlag, STEPS, stepOf, usd, type Role } from '../lib/dinner';
import { cardLimitOf, dayOf, headcountOf, layoutPath, nameOf, restingStation, speakerOf, STEP_KEYS, stationsFor, type DinnerState, type DocRef, type Station } from '../lib/map';
import { AppBar, readRole, setRoleCookie } from './app-bar';
import { Bell, BELL_FRAMES } from './bell';
import { DocCard } from './doc-card';
import { useRuns, type Stage } from './run-provider';

const primary = 'cursor-pointer border border-ink-primary bg-accent px-4 py-2.5 font-strong text-on-accent disabled:cursor-default disabled:opacity-60';
const secondary = 'cursor-pointer border border-ink-primary px-4 py-2.5 font-strong hover:bg-bg-surface';
const MARK_BOX: Record<Station['mark'], string> = { clear: 'border-ink-primary bg-ink-primary', blocked: 'border-status-over bg-status-over', flagged: 'border-status-near bg-status-near', waiting: 'border-border bg-bg-surface', none: 'border-border bg-bg-surface' };
const MARK_TEXT: Record<Station['mark'], string> = { clear: 'text-status-ok', blocked: 'font-strong text-status-over', flagged: 'font-strong text-status-near', waiting: 'text-ink-muted', none: 'text-ink-muted' };
const MARK_WORD: Record<Station['mark'], string> = { clear: 'Clear', blocked: 'Blocked', flagged: 'Flagged', waiting: 'Waiting', none: 'After the dinner' };
const CARD_EDGE: Record<Station['mark'], string> = { clear: 'border-ink-primary', blocked: 'border-status-over', flagged: 'border-status-near', waiting: 'border-border', none: 'border-border' };
const TONE_TEXT = { '': '', ok: 'text-status-ok', near: 'text-status-near', over: 'text-status-over' } as const;

/** The bell on the path. Its stride follows distance, so the legs never slide; its feet stay on the line. */
function Walker({ pathRef, trailRef, target, startAtZero, stopLengths, alert, onClick }: {
  pathRef: React.RefObject<SVGPathElement | null>; trailRef: React.RefObject<SVGPathElement | null>; target: number; startAtZero: boolean; stopLengths: number[]; alert: boolean; onClick: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const flip = useRef<HTMLDivElement>(null);
  const position = useRef<number | null>(null);
  const [frame, setFrame] = useState(0);

  useLayoutEffect(() => {
    const path = pathRef.current, trail = trailRef.current, el = box.current;
    if (!path || !el) return;
    const total = path.getTotalLength();
    if (!total) return;
    if (trail) trail.style.strokeDasharray = String(total);
    const place = (length: number) => {
      position.current = length;
      const p = path.getPointAtLength(length);
      const nearest = Math.min(...stopLengths.slice(1, -1).map((s) => Math.abs((s / 100) * total - length)));
      const lift = 9 * Math.max(0, 1 - nearest / 40); // steps up onto the station square
      el.style.transform = `translate(${p.x}px, ${p.y - lift}px) translate(-50%, -100%)`;
      if (trail) trail.style.strokeDashoffset = String(total - length);
    };
    const to = (target / 100) * total;
    if (position.current === null) { place(startAtZero ? 0 : to); if (!startAtZero) return; }
    const from = position.current!;
    if (Math.abs(to - from) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { place(to); setFrame(0); return; }
    if (flip.current) flip.current.style.transform = `scaleX(${to >= from ? 1 : -1})`;
    const duration = Math.min(1400, Math.max(350, Math.abs(to - from) * 2.2)), start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration), eased = t * t * (3 - 2 * t), length = from + (to - from) * eased;
      place(length);
      setFrame(t < 1 ? (Math.floor(length / 14) % (BELL_FRAMES - 1)) + 1 : 0);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, pathRef, trailRef, startAtZero, stopLengths]);

  return (
    <div ref={box} data-testid="bell" className="absolute top-0 left-0 z-10 w-9.5">
      <div className="relative">
        <button onClick={onClick} disabled={!alert} aria-label={alert ? 'Open the decision' : 'Covers guide'} className={`block w-full ${alert ? 'cursor-pointer' : 'cursor-default'}`}>
          <div ref={flip}><Bell frame={frame} className="block w-full" /></div>
        </button>
        {alert && <i className="pointer-events-none absolute -top-1.5 -right-3 size-4.5 bg-status-over text-center text-small leading-4.5 font-bold text-bg-surface not-italic">!</i>}
      </div>
    </div>
  );
}

export function DinnerMap({ planId }: { planId: string }) {
  const { runs, play } = useRuns();
  const run = runs[planId];
  const [core, setCore] = useState<{ view: PlanView; rounds: Evaluation[]; receipt: Receipt | null; settlement: Settlement | null } | null>(null);
  const [notes, setNotes] = useState<StepNote[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [role, setRole] = useState<Role>('rep');
  const [viewing, setViewing] = useState<number | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [doc, setDoc] = useState<DocRef | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRow, setAuditRow] = useState<string | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [stationNote, setStationNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const world = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const trailRef = useRef<SVGPathElement>(null);

  const load = useCallback(async () => {
    const [view, rounds, receipt, settlement] = await Promise.all([covers.getPlan(planId), covers.listEvaluations(planId), covers.getReceipt(planId), covers.getSettlement(planId)]);
    const next = { view, rounds, receipt, settlement };
    setCore(next);
    return next;
  }, [planId]);
  const loadAudit = useCallback(async () => { const a = await covers.listAudit({ planId }); setAudit(a); return a; }, [planId]);

  useEffect(() => { setRole(readRole()); void load(); void loadAudit(); void covers.listDocuments().then(setDocuments); }, [load, loadAudit]);
  useLayoutEffect(() => {
    const el = world.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [core === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const state: DinnerState | null = useMemo(() => (core ? { ...core, notes, audit } : null), [core, notes, audit]);
  const step = core ? stepOf(core.view, core.receipt, core.settlement, role) : 0;
  const shown = run?.step ?? viewing ?? step;
  const stations = useMemo(() => (state ? stationsFor(shown, state, shown === 1 && round !== null ? round : undefined) : []), [state, shown, round]);
  const geometry = useMemo(() => layoutPath(stations.length || 1, size.w, size.h), [stations.length, size.w, size.h]);

  if (!core || !state) return <main className="grid h-dvh place-items-center text-ink-muted">Loading…</main>;
  const { view, receipt, settlement, rounds } = core;
  const { plan, evaluation } = view;
  const flag = openFlag(evaluation, settlement);
  const blocker = !settlement ? evaluation?.checks.find((c) => c.outcome === 'block') : undefined;
  const denied = !settlement ? evaluation?.checks.find((c) => c.denial) : undefined;
  const blockedCap = blocker?.subject.kind === 'hcp' ? evaluation?.caps.find((c) => blocker.subject.kind === 'hcp' && c.npi === blocker.subject.npi && c.state === 'over') : undefined;
  const limit = cardLimitOf(plan);
  const speakerNpi = speakerOf(plan)?.hcp.npi ?? IDS.patel;
  const everyone = [speakerNpi, ...plan.inviteeNpis, 'rep'];
  const ate = everyone.filter((id) => !absent.has(id)).length;
  const label = (id: string) => (id === 'rep' ? nameOf(plan.repId) : nameOf(id));

  const pace = (s: DinnerState, target: number, count?: number): Stage => ({ step: target, names: stationsFor(target, s).slice(0, count).map((x) => x.name) });
  const act = async (fn: () => Promise<unknown>, stages?: (s: DinnerState) => Stage[]) => {
    setBusy(true); setError(null);
    try {
      await fn();
      const next = await load();
      void loadAudit();
      setViewing(null); setRound(null); setPicked(null); setDoc(null); setNote(''); setDecisionOpen(true);
      if (stages) await play(planId, stages({ ...next, notes, audit }));
    } catch (e) { setError(e instanceof CoversClientError ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  };
  const afterCheck = (s: DinnerState): Stage[] => [pace(s, 1, 5), ...(s.view.plan.status === 'cleared' ? [pace(s, 2, 3)] : [])];
  const check = () => act(() => covers.evaluatePlan(planId), afterCheck);
  const removeGuest = (npi: string) => act(async () => { await covers.updatePlan(planId, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== npi) }); await covers.evaluatePlan(planId); }, afterCheck);
  const issue = () => act(() => covers.issueFund(planId), (s) => [pace(s, 3, 1)]);
  const addReceipt = () => act(() => covers.submitReceipt(planId, { sampleId: IDS.cleanReceipt }), (s) => [pace(s, 4, 3)]);
  const confirm = () => act(() => covers.confirmAttendance({ planId, attendedNpis: everyone.filter((id) => id !== 'rep' && !absent.has(id)), employeesPresent: absent.has('rep') ? 0 : 1, extraGuests: 0, confirmedBy: plan.repId }), (s) => [pace(s, 5)]);
  const decide = (verdict: 'approve' | 'deny') => act(() => (verdict === 'approve' ? covers.approveException : covers.denyException)(planId, flag!.id, note.trim() || (verdict === 'approve' ? 'Approved' : 'Denied')), (s) => (s.view.plan.status === 'closed' ? [pace(s, 6)] : []));
  const switchRole = (r: Role) => { setRoleCookie(r); setRole(r); setViewing(null); setDecisionOpen(true); setError(null); };
  const reset = () => act(async () => { await covers.reset(); setAbsent(new Set()); setRound(null); });
  const addStationNote = async (s: Station) => {
    const text = stationNote.trim();
    if (!text) return;
    try { await covers.addNote(planId, { step: STEP_KEYS[shown]!, target: s.name, text }); setStationNote(''); setNotes(await covers.listNotes(planId)); void loadAudit(); }
    catch (e) { setError(e instanceof CoversClientError ? e.message : 'The note was not saved.'); }
  };
  const pickStation = (i: number) => { setPicked(i); setStationNote(''); void covers.listNotes(planId).then(setNotes); };
  const openDoc = (r: DocRef) => { setDoc(r); if (r.doc === 'audit') void loadAudit(); };
  const toggle = (id: string) => setAbsent((a) => { const n = new Set(a); if (!n.delete(id)) n.add(id); return n; });

  // What this dinner is waiting for, and from whom.
  const owner: Role = step === 6 || (step === 1 && !blocker && !denied && !!flag) || (step === 5 && !!flag) ? 'compliance' : 'rep';
  const hasDecision = !(step === 5 && !flag) && !(step === 6 && !flag);
  const closed = plan.status === 'closed';
  const canDecide = hasDecision && !closed && viewing === null && !run && !busy;
  const mine = canDecide && owner === role;
  const showDecision = canDecide && decisionOpen;

  const resting = picked ?? (shown === step ? restingStation(stations) : stations.length - 1);
  const target = geometry.stops[(run ? run.at : resting) + 1] ?? 0;
  const visible = (i: number) => !run || run.step !== shown || i < run.seen;
  const docModel = doc && buildCard(doc, state, documents);
  const caps = settlement?.caps.length ? settlement.caps : evaluation?.caps ?? [];
  const pickedStation = picked !== null ? stations[picked] : undefined;
  const stationNotes = pickedStation ? notes.filter((n) => n.step === STEP_KEYS[shown] && n.target === pickedStation.name) : [];

  function Decision() {
    const waitingOn = (who: Role, line: string) => (
      <><h2 className="text-verdict leading-tight font-bold tracking-tight">{line}</h2><p className="mt-2 text-ink-secondary">This is with {who === 'compliance' ? nameOf(IDS.compliance) : nameOf(plan.repId)}.</p><div className="mt-4"><button className={secondary} onClick={() => switchRole(who)}>Open as {who === 'compliance' ? 'compliance' : 'the rep'}</button></div></>
    );
    if (owner !== role) return waitingOn(owner, owner === 'compliance' ? 'Waiting on compliance' : 'Waiting on the rep');
    const Head = ({ tag, tone, children }: { tag: string; tone: keyof typeof TONE_TEXT; children: React.ReactNode }) => <><span className={`block font-mono text-micro ${TONE_TEXT[tone]}`}>{tag}</span><h2 className="mt-1 text-verdict leading-tight font-bold tracking-tight">{children}</h2></>;
    if (step === 0) return <><Head tag="READY" tone="">Run the checks on this dinner?</Head><p className="mt-2 text-ink-secondary">{plan.inviteeNpis.length} clinicians, {usd(plan.estimatedPerPerson)} per person, all in.</p><div className="mt-4"><button disabled={busy} className={primary} onClick={check}>Start checks</button></div></>;
    if (step === 1 && blockedCap) return <><Head tag="BLOCKED" tone="over">{nameOf(blockedCap.npi)} would pass the annual limit</Head><div className="mt-2 font-mono text-amount">{usd(blockedCap.ytdCents)} + {usd(blockedCap.projectedCents - blockedCap.ytdCents)} = <b className="text-status-over">{usd(blockedCap.projectedCents)}</b> of {usd(blockedCap.capCents)}</div><p className="mt-2 text-ink-secondary">The card stays locked until this is fixed.</p><div className="mt-4 flex gap-2"><button disabled={busy} className={primary} onClick={() => removeGuest(blockedCap.npi)}>Remove {nameOf(blockedCap.npi)}</button><button className={secondary} onClick={() => openDoc({ label: 'Annual totals', doc: 'ledger', at: blockedCap.npi })}>See why</button></div></>;
    if (step === 1 && (blocker || denied)) return <><Head tag="BLOCKED" tone="over">{(blocker ?? denied)!.message}</Head><p className="mt-2 text-ink-secondary">The card stays locked until the plan changes.</p></>;
    if ((step === 1 || step === 6) && flag) {
      const line = flag.subject.kind === 'line' ? receipt?.lines.find((l) => flag.subject.kind === 'line' && l.id === flag.subject.lineId) : undefined;
      return <><Head tag="FOR COMPLIANCE" tone="near">{line ? `${usd(line.amountCents)} of alcohol: approve it?` : flag.message}</Head>{line && <div className="mt-2 font-mono text-amount">{line.text}</div>}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the record" className="mt-3 w-full border border-border bg-bg-canvas px-2.5 py-2" /><div className="mt-3 flex gap-2"><button disabled={busy} className={primary} onClick={() => decide('approve')}>Approve</button><button disabled={busy} className={secondary} onClick={() => decide('deny')}>Deny</button></div></>;
    }
    if (step === 2) return <><Head tag="CLEARED" tone="ok">Issue the {usd(limit)} card?</Head><div className="mt-2 font-mono text-amount">{headcountOf(plan)} people × {usd(fixtures.company.perPersonCapCents)}</div><p className="mt-2 text-ink-secondary">Restricted to restaurants, for this dinner.</p><div className="mt-4"><button disabled={busy} className={primary} onClick={issue}>Issue the card</button></div></>;
    if (step === 3) return <><Head tag="AFTER THE DINNER" tone="">Add the receipt</Head><p className="mt-2 text-ink-secondary">The card is ready for {dayOf(plan)}. This demo uses a sample receipt.</p><div className="mt-4"><button disabled={busy} className={primary} onClick={addReceipt}>Add the receipt</button></div></>;
    if (step === 4 && receipt) return (
      <><Head tag="CLOSE OUT" tone="">Who ate?</Head>
        <div className="mt-3 grid grid-cols-2 gap-x-4">{everyone.map((id) => <button key={id} onClick={() => toggle(id)} className={`flex cursor-pointer justify-between gap-2 border-b border-border py-1.5 text-left ${absent.has(id) ? 'text-ink-muted line-through' : ''}`}><span className="truncate">{label(id)}</span><span>{absent.has(id) ? '' : '✓'}</span></button>)}</div>
        <div className="mt-3 flex items-center justify-between"><span className="font-mono text-amount">{ate} × {ate ? usd(Math.round(receipt.totalCents / ate)) : usd(0)}</span><button disabled={busy || ate === 0} className={primary} onClick={confirm}>Confirm</button></div></>
    );
    return null;
  }

  function Context() {
    if (pickedStation) return (
      <section className="mb-4 border border-ink-primary bg-bg-surface p-3">
        <div className="flex justify-between"><span className={`font-mono text-micro ${MARK_TEXT[pickedStation.mark]}`}>{(pickedStation.word ?? MARK_WORD[pickedStation.mark]).toUpperCase()}</span><button aria-label="Close" className="cursor-pointer text-heading leading-none" onClick={() => setPicked(null)}>×</button></div>
        <b className="block text-amount">{pickedStation.name}</b>
        {shown === 1 && rounds.length > 1 && <div className="mt-1.5 flex gap-1.5">{rounds.map((_, n) => <button key={n} onClick={() => setRound(n)} className={`cursor-pointer border px-1.5 py-0.5 text-small ${(round ?? rounds.length - 1) === n ? 'border-ink-primary bg-accent-tint' : 'border-border'}`}>Round {n + 1}</button>)}</div>}
        <p className="mt-1 text-ink-secondary">{pickedStation.found}</p>
        {pickedStation.looked.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{pickedStation.looked.map((r) => <button key={`${r.doc}:${r.at}`} onClick={() => openDoc(r)} className="cursor-pointer border border-border px-1.5 py-0.5 text-small hover:border-ink-primary">{r.label}</button>)}</div>}
        {stationNotes.map((n) => <div key={n.id} className="mt-2 border-t border-border pt-1.5 text-small"><span className="text-ink-muted">{nameOf(n.by)}: </span>{n.text}</div>)}
        <div className="mt-2 flex gap-1.5"><input value={stationNote} onChange={(e) => setStationNote(e.target.value)} placeholder="Add to the record" className="min-w-0 flex-1 border border-border bg-bg-canvas px-2 py-1.5" /><button className="cursor-pointer border border-ink-primary px-2.5 font-strong" onClick={() => addStationNote(pickedStation)}>Add</button></div>
      </section>
    );
    if (run && run.seen > 0 && run.step === shown) {
      const s = stations[run.seen - 1];
      return s ? <section className="mb-4 border border-ink-primary bg-bg-surface p-3"><span className="font-mono text-micro text-ink-muted">JUST CHECKED</span><b className="block text-amount">{s.name}</b><p className="mt-1 text-ink-secondary">{s.found}</p></section> : null;
    }
    if (run || !canDecide || owner !== role) return null;
    if (blockedCap) return <section className="mb-4 border border-status-over bg-bg-surface p-3"><span className="font-mono text-micro text-status-over">NEEDS YOU</span><b className="block text-amount">{nameOf(blockedCap.npi)}</b><div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-small"><span className="text-ink-muted">So far this year</span><span className="font-mono">{usd(blockedCap.ytdCents)}</span></div><div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-small"><span className="text-ink-muted">With this dinner</span><span className="font-mono">{usd(blockedCap.projectedCents)}</span></div></section>;
    if (step === 2) return <section className="mb-4 border border-ink-primary bg-bg-surface p-3"><span className="font-mono text-micro text-status-ok">NEXT</span><b className="block text-amount">Issue the card</b><div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-small"><span className="text-ink-muted">Limit</span><span className="font-mono">{usd(limit)}</span></div></section>;
    if (flag) return <section className="mb-4 border border-status-near bg-bg-surface p-3"><span className="font-mono text-micro text-status-near">NEEDS YOU</span><p className="mt-1">{flag.message}</p></section>;
    return null;
  }

  const prev = shown > 0 ? shown - 1 : null;
  const next = shown < step ? shown + 1 : null;
  const arrow = (dir: 'l' | 'r', to: number | null) => (
    <button disabled={to === null} onClick={() => { if (to !== null) { setViewing(to === step ? null : to); setPicked(null); setRound(null); } }} title={to !== null ? STEPS[to] : undefined} className={`group absolute top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 ${dir === 'l' ? 'left-3' : 'right-3'} ${to === null ? 'cursor-default text-border' : 'cursor-pointer text-ink-primary'}`}>
      <svg viewBox="0 0 20 44" className="h-14 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d={dir === 'l' ? 'M17 2 3 22l14 20' : 'M3 2l14 20L3 42'} /></svg>
      {to !== null && <span className="hidden text-small font-strong group-hover:block">{STEPS[to]}</span>}
      <span className="sr-only">{dir === 'l' ? 'Previous step' : 'Next step'}</span>
    </button>
  );

  return (
    <div className="flex h-dvh flex-col">
      <div className="px-5 pt-3"><AppBar role={role} onRole={switchRole} /></div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_370px] pt-2.5">
        <section className="relative flex min-w-0 flex-col">
          <ol className="flex px-[8%] pt-7 pb-1.5">
            {STEPS.map((name, i) => {
              const reachable = i <= step, now = i === shown;
              return (
                <li key={name} className="relative flex-1">
                  <i className={`absolute top-1.25 h-px ${i === 0 ? 'left-1/2' : 'left-0'} ${i === 6 ? 'right-1/2' : 'right-0'} ${i < step ? 'bg-ink-primary' : 'bg-border'}`} />
                  <button disabled={!reachable || !!run} aria-current={now ? 'step' : undefined} onClick={() => { setViewing(i === step ? null : i); setPicked(null); setRound(null); }} className={`relative flex w-full flex-col items-center gap-1.5 text-small ${reachable ? 'cursor-pointer text-ink-primary' : 'text-ink-muted'} ${now ? 'font-bold' : ''}`}>
                    <i className={`size-2.75 border ${now ? 'border-ink-primary bg-accent' : i < step ? 'border-ink-primary bg-ink-primary' : 'border-border bg-bg-canvas'}`} />{name}
                  </button>
                </li>
              );
            })}
          </ol>
          <div ref={world} className="relative min-h-0 flex-1">
            {size.w > 0 && (
              <>
                <svg className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
                  <path ref={pathRef} d={geometry.d} fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="3 5" />
                  <path key={`trail-${shown}`} ref={trailRef} d={geometry.d} fill="none" stroke="var(--color-ink-primary)" strokeWidth="2" />
                </svg>
                {stations.map((s, i) => {
                  const p = geometry.points[i]!, seen = visible(i), high = i % 2 === 1, mark = seen ? s.mark : 'waiting';
                  return (
                    <div key={s.name}>
                      <button onClick={() => pickStation(i)} style={{ left: p.x, top: p.y }} className="absolute z-5 flex w-37.5 -translate-x-1/2 -translate-y-2.25 cursor-pointer flex-col items-center">
                        <i className={`size-4.5 border ${MARK_BOX[mark]}`} />
                        <b className="mt-1.5 text-amount">{s.name}</b>
                        <small className={`text-small ${MARK_TEXT[mark]}`}>{seen ? s.word ?? MARK_WORD[s.mark] : 'Waiting'}</small>
                      </button>
                      <div style={{ left: p.x, top: p.y }} className={`absolute w-52.5 max-w-[17vw] border bg-bg-surface px-2.5 py-2 text-small transition-opacity duration-(--motion-duration-base) ease-standard ${high ? '-translate-x-1/2 -translate-y-[calc(100%+66px)]' : '-translate-x-1/2 translate-y-16.5'} ${CARD_EDGE[s.mark]} ${seen ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="block text-micro text-ink-muted">{s.kind}</span>
                        {s.card.map(([a, b, tone], n) => <div key={n} className={`flex justify-between gap-2 ${tone ? TONE_TEXT[tone] : ''}`}><span>{a}</span>{b && <span className="font-mono">{b}</span>}</div>)}
                      </div>
                    </div>
                  );
                })}
                <Walker key={`bell-${shown}-${size.w}-${size.h}`} pathRef={pathRef} trailRef={trailRef} target={target} startAtZero={!!run && run.step === shown} stopLengths={geometry.stops} alert={mine && !decisionOpen} onClick={() => setDecisionOpen(true)} />
              </>
            )}
            {arrow('l', prev)}{arrow('r', next)}
          </div>
          {run && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-secondary"><b>Checking {run.label.toLowerCase()}</b> · You can leave this page, and it stops when it needs you.</div>}
          {!run && canDecide && mine && !decisionOpen && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-secondary">A decision is waiting. Click the bell to reopen it.</div>}
          {closed && viewing === null && !run && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-strong text-status-ok">Closed. Nothing left to do on this dinner.</div>}
          {showDecision && (
            <div role="dialog" aria-label="Decision" className="absolute top-1/2 left-1/2 z-20 w-140 max-w-[92%] -translate-x-1/2 -translate-y-1/2 border border-ink-primary bg-bg-surface px-5.5 py-5">
              <button aria-label="Close decision" onClick={() => setDecisionOpen(false)} className="absolute top-2 right-3.5 cursor-pointer text-heading leading-none">×</button>
              {Decision()}
              {error && <div role="alert" className="mt-3 text-status-over">{error}</div>}
            </div>
          )}
          {docModel && <DocCard model={docModel} onDoc={openDoc} onBack={() => setDoc(null)} onClose={() => setDoc(null)} />}
        </section>

        <aside className="relative flex min-h-0 flex-col overflow-auto border-l border-border px-5 pt-2 pb-5">
          <div className="text-heading leading-tight font-bold tracking-tight">{plan.title.replace(/^Speaker dinner: /, '')}</div>
          <div className="mt-0.5 mb-3.5 text-ink-muted">{dayOf(plan)} · {plan.venue}</div>
          <div className="mb-4 grid grid-cols-2 border border-border bg-bg-surface">
            <div className="px-2.5 py-2"><small className="block text-small text-ink-muted">Card limit</small><b className="font-mono text-heading">{usd(limit)}</b></div>
            <div className="border-l border-border px-2.5 py-2"><small className="block text-small text-ink-muted">{settlement ? 'Actual each' : 'Estimate each'}</small><b className="font-mono text-heading">{usd(settlement?.perPersonCents ?? plan.estimatedPerPerson)}</b></div>
          </div>
          {Context()}
          <h3 className="border-b border-ink-primary pb-1.5 text-small font-bold">People and annual limit</h3>
          {caps.length === 0 && <div className="py-2.5 text-ink-muted">Shows once the checks have run.</div>}
          {caps.map((c) => (
            <div key={c.npi} className={`border-b border-border py-1.5 ${c.state === 'over' && !settlement ? 'bg-accent-tint' : ''}`}>
              <div className="flex justify-between gap-2"><span>{nameOf(c.npi)}</span><span className="font-mono text-small">{usd(c.projectedCents)}</span></div>
              <div className="relative mt-1.5 h-(--size-capbar-height) bg-border"><u className={`absolute inset-y-0 left-0 ${c.state === 'over' ? 'bg-status-over' : c.state === 'near' ? 'bg-status-near' : 'bg-ink-primary'}`} style={{ width: `${Math.min(100, (c.projectedCents / c.capCents) * 100)}%` }} /></div>
            </div>
          ))}
          <div className="mt-auto pt-4">
            <button onClick={reset} className="mb-2 cursor-pointer text-small text-ink-muted underline">Start this demo over</button>
            <button onClick={() => { setAuditOpen(true); void loadAudit(); }} className="flex w-full cursor-pointer justify-between border border-border bg-bg-surface px-3 py-2.5 font-strong"><span>Audit trail · {audit.length}</span><span>▸</span></button>
          </div>
          {auditOpen && (
            <div className="absolute inset-0 z-30 overflow-auto bg-bg-canvas px-5 pt-2.5 pb-5">
              <div className="flex items-baseline justify-between border-b border-ink-primary pb-2"><h2 className="text-heading font-bold tracking-tight">Audit trail<small className="block text-small font-regular tracking-normal text-ink-muted">{audit.length} actions on this dinner, oldest first</small></h2><button aria-label="Close audit trail" onClick={() => setAuditOpen(false)} className="cursor-pointer text-heading leading-none">×</button></div>
              {audit.map((e) => {
                const open = auditRow === e.id;
                return (
                  <div key={e.id}>
                    <button onClick={() => setAuditRow(open ? null : e.id)} aria-expanded={open} className={`block w-full cursor-pointer border-b border-border px-1.5 py-2.5 text-left ${open ? 'bg-accent-tint' : 'hover:bg-bg-surface'}`}>
                      <span className="flex justify-between text-small text-ink-muted"><b className="font-strong text-ink-primary">{nameOf(e.actorId)}</b><span className="font-mono text-micro">{new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span></span>
                      <span className="mt-0.5 block">{AUDIT_LABEL[e.action] ?? e.action}</span>
                      {e.detail && e.action !== 'plan.updated' && <span className="mt-0.5 block text-small text-ink-secondary">{e.detail.replace(/(\d+) cents/g, (_, c: string) => usd(Number(c)))}</span>}
                    </button>
                    {open && <div className="border-b border-border bg-bg-surface px-1.5 py-2 text-small">{([['Date', new Date(e.at).toLocaleString('en-US')], ['Input hash', e.inputHash], ['Rule', e.ruleId ?? 'None']] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-0.5"><span className="text-ink-muted">{k}</span><span className="font-mono text-micro">{v}</span></div>)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
