// POST /api/covers/<method>  body: { args: [...] }  → { ok: true, data } | { ok: false, error: { code, message } }
// The browser's only door to CoversService. ctx (session + acting role) always comes from cookies, never the body.
import { NextResponse } from 'next/server';
import { CoversError, type CoversErrorBody } from '@covers/contract';
import { ZodError } from 'zod';
import { isMethod, NO_CTX } from '@/lib/methods';
import { getService } from '@/lib/service';
import { getCtx } from '@/lib/session';

const STATUS: Record<CoversErrorBody['code'], number> = {
  not_found: 404, forbidden: 403, invalid_state: 409, validation: 400, rate_limited: 429,
};

const fail = (error: CoversErrorBody) => NextResponse.json({ ok: false, error }, { status: STATUS[error.code] });

export async function POST(request: Request, { params }: { params: Promise<{ method: string }> }) {
  const { method } = await params;
  if (!isMethod(method)) return fail({ code: 'not_found', message: `Unknown method ${method}.` });

  let args: unknown[] = [];
  try {
    const body = (await request.json().catch(() => ({}))) as { args?: unknown };
    if (body.args !== undefined && !Array.isArray(body.args)) return fail({ code: 'validation', message: 'args must be an array.' });
    args = (body.args as unknown[] | undefined) ?? [];

    const svc = await getService();
    const fn = svc[method] as (...a: unknown[]) => Promise<unknown>;
    const data = NO_CTX.includes(method) ? await fn.call(svc) : await fn.call(svc, await getCtx(), ...args);
    return NextResponse.json({ ok: true, data: data ?? null });
  } catch (e) {
    if (e instanceof CoversError) return fail({ code: e.code, message: e.message });
    if (e instanceof ZodError) return fail({ code: 'validation', message: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    console.error(`[covers] ${method} failed`, e);
    return NextResponse.json({ ok: false, error: { code: 'invalid_state', message: 'Something went wrong on our side.' } }, { status: 500 });
  }
}
