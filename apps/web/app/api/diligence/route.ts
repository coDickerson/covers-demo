// POST /api/diligence { npis, venue, estimatedPerPersonCents? } → a stream of newline-delimited JSON:
//   { type: 'event', event }  as each agent starts, calls a tool, finishes
//   { type: 'report', report, trace, seconds }  at the end
//   { type: 'error', error }  if it fails
// Runs the diligence crew on REAL doctors and a REAL venue, from public data (CMS Open Payments, the NPI registry, Google
// Maps via Apify). Read-only: the agents report facts, nothing here changes a dinner or feeds the engine. Needs
// ANTHROPIC_API_KEY on the server (local live mode); the venue agent also needs APIFY_TOKEN.
import { z } from 'zod';
import { createDiligenceCrew, createNppesClient, createOpenPaymentsClient, createVenueClient, isValidNpi, type DiligenceEvent } from '@covers/integrations';
import { checkAgentLimit, clientKey, counterFromEnv } from '@/lib/ask-limit';
import { getCtx } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  npis: z.array(z.string().regex(/^\d{10}$/)).min(1).max(6),
  venue: z.string().trim().min(2).max(120),
  estimatedPerPersonCents: z.number().int().positive().max(1_000_000).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: 'Pick one to six doctors and a venue.' }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ ok: false, error: 'The agents run in local live mode: they need ANTHROPIC_API_KEY on the server.' }, { status: 503 });
  // Fictional seed doctors (NPIs starting with 9 fail the check digit) have no public record to research.
  const npis = [...new Set(parsed.data.npis)].filter((n) => isValidNpi(n) && !n.startsWith('9'));
  if (!npis.length) return Response.json({ ok: false, error: 'The agents research real doctors. The demo’s doctors are fictional, so pick real ones.' }, { status: 400 });
  // Each run costs real API money and the site is a public link: same shared counter as audit questions.
  const counter = counterFromEnv();
  if (!counter) return Response.json({ ok: false, error: 'The agents are off until the usage limits are configured.' }, { status: 503 });
  const refused = await checkAgentLimit(counter, { client: clientKey(request.headers), sessionId: (await getCtx()).sessionId });
  if (refused) return Response.json({ ok: false, error: refused }, { status: 429 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (x: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(x)}\n`));
      const started = Date.now();
      try {
        const crew = createDiligenceCrew({
          nppes: createNppesClient(),
          payments: createOpenPaymentsClient(),
          venue: process.env.APIFY_TOKEN ? createVenueClient() : undefined,
          onEvent: (event: DiligenceEvent) => send({ type: 'event', event }),
        });
        const { report, trace } = await crew.investigate({ venue: parsed.data.venue, npis, estimatedPerPersonCents: parsed.data.estimatedPerPersonCents });
        send({ type: 'report', report, trace, seconds: Math.round((Date.now() - started) / 1000) });
      } catch (e) {
        send({ type: 'error', error: e instanceof Error ? e.message : 'The agents could not finish.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
