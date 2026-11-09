'use client';
// The floating pill menu. Covers returns home; the role switch changes who is acting in this sandbox.
import Link from 'next/link';
import { IDS } from '@covers/contract/fixtures';
import type { Role } from '../lib/dinner';
import { nameOf } from '../lib/map';

export const setRoleCookie = (role: Role) => { document.cookie = `covers_role=${role}; path=/; samesite=lax; max-age=86400`; };
export const readRole = (): Role => (document.cookie.includes('covers_role=compliance') ? 'compliance' : 'rep');

const TABS = [['Dinners', '/'], ['Doctors', '/doctors'], ['Rules', '/rules'], ['Documents', '/documents'], ['Proof', '/proof']] as const;
export type Tab = (typeof TABS)[number][0];

export function AppBar({ role, onRole, active = 'Dinners' }: { role: Role; onRole: (r: Role) => void; active?: Tab | null }) {
  return (
    <nav className="flex h-13 items-center gap-6 rounded-pill border border-border bg-bg-surface pr-2 pl-6">
      <Link href="/" className="text-amount font-bold tracking-tight">Covers</Link>
      {TABS.map(([name, href]) => <Link key={name} href={href} aria-current={active === name ? 'page' : undefined} className={active === name ? 'font-strong underline decoration-2 underline-offset-8' : 'text-ink-muted hover:text-ink-primary'}>{name}</Link>)}
      <span className="flex-1" />
      <Link href="/plans/new" className="text-small text-ink-muted hover:text-ink-primary">+ New dinner</Link>
      <button className="cursor-pointer pr-3 text-ink-secondary" title="Switch who is acting in this sandbox" onClick={() => onRole(role === 'rep' ? 'compliance' : 'rep')}>
        {role === 'rep' ? `${nameOf(IDS.rep)} · Rep` : `${nameOf(IDS.compliance)} · Compliance`}
      </button>
    </nav>
  );
}
