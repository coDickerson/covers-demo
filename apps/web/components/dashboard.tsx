'use client';
// Home: one row per dinner, read from the service. A dinner the bell is working on shows that live, on this page too.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CapStatus, PlanView, Receipt, Settlement } from '@covers/contract';
import { covers } from '../lib/client';
import { STEPS, usd, type Role } from '../lib/dinner';
import { cardLimitOf, dayOf, headcountOf, standing, venueOf, nameOf, type Tone } from '../lib/map';
import { AppBar, readRole, setRoleCookie } from './app-bar';
import { Bell } from './bell';
import { tokens } from '../lib/tokens';
import { useRuns, type Run } from './run-provider';

type Row = { view: PlanView; receipt: Receipt | null; settlement: Settlement | null; state: ReturnType<typeof standing> };
const GRID = 'grid grid-cols-[minmax(290px,1.6fr)_repeat(7,minmax(54px,70px))_56px_92px_66px_minmax(170px,1.2fr)] items-center';
const TONE: Record<Tone, string> = { '': 'text-ink-secondary', ok: 'text-status-ok', near: 'font-strong text-status-near', over: 'font-strong text-status-over' };

function Head({ title }: { title: string }) {
  return (
    <div className={`${GRID} mt-4.5 border-b border-ink-primary pb-2 text-small font-strong text-ink-muted`}>
      <span className={title === 'Dinner' ? '' : 'text-amount font-bold text-ink-primary'}>{title}</span>
      {STEPS.map((s, i) => <span key={s} className={`py-1 text-center ${i % 2 ? 'bg-border/40' : ''}`}>{s}</span>)}
      <span className="pr-2.5 text-right">People</span><span className="pr-2.5 text-right">Limit / spent</span><span className="pr-2.5 text-right">Flags</span>
      <span className="pl-6.5">Where it stands</span>
    </div>
  );
}

function DinnerRow({ row, role, run }: { row: Row; role: Role; run: Run | undefined }) {
  const walking = !!run && run.seen === run.at;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!walking) { setFrame(0); return; }
    const timer = setInterval(() => setFrame((f) => (f % 4) + 1), tokens['motion/duration/fast'] / 2);
    return () => clearInterval(timer);
  }, [walking]);
  const { view: { plan }, settlement, receipt, state } = row;
  const step = run?.step ?? state.step;
  const done = !run && state.who === null, need = !run && state.who === role;
  const flags = settlement ? settlement.exceptions.filter((c) => !c.approval && !c.denial).length : (row.view.evaluation?.checks.filter((c) => c.outcome === 'flag' && !c.approval && !c.denial).length ?? 0);
  const cell = 'flex items-center justify-end self-stretch border-b border-border pr-2.5 font-mono text-small whitespace-nowrap';
  return (
    <Link href={`/plans/${encodeURIComponent(plan.id)}`} className={`${GRID} h-18 hover:bg-bg-surface`}>
      <span className="flex min-w-0 flex-col justify-center self-stretch border-b border-border pl-1.5">
        <b className="block truncate text-amount font-strong">{plan.title.replace(/^Speaker dinner: /, '')}</b>
        <small className="block truncate text-small text-ink-muted">{dayOf(plan)} · {venueOf(plan)}{role === 'compliance' ? ` · ${nameOf(plan.repId)}` : ''}</small>
      </span>
      {STEPS.map((s, i) => {
        const here = i === step && !done, past = done || i < step;
        return (
          <span key={s} className={`relative flex h-full items-center justify-center ${i % 2 ? 'bg-border/40' : ''}`}>
            {i < 6 && <i className={`absolute top-1/2 left-1/2 h-px w-full ${past ? 'bg-ink-primary' : 'bg-border'}`} />}
            {here ? (
              <span className="relative flex flex-col items-center">
                <Bell frame={frame} className="w-6" />
                {need && <i className="absolute -top-1 -right-3 size-4 bg-status-over text-center text-micro leading-4 font-bold text-bg-surface not-italic">!</i>}
                <small className="text-micro font-strong">{s}</small>
              </span>
            ) : <i className={`relative size-2.5 ${past ? 'bg-ink-primary' : 'border border-border bg-bg-canvas'}`} />}
          </span>
        );
      })}
      <span className={cell}>{settlement?.headcount ?? headcountOf(plan)}</span>
      <span className={cell}>{usd(receipt?.totalCents ?? cardLimitOf(plan))}</span>
      <span className={`${cell} ${flags ? 'font-bold text-status-near' : 'text-ink-muted'}`}>{flags || 'None'}</span>
      <span className={`ml-6.5 flex min-w-0 items-center self-stretch border-b border-border ${run ? 'font-strong text-ink-primary' : TONE[state.tone]}`}>{run ? `Checking ${run.label.toLowerCase()}` : state.say}</span>
    </Link>
  );
}

