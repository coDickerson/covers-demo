import { describe, expect, it } from 'vitest';
import { createSlackNotifier, slackEscape } from '../src/index';

describe('Slack notifier', () => {
  it('posts the text as JSON to the webhook', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('ok', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    await createSlackNotifier({ webhookUrl: 'https://hooks.slack.test/T/B/x', fetch }).send({ text: 'Cleared: dinner', blocks: [{ type: 'divider' }] });
    expect(calls).toEqual([{ url: 'https://hooks.slack.test/T/B/x', body: { text: 'Cleared: dinner', blocks: [{ type: 'divider' }] } }]);
  });

  it('throws on a Slack error so the caller can log it', async () => {
    const fetch = (async () => new Response('invalid_payload', { status: 400 })) as unknown as typeof globalThis.fetch;
    await expect(createSlackNotifier({ webhookUrl: 'https://hooks.slack.test/x', fetch }).send({ text: 'x' })).rejects.toThrow(/400.*invalid_payload/);
  });

  it('escapes user text so it cannot mention a channel or fake a link', () => {
    expect(slackEscape('<!channel> & <https://evil|Ramp>')).toBe('&lt;!channel&gt; &amp; &lt;https://evil|Ramp&gt;');
  });
});
