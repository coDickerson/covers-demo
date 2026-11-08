// Browser-side CoversService: same methods minus ctx (the server adds it from cookies).
//   const ev = await covers.evaluatePlan('plan-demo');
// Refusals reject with a CoversErrorBody-shaped CoversClientError ({ code, message }).
import type { CoversErrorBody, CoversService, Ctx } from '@covers/contract';
import type { Method } from './methods';

type WithoutCtx<F> = F extends (ctx: Ctx, ...args: infer A) => infer R ? (...args: A) => R : F;
export type CoversClient = { [K in Method]: WithoutCtx<CoversService[K]> };

export class CoversClientError extends Error implements CoversErrorBody {
  constructor(public readonly code: CoversErrorBody['code'], message: string) {
    super(message);
    this.name = 'CoversClientError';
  }
}

async function call(method: Method, args: unknown[]): Promise<unknown> {
  const res = await fetch(`/api/covers/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  });
  const body = (await res.json()) as { ok: true; data: unknown } | { ok: false; error: CoversErrorBody };
  if (!body.ok) throw new CoversClientError(body.error.code, body.error.message);
  return body.data;
}

export const covers = new Proxy({} as CoversClient, {
  get: (_t, method: string) => (...args: unknown[]) => call(method as Method, args),
});
