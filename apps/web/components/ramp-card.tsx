// The dinner's company card, drawn as a card: locked until every check passes, live once Ramp issues it, then the
// charge lands on it, and it locks again when the dinner closes out. Colors, type and motion come from tokens.
import type { AuditEvent, PlanView, Settlement } from '@covers/contract';
import { usd } from '../lib/dinner';
import { isSimulatedFund } from '../lib/map';

type CardState = 'locked' | 'ready' | 'live' | 'charged' | 'closed';

const CHIP: Record<CardState, [string, string]> = {
  locked: ['LOCKED', 'bg-status-over text-bg-surface'],
  ready: ['READY', 'bg-bg-surface text-ink-primary'],
  live: ['LIVE', 'bg-accent text-on-accent'],
  charged: ['CHARGED', 'bg-accent text-on-accent'],
  closed: ['LOCKED · CLOSED OUT', 'bg-bg-surface text-ink-primary'],
};

/** The card's last four from the audit log ("Ramp fund …3739 created"); null for a simulated card or before issue. */
function lastFour(audit: AuditEvent[]): string | null {
  const issued = [...audit].reverse().find((e) => e.action === 'fund.issued');
  return issued?.detail.match(/…(\d{4})/)?.[1] ?? null;
}

export function RampCard({ view, settlement, audit, limitCents }: { view: PlanView; settlement: Settlement | null; audit: AuditEvent[]; limitCents: number }) {
  const { plan, closeOut } = view;
  const issued = !!plan.fundId;
  const simulated = issued && isSimulatedFund(plan.fundId!);
  const charge = settlement?.charge?.amountCents ?? closeOut?.chargedCents;
  const where = closeOut?.merchantName ?? settlement?.charge?.merchantName;
  const state: CardState = settlement ? 'closed' : charge !== undefined ? 'charged' : issued ? 'live' : plan.status === 'cleared' ? 'ready' : 'locked';
  const four = lastFour(audit);
  const why = state === 'locked' ? (plan.status === 'blocked' ? 'Opens when every check passes' : 'Opens once the checks clear') : state === 'ready' ? 'Every check passed. Issue it to open it' : state === 'closed' ? 'Nothing more can be spent' : 'Restaurants only';
  const [chip, chipTone] = CHIP[state];

  return (
    <div aria-label={`Company card: ${chip.toLowerCase()}`} className={`covers-card flex w-72 flex-col justify-between gap-3 bg-accent-strong p-4 text-bg-surface transition-[opacity,filter] duration-(--motion-duration-slow) ease-standard ${state === 'locked' ? 'opacity-85' : ''}`} key={state}>
      <div className="flex items-center justify-between text-micro font-strong tracking-widest">
        <span>{simulated ? 'SIMULATED CARD' : 'RAMP · VIRTUAL'}</span>
        <span className={`covers-chip px-1.5 py-0.5 ${chipTone}`}>{chip}</span>
      </div>
      <div className="font-mono text-heading tracking-widest">•••• {issued && !simulated && four ? four : '····'}</div>
      <div className="flex items-end justify-between gap-3 text-small">
        <div><div className="text-micro opacity-70">LIMIT</div><div className="font-mono">{usd(limitCents)}</div></div>
        <div className="max-w-36 text-right text-micro opacity-80">{why}</div>
      </div>
      {charge !== undefined && (
        <div className="covers-charge -mx-4 -mb-4 flex justify-between gap-2 bg-bg-surface px-4 py-2 text-small text-ink-primary">
          <span className="truncate">{where ?? 'Card charge'}</span>
          <b className="font-mono">−{usd(charge)}</b>
        </div>
      )}
    </div>
  );
}
