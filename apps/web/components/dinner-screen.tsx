'use client';
// The one screen: the dinner's name, seven steps and six checkers never move. Only the center changes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CheckResult, PlanView, Receipt, Settlement } from '@covers/contract';
import { fixtures, IDS } from '@covers/contract/fixtures';
import { covers, CoversClientError } from '../lib/client';
import { afterMark, beforeMark, CHECKERS, MARK_WORD, openFlag, STEPS, stepOf, usd, type Mark, type Role } from '../lib/dinner';
import { DinnerPanel, type DinnerData, type DocRef, type PanelView } from './dinner-panel';

const primary = 'cursor-pointer border border-ink-primary bg-accent px-5 py-3 text-amount font-strong text-on-accent disabled:cursor-default disabled:opacity-60';
const secondary = 'cursor-pointer border border-ink-primary px-5 py-3 text-amount font-strong hover:bg-ink-primary hover:text-bg-canvas';
const MARK_TONE: Record<Mark, string> = { clear: 'font-strong text-status-ok', blocked: 'font-bold text-status-over', flagged: 'font-bold text-status-near', waiting: 'text-ink-muted', none: 'text-border' };

const roleCookie = (role: Role) => { document.cookie = `covers_role=${role}; path=/; samesite=lax; max-age=86400`; };
const readRole = (): Role => (document.cookie.includes('covers_role=compliance') ? 'compliance' : 'rep');

const NAMES = new Map<string, string>([
  ...fixtures.hcps.map((h) => [h.npi, h.name] as const),
  ...fixtures.speakers.map((s) => [s.hcp.npi, s.hcp.name] as const),
  ...fixtures.users.map((u) => [u.id, u.name] as const),
  ...fixtures.reps.map((r) => [r.id, r.name] as const),
]);
const nameOf = (id: string) => NAMES.get(id) ?? (/^\d{10}$/.test(id) ? `NPI ${id}` : id);

function Say({ children, size = 'text-display' }: { children: React.ReactNode; size?: string }) {
  return <div className={`max-w-4xl font-bold leading-tight tracking-tight ${size}`}>{children}</div>;
}
const Sub = ({ children }: { children: React.ReactNode }) => <div className="mt-3 max-w-2xl text-heading font-regular text-ink-secondary">{children}</div>;
const Acts = ({ children }: { children: React.ReactNode }) => <div className="mt-7 flex justify-center gap-2.5">{children}</div>;

