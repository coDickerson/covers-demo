// Ramp sandbox client (A6). Only the calls proven in docs/ramp-spike.md.
// Amounts are integer cents, same as the contract.

export const RESTAURANTS_CATEGORY = 19; // confirmed in Ramp's activity log ("Added category: Restaurants")

export class RampError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'RampError';
  }
}

export type RampConfig = {
  baseUrl: string; // https://demo-api.ramp.com
  clientId: string;
  clientSecret: string;
  /** Ramp user who owns the dinner funds; defaults to the first BUSINESS_USER. */
  fundOwnerUserId?: string;
  fetch?: typeof fetch;
  /** Wait between task polls (ms). */
  pollMs?: number;
  maxPolls?: number;
  now?: () => number;
};

export type RampFund = { fundId: string; cardId: string; lastFour: string; ownerUserId: string };
export type RampTransaction = { id: string; amountCents: number; state: string; merchantName: string; at: string };

const SCOPES = [
  'users:read', 'cards:read', 'limits:read', 'limits:write', 'transactions:read',
  'receipts:write', 'memos:write',
].join(' ');

export function createRampClient(cfg: RampConfig) {
  const f = cfg.fetch ?? fetch;
  const now = cfg.now ?? Date.now;
  const api = `${cfg.baseUrl.replace(/\/$/, '')}/developer/v1`;
  let token: { value: string; expiresAt: number } | undefined;
  let owner: string | undefined = cfg.fundOwnerUserId;

  async function getToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const res = await f(`${api}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPES }).toString(),
    });
    const body = await parse(res);
    token = { value: body.access_token, expiresAt: now() + Number(body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function call(method: string, path: string, body?: unknown, form?: FormData): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await getToken()}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await f(`${api}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    return parse(res);
  }

  async function ownerId(): Promise<string> {
    if (owner) return owner;
    const users = (await call('GET', '/users?page_size=50')).data as { id: string; role: string }[];
    const u = users.find((x) => x.role === 'BUSINESS_USER') ?? users[0];
    if (!u) throw new RampError(404, 'no_user', 'No Ramp user to own the fund.');
    owner = u.id;
    return owner;
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    /** Creates a restaurant-only fund with a total cap and returns it with its card. */
    async createFund(input: { displayName: string; limitCents: number; idempotencyKey: string }): Promise<RampFund> {
      const user = await ownerId();
      const task = await call('POST', '/limits/deferred', {
        user_id: user, display_name: input.displayName, idempotency_key: input.idempotencyKey,
        spending_restrictions: { limit: { amount: input.limitCents, currency_code: 'USD' }, interval: 'TOTAL' },
        permitted_spend_types: { primary_card_enabled: true, reimbursements_enabled: false },
      });
      let fundId: string | undefined;
      for (let i = 0; i < (cfg.maxPolls ?? 10) && !fundId; i++) {
        const st = await call('GET', `/limits/deferred/status/${task.id}`);
        if (st.status === 'SUCCESS') fundId = st.data?.spend_limit_id;
        else if (st.status === 'ERROR' || st.status === 'FAILED') throw new RampError(502, 'task_failed', `Fund creation failed: ${JSON.stringify(st.data?.error ?? st.status)}`);
        else await sleep(cfg.pollMs ?? 1000);
      }
      if (!fundId) throw new RampError(504, 'task_timeout', 'Fund creation did not finish in time.');
      const limit = await call('PATCH', `/limits/${fundId}`, {
        spending_restrictions: {
          limit: { amount: input.limitCents, currency_code: 'USD' }, interval: 'TOTAL', allowed_categories: [RESTAURANTS_CATEGORY],
        },
      });
      const card = (limit.cards ?? [])[0];
      return { fundId, cardId: card?.card_id ?? '', lastFour: card?.last_four ?? '', ownerUserId: user };
    },

    async lock(fundId: string): Promise<void> { await call('POST', `/limits/${fundId}/suspension`); },
    async unlock(fundId: string): Promise<void> { await call('POST', `/limits/${fundId}/unsuspension`); },

    async transactions(cardId: string): Promise<RampTransaction[]> {
      const rows = (await call('GET', `/transactions?card_id=${encodeURIComponent(cardId)}&page_size=20`)).data ?? [];
      return rows.map((t: any) => ({
        id: t.id, amountCents: Math.round(Number(t.amount) * 100), state: t.state, merchantName: t.merchant_name ?? '',
        at: t.user_transaction_time ?? '',
      }));
    },

    async setMemo(transactionId: string, memo: string): Promise<void> {
      await call('POST', `/memos/${transactionId}`, { memo });
    },

    async attachReceipt(input: { transactionId: string; userId: string; bytes: Uint8Array; mime: string; idempotencyKey: string }): Promise<string> {
      const form = new FormData();
      form.set('transaction_id', input.transactionId);
      form.set('user_id', input.userId);
      form.set('idempotency_key', input.idempotencyKey);
      form.set('receipt', new Blob([input.bytes as BlobPart], { type: input.mime }), 'receipt');
      return (await call('POST', '/receipts', undefined, form)).id;
    },
  };
}

export type RampClient = ReturnType<typeof createRampClient>;

async function parse(res: Response): Promise<any> {
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const e = body.error_v2 ?? {};
    throw new RampError(res.status, e.error_code ?? String(res.status), e.message ?? `Ramp HTTP ${res.status}`);
  }
  return body;
}