export function Dashboard() {
  const { runs } = useRuns();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ledger, setLedger] = useState<CapStatus[]>([]);
  const [role, setRole] = useState<Role>('rep');
  const running = Object.keys(runs).length;

  useEffect(() => {
    setRole(readRole());
    void (async () => {
      const [plans, caps] = await Promise.all([covers.listPlans(), covers.getLedger()]);
      setLedger(caps);
      setRows(await Promise.all(plans.map(async (p) => {
        const [view, receipt, settlement] = await Promise.all([covers.getPlan(p.id), covers.getReceipt(p.id), covers.getSettlement(p.id)]);
        return { view, receipt, settlement, state: standing(view, receipt, settlement) };
      })));
    })();
  }, [running]);
  const switchRole = (r: Role) => { setRoleCookie(r); setRole(r); };

  const { need, progress, done } = useMemo(() => {
    const all = rows ?? [];
    return {
      need: all.filter((r) => !runs[r.view.plan.id] && r.state.who === role),
      progress: all.filter((r) => runs[r.view.plan.id] || (r.state.who && r.state.who !== role)),
      done: all.filter((r) => !runs[r.view.plan.id] && !r.state.who),
    };
  }, [rows, runs, role]);
  const sums: [string, string, string][] = [
    [String(ledger.filter((c) => c.state !== 'ok').length), 'doctors near limit', 'text-status-near'],
    [String((rows ?? []).filter((r) => r.state.who === 'compliance').length), 'with compliance', ''],
    [usd((rows ?? []).reduce((n, r) => n + (r.view.plan.status !== 'closed' ? r.receipt?.totalCents ?? 0 : 0), 0)), 'spent on open dinners', ''],
    [String((rows ?? []).reduce((n, r) => n + (r.settlement?.openPayments.filter((o) => o.reportable).length ?? 0), 0)), 'report rows drafted', ''],
  ];
  const sections = ([['Needs you', need], ['In progress', progress], ['Done', done]] as const).filter(([, l]) => l.length);

  return (
    <main className="px-5 pt-3 pb-4">
      <AppBar role={role} onRole={switchRole} />
      <div className="mt-4.5 flex items-baseline gap-9 text-heading text-ink-secondary">
        {([[need.length, 'need you', 'text-status-over'], [progress.length, 'in progress', ''], [done.length, 'done', '']] as const).map(([n, l, c]) => <span key={l}><b className={`mr-2 font-mono text-title ${c || 'text-ink-primary'}`}>{n}</b>{l}</span>)}
        <span className="ml-auto flex gap-7.5">{sums.map(([n, l, c]) => <span key={l} className="text-right text-small text-ink-muted"><b className={`block font-mono text-heading ${c || 'text-ink-primary'}`}>{n}</b>{l}</span>)}</span>
      </div>
      {!rows && <p className="mt-10 text-ink-muted">Loading…</p>}
      {sections.map(([title, list], i) => (
        <section key={title}>
          {i === 0 ? <><Head title="Dinner" /><div className={`mt-2.5 text-small font-bold ${title === 'Needs you' ? 'text-status-over' : ''}`}>{title}</div></> : <Head title={title} />}
          {list.map((r) => <DinnerRow key={r.view.plan.id} row={r} role={role} run={runs[r.view.plan.id]} />)}
        </section>
      ))}
    </main>
  );
}
