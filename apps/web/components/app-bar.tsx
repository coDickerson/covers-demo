'use client';
// The floating pill menu. Covers returns home; the role switch changes who is acting in this sandbox.
import Link from 'next/link';
import { IDS } from '@covers/contract/fixtures';
import type { Role } from '../lib/dinner';
import { nameOf } from '../lib/map';

export const setRoleCookie = (role: Role) => { document.cookie = `covers_role=${role}; path=/; samesite=lax; max-age=86400`; };
export const readRole = (): Role => (document.cookie.includes('covers_role=compliance') ? 'compliance' : 'rep');

const NEXT = ['Doctors', 'Rules', 'Documents', 'Proof'];

export function AppBar({ role, onRole }: { role: Role; onRole: (r: Role) => void }) {
  return (
    <nav className="flex h-13 items-center gap-6 rounded-pill border border-border bg-bg-surface pr-2 pl-6">
      <Link href="/" className="text-amount font-bold tracking-tight">Covers</Link>
      <Link href="/" className="font-strong underline decoration-2 underline-offset-8">Dinners</Link>
      {NEXT.map((n) => <span key={n} title="Not built yet" className="text-ink-muted">{n}</span>)}
      <span className="flex-1" />
      <button className="cursor-pointer text-ink-secondary" title="Switch who is acting in this sandbox" onClick={() => onRole(role === 'rep' ? 'compliance' : 'rep')}>
        {role === 'rep' ? `${nameOf(IDS.rep)} · Rep` : `${nameOf(IDS.compliance)} · Compliance`}
      </button>
    </nav>
  );
}
