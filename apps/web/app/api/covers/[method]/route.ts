// POST /api/covers/<method>  body: { args: [...] }  → { ok: true, data } | { ok: false, error: { code, message } }
// The browser's only door to CoversService. ctx (session + acting role) always comes from cookies, never the body.
import { NextResponse } from 'next/server';
import { Attendance, CoversError, type CoversErrorBody, type Ctx } from '@covers/contract';
import { fixtures } from '@covers/contract/fixtures';
import { ZodError } from 'zod';
import { addedAtCloseOut, guardAdded, guardCall, paddingFinding } from '@/lib/guards';
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
    const speakerNpiOf = async (ctx: Ctx, id: string | undefined) => (await svc.listSpeakers(ctx)).find((s) => s.id === id)?.hcp.npi;
    await guardCall(method, args, async ({ speakerId, planId }) => {
      const ctx = await getCtx();
      const plan = planId ? (await svc.getPlan(ctx, planId)).plan : undefined;
      return { speakerNpi: await speakerNpiOf(ctx, speakerId ?? plan?.speakerId), inviteeNpis: plan?.inviteeNpis };
    });

    // Close-out: the phone's double check is a convenience; the limits that matter are enforced here, on the server.
    if (method === 'confirmAttendance') {
      const ctx = await getCtx();
      const att = Attendance.parse(args[0]);
      const { plan } = await svc.getPlan(ctx, att.planId);
      const added = addedAtCloseOut(att, plan, await speakerNpiOf(ctx, plan.speakerId));
      guardAdded(added);
      const settlement = await svc.confirmAttendance(ctx, att);
      const receipt = await svc.getReceipt(ctx, att.planId);
      const padding = receipt && paddingFinding(receipt.totalCents, settlement.headcount, added, fixtures.company.perPersonCapCents);
      if (padding) await svc.addNote(ctx, att.planId, { step: 'close_out', target: 'Server check', text: padding });
      return NextResponse.json({ ok: true, data: settlement });
    }

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
