'use client';
// The floating pill menu. Covers returns to the start; Crawl opens the one dinner; Audit is the admin side. The role switch
// changes who is acting in this sandbox, and looks and announces itself differently for each role.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { IDS } from '@covers/contract/fixtures';
import type { Role } from '../lib/dinner';
import { nameOf } from '../lib/map';
import { tokens } from '../lib/tokens';
import { PixelWordmark } from './pixel-wordmark';

export const setRoleCookie = (role: Role) => { document.cookie = `covers_role=${role}; path=/; samesite=lax; max-age=86400`; };
export const readRole = (): Role => (document.cookie.includes('covers_role=compliance') ? 'compliance' : 'rep');

export const DEMO_PLAN = IDS.demoPlan;
const TABS = [['Crawl', `/plans/${DEMO_PLAN}`], ['Audit', '/audit']] as const;
export type Tab = (typeof TABS)[number][0];

const WHO: Record<Role, { name: string; title: string; does: string }> = {
  rep: { name: nameOf(IDS.rep), title: 'Rep', does: 'Plans the dinner, adds the receipt, says who came.' },
  compliance: { name: nameOf(IDS.compliance), title: 'Compliance', does: 'Reviews what the checks flag and decides the exceptions.' },
};
const HANDOFF_MS = tokens['motion/duration/slow'] * 3;

export function AppBar({ role, onRole, active = 'Crawl' }: { role: Role; onRole: (r: Role) => void; active?: Tab | null }) {
  // Switching roles shows a short hand-off card naming who is acting now, so the change can't be missed.
  const [handoff, setHandoff] = useState<Role | null>(null);
  useEffect(() => {
    if (!handoff) return;
    const id = window.setTimeout(() => setHandoff(null), HANDOFF_MS);
    return () => window.clearTimeout(id);
  }, [handoff]);
  const next: Role = role === 'rep' ? 'compliance' : 'rep';
  const me = WHO[role];
  return (
    <>
      <nav className="flex h-13 items-center gap-6 rounded-pill border border-border bg-bg-surface pr-2 pl-6">
        <Link href="/" aria-label="Covers, back to the start" className="text-ink-primary"><PixelWordmark className="h-3.5 w-auto" /></Link>
        {TABS.map(([name, href]) => <Link key={name} href={href} aria-current={active === name ? 'page' : undefined} className={active === name ? 'font-strong underline decoration-2 underline-offset-8' : 'text-ink-muted hover:text-ink-primary'}>{name}</Link>)}
        <span className="flex-1" />
        <button title={`Switch to ${WHO[next].title.toLowerCase()}`} onClick={() => { onRole(next); setHandoff(next); }} className={`flex h-9 cursor-pointer items-center gap-2 rounded-pill border px-4 transition-colors duration-(--motion-duration-base) ease-standard ${role === 'compliance' ? 'border-ink-primary bg-ink-primary text-bg-surface' : 'border-ink-primary bg-bg-surface text-ink-primary hover:bg-accent-tint'}`}>
          <span className="font-mono text-micro tracking-widest opacity-80">{me.title.toUpperCase()}</span>
          <span className="font-strong">{me.name}</span>
          <span aria-hidden="true" className="text-micro opacity-70">⇄</span>
        </button>
      </nav>
      {handoff && (
        <div role="status" className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
          <div className={`covers-card w-96 border px-6 py-5 ${handoff === 'compliance' ? 'border-ink-primary bg-ink-primary text-bg-surface' : 'border-ink-primary bg-bg-surface text-ink-primary'}`}>
            <p className="font-mono text-micro tracking-widest opacity-80">NOW ACTING · {WHO[handoff].title.toUpperCase()}</p>
            <p className="mt-1 text-heading font-bold tracking-tight">{WHO[handoff].name}</p>
            <p className="mt-1 text-small opacity-80">{WHO[handoff].does}</p>
          </div>
        </div>
      )}
    </>
  );
}