export function DinnerScreen({ planId }: { planId: string }) {
  const [view, setView] = useState<PlanView | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [role, setRole] = useState<Role>('rep');
  const [panel, setPanel] = useState<PanelView | null>(null);
  const [doc, setDoc] = useState<DocRef | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [v, r, s] = await Promise.all([covers.getPlan(planId), covers.getReceipt(planId), covers.getSettlement(planId)]);
    setView(v); setReceipt(r); setSettlement(s);
  }, [planId]);

  useEffect(() => { setRole(readRole()); void load(); }, [load]);

  const closePanel = () => { setPanel(null); setDoc(null); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); closePanel(); setPast(null); }
    catch (e) { setError(e instanceof CoversClientError ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  };

  const data: DinnerData | null = useMemo(() => (view ? { view, receipt, settlement, nameOf } : null), [view, receipt, settlement]);
  if (!view || !data) return <main className="grid h-dvh place-items-center text-ink-muted">Loading…</main>;

  const { plan, evaluation } = view;
  const speakerNpi = fixtures.speakers.find((s) => s.id === plan.speakerId)?.hcp.npi ?? IDS.patel;
  const rep = 'rep';
  const everyone = [speakerNpi, ...plan.inviteeNpis, rep];
  const label = (id: string) => (id === rep ? nameOf(plan.repId) : nameOf(id));
  const ateCount = everyone.filter((id) => !absent.has(id)).length;

  const step = stepOf(view, receipt, settlement, role);
  const shown = past ?? step;
  const blocker = evaluation?.checks.find((c) => c.outcome === 'block');
  const flag: CheckResult | undefined = openFlag(evaluation, settlement);
  const blockedNpi = blocker?.subject.kind === 'hcp' ? blocker.subject.npi : null;
  const blockedCap = blockedNpi ? evaluation?.caps.find((c) => c.npi === blockedNpi) : undefined;
  const cardLimit = fixtures.company.perPersonCapCents * (plan.inviteeNpis.length + 1 + plan.employeeCount);
  const headcount = plan.inviteeNpis.length + 1 + plan.employeeCount;
  const dinnerDate = new Date(plan.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const reportable = settlement?.openPayments.filter((r) => r.reportable).length ?? 0;
  const noShows = settlement ? plan.inviteeNpis.filter((n) => !settlement.byPerson.some((p) => p.npi === n)) : [];

  const check = () => run(async () => { const ev = await covers.evaluatePlan(planId); setView({ plan: { ...plan, status: ev.status }, evaluation: ev }); });
  const removeGuest = (npi: string) => run(async () => {
    const p = await covers.updatePlan(planId, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== npi) });
    const ev = await covers.evaluatePlan(planId);
    setView({ plan: { ...p, status: ev.status }, evaluation: ev });
  });
  const issue = () => run(async () => { const f = await covers.issueFund(planId); setView({ plan: { ...plan, fundId: f.fundId }, evaluation }); });
  const nextMorning = () => run(async () => { setReceipt(await covers.submitReceipt(planId, { sampleId: IDS.cleanReceipt })); });
  const confirm = () => run(async () => {
    const st = await covers.confirmAttendance({
      planId, attendedNpis: everyone.filter((id) => id !== rep && !absent.has(id)),
      employeesPresent: absent.has(rep) ? 0 : 1, extraGuests: 0, confirmedBy: plan.repId,
    });
    setSettlement(st);
    setView({ plan: { ...plan, status: st.exceptions.length ? 'reconciling' : 'closed' }, evaluation });
  });
  const approve = () => run(async () => { await covers.approveException(planId, flag!.id, note.trim() || 'Approved'); setNote(''); await load(); });
  const switchRole = (r: Role) => { roleCookie(r); setRole(r); setPast(null); setError(null); };
  const reset = () => run(async () => { await covers.reset(); switchRole('rep'); setAbsent(new Set()); await load(); });
  const toggle = (id: string) => setAbsent((a) => { const n = new Set(a); if (!n.delete(id)) n.add(id); return n; });
  const openPanel = (p: PanelView) => { setDoc(null); setPanel(p); };

  function Past() {
    const lines: [string, string][] = [
      [`${plan.inviteeNpis.length} clinicians invited`, `Estimate ${usd(plan.estimatedPerPerson)} per person, all in`],
      ['Every check passed', `Run under policy v1`],
      [`${usd(cardLimit)} card issued`, `${headcount} people × ${usd(fixtures.company.perPersonCapCents)}, restaurants only`],
      [`Dinner on ${dinnerDate}`, plan.venue],
      [receipt ? `Receipt: ${usd(receipt.totalCents)}` : 'Receipt', settlement ? `${settlement.headcount} people ate` : ''],
      [settlement ? `Settled at ${usd(settlement.perPersonCents)} per person` : 'Settled', `${reportable} Open Payments rows drafted`],
      ['Report', ''],
    ];
    const [say, sub] = lines[shown]!;
    return <><Say>{say}</Say><Sub>{sub}</Sub><Acts><button className={secondary} onClick={() => setPast(null)}>Back to current step</button></Acts></>;
  }

  function Center() {
    if (past !== null) return Past();
    if (step === 0) return (
      <>
        <Say>Is this dinner ready to check?</Say>
        <div className="mt-6 grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-left text-amount">
          <span className="text-ink-muted">Speaker</span><span>{nameOf(speakerNpi)}</span>
          <span className="text-ink-muted">Invited</span><span>{plan.inviteeNpis.length} clinicians</span>
          <span className="text-ink-muted">Estimate</span><span className="font-mono">{usd(plan.estimatedPerPerson)} per person, all in</span>
        </div>
        <Acts><button disabled={busy} className={primary} onClick={check}>Check this plan</button></Acts>
      </>
    );
    if (step === 1 && blocker && blockedCap) return (
      <>
        <Say>{nameOf(blockedCap.npi)} would pass the annual limit</Say>
        <div className="mt-4 font-mono text-heading">{usd(blockedCap.ytdCents)} + {usd(blockedCap.projectedCents - blockedCap.ytdCents)} = <span className="text-status-over">{usd(blockedCap.projectedCents)}</span> of {usd(blockedCap.capCents)}</div>
        <Sub>The card stays locked until this is fixed.</Sub>
        <Acts><button disabled={busy} className={primary} onClick={() => removeGuest(blockedCap.npi)}>Remove {nameOf(blockedCap.npi)}</button><button className={secondary} onClick={() => openPanel({ kind: 'checker', id: 'P4' })}>See why</button></Acts>
      </>
    );
    if (step === 1 && blocker) return <><Say>{blocker.message}</Say><Sub>The card stays locked until this is fixed.</Sub></>;
    if (step === 1 && flag) return role === 'compliance' ? Decide() : <><Say>Waiting on compliance</Say><Sub>{flag.message}</Sub><Acts><button className={secondary} onClick={() => switchRole('compliance')}>Open as compliance</button></Acts></>;
    if (step === 2) return (
      <>
        <Say>Every check passed</Say>
        <div className="mt-4 font-mono text-display tracking-tight">{usd(cardLimit)}</div>
        <Sub>Restaurant-only limit: {headcount} people × {usd(fixtures.company.perPersonCapCents)}</Sub>
        <Acts><button disabled={busy} className={primary} onClick={issue}>Issue the card</button></Acts>
      </>
    );
    if (step === 3) return (
      <>
        <Say>The card is ready for {dinnerDate}</Say>
        <Sub>Nothing to do until after the dinner. It works at restaurants only, up to {usd(cardLimit)}.</Sub>
        <Acts><button disabled={busy} className={primary} onClick={nextMorning}>Next morning: add the receipt</button></Acts>
      </>
    );
    if (step === 4 && receipt) return (
      <>
        <Say size="text-title">Does the receipt match, and who ate?</Say>
        <div className="mt-5 grid grid-cols-1 gap-16 text-left text-small md:grid-cols-2">
          <div className="w-85">
            <div className="border-b border-ink-primary pb-1.5 font-strong text-ink-muted">Receipt</div>
            {receipt.lines.map((l) => <div key={l.id} className="flex justify-between gap-3 border-b border-border py-1.5"><span>{l.text}{l.category === 'alcohol' && <span className="ml-1.5 text-micro font-strong text-status-near">Alcohol</span>}</span><span className="font-mono">{usd(l.amountCents)}</span></div>)}
            <div className="flex justify-between py-1.5 font-bold"><span>Total</span><span className="font-mono">{usd(receipt.totalCents)}</span></div>
          </div>
          <div className="w-85">
            <div className="border-b border-ink-primary pb-1.5 font-strong text-ink-muted">Who ate · tap to change</div>
            {everyone.map((id) => (
              <button key={id} onClick={() => toggle(id)} className={`flex w-full cursor-pointer justify-between gap-3 border-b border-border py-1.5 ${absent.has(id) ? 'text-ink-muted line-through' : ''}`}><span>{label(id)}</span><span className="font-mono">{absent.has(id) ? '' : '✓'}</span></button>
            ))}
            <div className="flex justify-between py-1.5 font-bold"><span>{ateCount} people</span><span className="font-mono">{ateCount ? usd(Math.round(receipt.totalCents / ateCount)) : usd(0)} each</span></div>
          </div>
        </div>
        <Acts><button disabled={busy || ateCount === 0} className={primary} onClick={confirm}>Confirm</button></Acts>
      </>
    );
    if (step === 5 && settlement && receipt) return (
      <>
        <Say>Settled at {usd(settlement.perPersonCents)} per person</Say>
        <div className="mt-6 flex">
          {[['Card limit', usd(cardLimit)], ['Receipt', usd(receipt.totalCents)], [`Split across ${settlement.headcount}`, usd(settlement.byPerson.reduce((n, p) => n + p.amountCents, 0))]].map(([l, v], i) => (
            <div key={l} className={`px-10 ${i < 2 ? 'border-r border-border' : ''}`}><div className="text-small text-ink-muted">{l}</div><div className="font-mono text-verdict tracking-tight">{v}</div></div>
          ))}
        </div>
        <Sub>{noShows.length > 0 && `${noShows.map(nameOf).join(', ')} didn't come, so nothing is reported. `}{flag ? 'One item needs a compliance decision.' : 'Nothing needs review.'}</Sub>
        <Acts>{flag && <button className={primary} onClick={() => switchRole('compliance')}>Open as compliance</button>}</Acts>
      </>
    );
    if (step === 6 && flag) return Decide();
    if (step === 6) return (
      <>
        <Say>Ready to file</Say>
        <Sub>{reportable} Open Payments rows{settlement ? ` at ${usd(settlement.perPersonCents)}` : ''}. Nothing left to do.</Sub>
        <Acts><button className={primary} onClick={() => { setPanel({ kind: 'documents' }); setDoc({ key: 'audit' }); }}>See the audit trail</button></Acts>
      </>
    );
    return null;
  }

  function Decide() {
    const line = flag?.subject.kind === 'line' ? receipt?.lines.find((l) => flag.subject.kind === 'line' && l.id === flag.subject.lineId) : undefined;
    return (
      <>
        <Say>{line ? `${usd(line.amountCents)} of alcohol: approve it?` : 'Approve this exception?'}</Say>
        <div className="mt-4 font-mono text-amount">{line ? `${line.text} · ${usd(Math.round(line.amountCents / (settlement?.headcount ?? 1)))} per person` : flag?.message}</div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the record" className="mt-6 w-105 border border-ink-primary bg-bg-surface px-3 py-2.5" />
        <Acts><button disabled={busy} className={primary} onClick={approve}>Approve</button><button className={secondary} onClick={() => openPanel({ kind: 'checker', id: flag!.packId as 'P5' })}>See evidence</button></Acts>
      </>
    );
  }

  return (
    <>
      <div className={`grid h-dvh grid-rows-[auto_auto_1fr_auto] transition-[margin] duration-(--motion-duration-base) ease-standard ${panel ? 'md:mr-115' : ''}`}>
        <header className="flex items-baseline gap-3.5 px-10 pt-5">
          <b className="text-amount">Covers</b><span className="text-border">/</span>
          <span className="truncate text-ink-secondary">{plan.title} · {dinnerDate} · {plan.venue}</span>
          <button className="shrink-0 cursor-pointer text-ink-secondary underline decoration-border underline-offset-3" onClick={() => openPanel({ kind: 'people' })}>{settlement ? `${settlement.headcount} ate` : `${headcount} people`}</button>
          <span className="flex-1" />
          <button className="shrink-0 cursor-pointer text-small text-ink-secondary underline decoration-border underline-offset-3" onClick={() => openPanel({ kind: 'documents' })}>Documents</button>
          <button className="shrink-0 cursor-pointer text-small text-ink-secondary" onClick={() => switchRole(role === 'rep' ? 'compliance' : 'rep')}>{role === 'rep' ? `${nameOf(plan.repId)} · Rep` : `${nameOf(IDS.compliance)} · Compliance`}</button>
          <button className="shrink-0 cursor-pointer text-small text-ink-muted" onClick={reset}>Start over</button>
        </header>

        <div className="relative mx-10 mt-7 grid grid-cols-7">
          <div className="absolute top-2 right-[calc(100%/14)] left-[calc(100%/14)] h-px bg-border" />
          <div className="absolute top-2 left-[calc(100%/14)] h-px bg-ink-primary transition-[width] duration-(--motion-duration-base) ease-standard" style={{ width: `calc((100% - 100% / 7) * ${step / 6})` }} />
          {STEPS.map((name, i) => {
            const reachable = i <= step;
            const now = i === shown;
            const stopped = i === 1 && step === 1 && !!blocker;
            return (
              <button key={name} disabled={!reachable} onClick={() => setPast(i === step ? null : i)} aria-current={now ? 'step' : undefined} className={`relative flex flex-col items-center gap-2 ${reachable ? 'cursor-pointer text-ink-primary' : 'text-ink-muted'} ${now ? 'font-bold' : ''}`}>
                <i className={`size-4.25 border ${stopped ? 'border-status-over bg-status-over' : now ? 'border-ink-primary bg-accent' : i < step ? 'border-ink-primary bg-ink-primary' : 'border-border bg-bg-canvas'}`} />
                <span>{name}</span>
                <small className="-mt-1.5 min-h-4 font-mono text-micro font-regular text-ink-muted">{i === 3 ? dinnerDate : ''}</small>
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-col items-center justify-center overflow-auto px-10 py-3 text-center">
          {Center()}
          {error && <div role="alert" className="mt-4 text-status-over">{error}</div>}
        </div>

        <div className="grid grid-cols-2 border-t border-ink-primary md:grid-cols-6">
          {CHECKERS.map((c) => {
            const before = beforeMark(c.id, evaluation), after = afterMark(c.id, settlement, receipt);
            const hot = settlement ? after : before;
            const bar = before === 'blocked' && !settlement ? 'shadow-[inset_0_3px_0_var(--color-status-over)]' : hot === 'flagged' ? 'shadow-[inset_0_3px_0_var(--color-status-near)]' : '';
            const open = panel?.kind === 'checker' && panel.id === c.id;
            return (
              <button key={c.id} onClick={() => (open ? closePanel() : openPanel({ kind: 'checker', id: c.id }))} className={`cursor-pointer border-r border-border px-4 pt-4 pb-5 text-left last:border-r-0 hover:bg-bg-surface ${open ? 'bg-bg-surface' : ''} ${bar}`}>
                <b className="block text-amount tracking-tight">{c.name}</b>
                <span className="mt-0.5 block min-h-8.5 text-small leading-tight text-ink-muted">{c.question}</span>
                <span className="mt-1.5 flex justify-between text-small"><span className="text-ink-muted">Before</span><span className={MARK_TONE[before]}>{MARK_WORD[before]}</span></span>
                <span className="mt-1.5 flex justify-between text-small"><span className="text-ink-muted">After</span><span className={MARK_TONE[after]}>{MARK_WORD[after]}</span></span>
              </button>
            );
          })}
        </div>
      </div>
      <DinnerPanel panel={panel} doc={doc} data={data} onPanel={openPanel} onDoc={setDoc} onRemove={removeGuest} onClose={closePanel} />
    </>
  );
}
