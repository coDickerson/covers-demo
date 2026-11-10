'use client';
// The way in: what Covers is in one line, and one button that starts the one dinner from the top.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { covers } from '../lib/client';
import { DEMO_PLAN, setRoleCookie } from './app-bar';
import { PixelWordmark } from './pixel-wordmark';

export function StartScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try { await covers.reset(); } catch { /* a fresh sandbox has nothing to reset */ }
    setRoleCookie('rep');
    router.push(`/plans/${DEMO_PLAN}`);
  };
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-xl">
        <PixelWordmark className="h-7 w-auto text-ink-primary" />
        <h1 className="mt-6 text-title leading-tight font-bold tracking-tight">Speaker dinners checked before the card works, settled after.</h1>
        <p className="mt-4 text-ink-secondary">Follow one dinner, Dr. Patel on catheter outcomes, from the plan to the federal report. Every step is checked against the law and the company&apos;s rules, and the card only opens when they pass.</p>
        <button onClick={start} disabled={busy} className="mt-8 cursor-pointer border border-ink-primary bg-accent px-6 py-3 text-amount font-strong text-on-accent disabled:cursor-default disabled:opacity-60">{busy ? 'Starting…' : 'Start the demo ▸'}</button>
        <p className="mt-6 text-small text-ink-muted">Fictional doctors and company policy; real rules, citations and Ramp sandbox. <Link href="/audit" className="underline hover:text-ink-primary">Audit</Link> shows everything the agent did.</p>
      </div>
    </main>
  );
}
