// Slack pings through an incoming webhook (A10). One POST per message; no bot token, no reading.
// Text that came from a user (plan titles, names) is escaped, so it can't @-mention a channel or fake a link.

export type SlackConfig = { webhookUrl: string; fetch?: typeof fetch; timeoutMs?: number };
export type SlackNotifier = { send(text: string): Promise<void> };

/** Slack's three control characters in mrkdwn text. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createSlackNotifier(cfg: SlackConfig): SlackNotifier {
  const f = cfg.fetch ?? fetch;
  return {
    async send(text: string) {
      const res = await f(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 3000),
      });
      if (!res.ok) throw new Error(`Slack HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
