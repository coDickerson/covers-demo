// The dinner's company card, shown as the Ramp card it is. In live mode it opens that card's page in Ramp's sandbox;
// a simulated card says so and goes nowhere.
import type { AuditEvent, PlanView, Receipt, Settlement } from '@covers/contract';
import { usd, type Role } from '../lib/dinner';
import { isSimulatedFund, nameOf, rampCardHref, rampFundUrl, standing, type Tone } from '../lib/map';

/** The steps whose box shows the card: Fund, Dinner, Close out and Settle. */
export const CARD_STEPS = [2, 3, 4, 5];
const TONE: Record<Tone, string> = { '': '', ok: 'text-status-ok', near: 'font-strong text-status-near', over: 'font-strong text-status-over' };

export type CardState = 'locked' | 'ready' | 'live' | 'charged' | 'closed';

/** Where the card stands, and a few words for it. */
export function cardState(view: PlanView, settlement: Settlement | null): { state: CardState; say: string } {
  const { plan, closeOut } = view;
  const charge = settlement?.charge?.amountCents ?? closeOut?.chargedCents;
  const where = closeOut?.merchantName ?? settlement?.charge?.merchantName;
  if (settlement) return { state: 'closed', say: 'Locked after close-out' };
  if (charge !== undefined) return { state: 'charged', say: `Charged ${usd(charge)}${where ? ` at ${where}` : ''}` };
  if (plan.fundId) return { state: 'live', say: 'Live, restaurants only' };
  if (plan.status === 'cleared') return { state: 'ready', say: 'Ready to issue' };
  return { state: 'locked', say: 'Locked until every check passes' };
}

/** The card's last four from the audit log ("Ramp fund …3739 created"); null for a simulated card or before issue. */
function lastFour(audit: AuditEvent[]): string | null {
  const issued = [...audit].reverse().find((e) => e.action === 'fund.issued');
  return issued?.detail.match(/…(\d{4})/)?.[1] ?? null;
}

// The status chip on the card's face, as Nikhil had it.
const CHIP: Record<CardState, [string, string]> = {
  locked: ['LOCKED', 'bg-status-over text-bg-surface'],
  ready: ['READY', 'bg-bg-surface text-ink-primary'],
  live: ['LIVE', 'bg-accent text-on-accent'],
  charged: ['CHARGED', 'bg-accent text-on-accent'],
  closed: ['LOCKED · CLOSED OUT', 'bg-bg-surface text-ink-primary'],
};

export function RampCard({ view, settlement, audit, limitCents }: { view: PlanView; settlement: Settlement | null; audit: AuditEvent[]; limitCents: number }) {
  const { plan } = view;
  const [chip, chipTone] = CHIP[cardState(view, settlement).state];
  const simulated = !!plan.fundId && isSimulatedFund(plan.fundId);
  const real = plan.fundId ? rampFundUrl(plan.fundId) : null;
  const url = rampCardHref(plan.fundId);
  const title = real ? 'Open this card in Ramp' : 'Open our Ramp sandbox, where this demo’s real cards were issued (team login needed)';
  const four = !simulated ? lastFour(audit) : null;

  const face = (
    <>
      {/* Ramp's corporate card art (public/ramp-card.png), so it reads as the real card. */}
      <img src="/ramp-card.png" alt="" width={500} height={315} draggable={false} className="absolute inset-0 size-full" />
      <span className="absolute top-[9%] right-[5%] flex flex-col items-end gap-1">
        <span className={`px-1.5 py-0.5 text-micro font-strong tracking-widest ${chipTone}`}>{chip}</span>
        {simulated && <span className="text-micro tracking-widest text-bg-surface opacity-80">SIMULATED</span>}
      </span>
      <span className="absolute bottom-[8%] left-[6%] text-bg-surface">
        <span className="block text-micro tracking-widest opacity-70">LIMIT</span>
        <span className="block font-mono text-small">{usd(limitCents)}{four ? <span className="ml-2 tracking-widest opacity-80">•••• {four}</span> : null}</span>
      </span>
    </>
  );
  const shape = 'relative block aspect-[500/315] w-60';

  return <a href={url} target="_blank" rel="noreferrer" aria-label={title} title={title} className={`${shape} cursor-pointer outline-offset-2 hover:outline-2 hover:outline-ink-primary`}>{face}</a>;
}

/** The card inside a step's box (Fund, Dinner, Close out, Settle), with two or three lines on what is happening now. */
export function CardSlip({ view, receipt, settlement, audit, limitCents, role, checking }: {
  view: PlanView; receipt: Receipt | null; settlement: Settlement | null; audit: AuditEvent[]; limitCents: number; role: Role;
  /** What the bell is checking right now, if it is working. */ checking?: string;
}) {
  const now = standing(view, receipt, settlement);
  const card = cardState(view, settlement);
  const waiting = checking ? 'The agent' : !now.who ? 'No one' : now.who === role ? 'You' : now.who === 'rep' ? nameOf(view.plan.repId) : 'Compliance';
  const lines: [string, string, string][] = [
    ['Now', checking ? `Checking ${checking.toLowerCase()}` : now.say, checking ? 'font-strong' : TONE[now.tone]],
    ['Waiting on', waiting, waiting === 'You' ? 'font-strong' : ''],
    ...(card.state === 'charged' || card.state === 'closed' ? [['Card', card.say, ''] as [string, string, string]] : []),
  ];
  return (
    <div className="covers-line border-t border-border px-4 py-3">
      <RampCard view={view} settlement={settlement} audit={audit} limitCents={limitCents} />
      <dl className="mt-2.5 text-small">
        {lines.map(([k, v, tone]) => <div key={k} className="flex justify-between gap-3 py-0.5"><dt className="shrink-0 text-ink-muted">{k}</dt><dd className={`text-right ${tone}`}>{v}</dd></div>)}
      </dl>
    </div>
  );
}
