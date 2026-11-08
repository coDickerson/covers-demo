import { describe, expect, it } from 'vitest';
import { createRampClient, RampError, RESTAURANTS_CATEGORY } from '../src/ramp';

type Call = { method: string; path: string; body?: any; form?: FormData; auth?: string };

/** A fake Ramp API that records calls and answers like the sandbox did in the spike. */
function fakeRamp(over: Partial<Record<string, (c: Call) => [number, unknown]>> = {}) {
  const calls: Call[] = [];
  let polls = 0;
  const routes: Record<string, (c: Call) => [number, unknown]> = {
    'POST /token': () => [200, { access_token: 'tok', token_type: 'Bearer', expires_in: 864000 }],
    'GET /users': () => [200, { data: [{ id: 'u-guest', role: 'GUEST_USER' }, { id: 'u-biz', role: 'BUSINESS_USER' }] }],
    'POST /limits/deferred': () => [200, { id: 'task-1' }],
    'GET /limits/deferred/status/task-1': () => (++polls < 2 ? [200, { status: 'STARTED' }] : [200, { status: 'SUCCESS', data: { spend_limit_id: 'fund-1' } }]),
    'PATCH /limits/fund-1': () => [200, { id: 'fund-1', cards: [{ card_id: 'card-1', last_four: '1273' }] }],
    'POST /limits/fund-1/suspension': () => [200, {}],
    'POST /limits/fund-1/unsuspension': () => [200, {}],
    'GET /transactions': () => [200, { data: [{ id: 'tx-1', amount: 612, state: 'CLEARED', merchant_name: 'Alder & Vine', user_transaction_time: 't' }] }],
    'POST /memos/tx-1': () => [200, { memo: 'x' }],
    'POST /receipts': () => [201, { id: 'rcpt-1' }],
    ...over,
  };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const path = u.pathname.replace('/developer/v1', '');
    const c: Call = {
      method: init.method ?? 'GET', path, auth: (init.headers as Record<string, string>).Authorization,
      ...(init.body instanceof FormData ? { form: init.body } : init.body ? { body: path === '/token' ? String(init.body) : JSON.parse(String(init.body)) } : {}),
    };
    calls.push(c);
    const route = routes[`${c.method} ${path}`];
    const [status, body] = route ? route(c) : [404, { error_v2: { message: 'nope', error_code: 'X' } }];
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, client: createRampClient({ baseUrl: 'https://demo-api.ramp.com', clientId: 'id', clientSecret: 'secret', fetch: fetchImpl, pollMs: 0 }) };
}

describe('Ramp client', () => {
  it('creates a restaurant-only fund: deferred task, poll, restrict, return the card', async () => {
    const { client, calls } = fakeRamp();
    const fund = await client.createFund({ displayName: 'Dinner', limitCents: 87_500, idempotencyKey: 'k1' });
    expect(fund).toEqual({ fundId: 'fund-1', cardId: 'card-1', lastFour: '1273', ownerUserId: 'u-biz' });
    const create = calls.find((c) => c.path === '/limits/deferred')!;
    expect(create.body).toMatchObject({ user_id: 'u-biz', idempotency_key: 'k1', spending_restrictions: { limit: { amount: 87_500, currency_code: 'USD' }, interval: 'TOTAL' } });
    expect(calls.find((c) => c.method === 'PATCH')!.body.spending_restrictions.allowed_categories).toEqual([RESTAURANTS_CATEGORY]);
  });

  it('gets one token and reuses it', async () => {
    const { client, calls } = fakeRamp();
    await client.lock('fund-1'); await client.unlock('fund-1');
    expect(calls.filter((c) => c.path === '/token')).toHaveLength(1);
    expect(calls.find((c) => c.path === '/token')!.auth).toBe(`Basic ${btoa('id:secret')}`);
    expect(calls.filter((c) => c.path !== '/token').every((c) => c.auth === 'Bearer tok')).toBe(true);
  });

  it('unlocks with POST (DELETE is 405 on the sandbox)', async () => {
    const { client, calls } = fakeRamp();
    await client.unlock('fund-1');
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/limits/fund-1/unsuspension' });
  });

  it('converts transaction amounts from dollars to integer cents', async () => {
    const { client } = fakeRamp();
    expect(await client.transactions('card-1')).toEqual([{ id: 'tx-1', amountCents: 61_200, state: 'CLEARED', merchantName: 'Alder & Vine', at: 't' }]);
  });

  it('uploads the receipt in a field named "receipt" and writes the memo', async () => {
    const { client, calls } = fakeRamp();
    expect(await client.attachReceipt({ transactionId: 'tx-1', userId: 'u-biz', bytes: new Uint8Array([1, 2]), mime: 'image/png', idempotencyKey: 'r1' })).toBe('rcpt-1');
    const form = calls.find((c) => c.path === '/receipts')!.form!;
    expect(form.get('transaction_id')).toBe('tx-1');
    expect(form.get('receipt')).toBeInstanceOf(Blob);
    await client.setMemo('tx-1', 'Covers plan-demo');
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/memos/tx-1', body: { memo: 'Covers plan-demo' } });
  });

  it('turns Ramp errors into RampError with the error code', async () => {
    const { client } = fakeRamp({ 'POST /limits/fund-1/suspension': () => [403, { error_v2: { message: 'These scopes are not allowed', error_code: 'DEVELOPER_7100' } }] });
    await expect(client.lock('fund-1')).rejects.toMatchObject({ name: 'RampError', status: 403, code: 'DEVELOPER_7100' });
    await expect(client.lock('fund-1')).rejects.toBeInstanceOf(RampError);
  });

  it('fails when fund creation never finishes', async () => {
    const { client } = fakeRamp({ 'GET /limits/deferred/status/task-1': () => [200, { status: 'STARTED' }] });
    await expect(client.createFund({ displayName: 'x', limitCents: 1, idempotencyKey: 'k' })).rejects.toMatchObject({ code: 'task_timeout' });
  });
});
