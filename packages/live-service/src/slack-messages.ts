// What Covers posts to Slack. Each ping has a plain `text` (what phone notifications and screen readers show) and Block
// Kit `blocks` (what the channel shows). Anything that came from a user is escaped. Buttons appear only when the link exists.
import type { CheckResult, ProgramPlan, Settlement } from '@covers/contract';

export type SlackMessage = { text: string; blocks?: unknown[] };
export type Links = { appUrl?: string | undefined };

/** Slack's three control characters, for mrkdwn text. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "Thu Nov 12, 7:00 PM · Alder & Vine, San Francisco", in the dinner's own (Pacific) time. */
export function when(plan: ProgramPlan): string {
  const d = new Date(plan.date);
  const day = d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${day} · ${plan.venue}`;
}

const header = (t: string) => ({ type: 'header', text: { type: 'plain_text', text: clip(t, 150), emoji: true } });
const section = (md: string) => ({ type: 'section', text: { type: 'mrkdwn', text: clip(md, 3000) } });
const fields = (pairs: [string, string][]) => ({ type: 'section', fields: pairs.map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })) });
const context = (md: string) => ({ type: 'context', elements: [{ type: 'mrkdwn', text: clip(md, 3000) }] });
const buttons = (bs: ({ text: string; url: string; primary?: boolean } | null)[]) => {
  const els = bs.filter((b): b is { text: string; url: string; primary?: boolean } => !!b).map((b, i) => ({
    type: 'button', text: { type: 'plain_text', text: b.text }, url: b.url, action_id: `open-${i}`, ...(b.primary ? { style: 'primary' } : {}),
  }));
  return els.length ? [{ type: 'actions', elements: els }] : [];
};
const planLink = (l: Links, plan: ProgramPlan) => (l.appUrl ? { text: 'Open in Covers', url: `${l.appUrl}/plans/${encodeURIComponent(plan.id)}` } : null);
const titleOf = (plan: ProgramPlan) => esc(plan.title);

export function blockedMessage(plan: ProgramPlan, status: 'blocked' | 'needs_approval', reasons: CheckResult[], l: Links): SlackMessage {
  const verb = status === 'blocked' ? 'Blocked' : 'Needs compliance';
  const first = reasons[0];
  return {
    text: `${verb}: ${plan.title}. ${first?.message ?? ''}`,
    blocks: [
      header(`${status === 'blocked' ? ':no_entry:' : ':raised_hand:'} ${verb}: ${plan.title}`),
      section(reasons.slice(0, 3).map((c) => `• ${esc(c.message)}`).join('\n')),
      context(`${esc(when(plan))}  ·  ${status === 'blocked' ? 'The card stays locked until this is fixed.' : 'The card stays locked until compliance decides.'}`),
      ...buttons([planLink(l, plan)]),
    ],
  };
}

export function clearedMessage(plan: ProgramPlan, limitCents: number, simulated: boolean, rampUrl: string | undefined, l: Links): SlackMessage {
  return {
    text: `Cleared: ${plan.title}. Card limit ${money(limitCents)}${simulated ? ' (simulated)' : ''}.`,
    blocks: [
      header(`:white_check_mark: Cleared: ${plan.title}`),
      section('Every check passed, so the dinner card is unlocked.'),
      fields([
        ['Card limit', money(limitCents) + (simulated ? ' (simulated)' : '')],
        ['Where', simulated ? 'Simulated card' : 'Restricted to restaurants in Ramp'],
      ]),
      context(esc(when(plan))),
      ...buttons([planLink(l, plan), rampUrl ? { text: 'View in Ramp', url: rampUrl } : null]),
    ],
  };
}

export function closeOutMessage(plan: ProgramPlan, charge: { amountCents: number; merchantName?: string | undefined }, l: Links): SlackMessage {
  const at = charge.merchantName ? ` at ${charge.merchantName}` : '';
  return {
    text: `${plan.title}: the card was charged ${money(charge.amountCents)}${at}. Snap the receipt and tap who came.`,
    blocks: [
      header(`:receipt: Close out: ${plan.title}`),
      section(`The card was charged *${money(charge.amountCents)}*${esc(at)}. Snap the receipt and tap who came. It takes about 30 seconds.`),
      context(esc(when(plan))),
      ...buttons([l.appUrl ? { text: 'Close it out', url: `${l.appUrl}/m/${encodeURIComponent(plan.id)}`, primary: true } : null]),
    ],
  };
}

export function settledMessage(plan: ProgramPlan, receiptTotalCents: number, st: Settlement, l: Links): SlackMessage {
  const rows = st.openPayments.filter((r) => r.reportable).length;
  return {
    text: `Settled: ${plan.title}. ${money(receiptTotalCents)} over ${st.headcount}: ${money(st.perPersonCents)} each. ${st.exceptions.length} item(s) for compliance.`,
    blocks: [
      header(`:ledger: Settled: ${plan.title}`),
      fields([
        ['Receipt', money(receiptTotalCents)],
        ['Each', `${money(st.perPersonCents)} × ${st.headcount} who ate`],
        ['Open Payments', `${rows} row${rows === 1 ? '' : 's'} drafted`],
        ['For compliance', st.exceptions.length ? `${st.exceptions.length} item${st.exceptions.length === 1 ? '' : 's'}` : 'Nothing'],
      ]),
      ...(st.exceptions.length ? [section(st.exceptions.slice(0, 3).map((c) => `• ${esc(c.message)}`).join('\n'))] : []),
      context(esc(when(plan))),
      ...buttons([planLink(l, plan)]),
    ],
  };
}
