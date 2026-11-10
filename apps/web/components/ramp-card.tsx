// The dinner's company card, shown as the Ramp card it is. In live mode it opens that card's page in Ramp's sandbox;
// a simulated card says so and goes nowhere.
import type { AuditEvent, PlanView, Settlement } from '@covers/contract';
import { usd } from '../lib/dinner';
import { isSimulatedFund, rampFundUrl } from '../lib/map';

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
  const url = plan.fundId ? rampFundUrl(plan.fundId) : null;
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

  return url
    ? <a href={url} target="_blank" rel="noreferrer" aria-label="Open this card in Ramp" title="Open this card in Ramp" className={`${shape} cursor-pointer outline-offset-2 hover:outline-2 hover:outline-ink-primary`}>{face}</a>
    : <div aria-label={simulated ? 'Simulated company card' : 'Company card, not issued yet'} className={shape}>{face}</div>;
}
