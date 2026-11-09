'use client';
// One layout for Doctors, Rules, Documents and Proof: a list on the left, its record in the standard square on the right.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DocCardModel } from '../lib/doc-cards';
import type { Role } from '../lib/dinner';
import type { DocRef, Tone } from '../lib/map';
import { AppBar, readRole, setRoleCookie, type Tab } from './app-bar';
import { DocCard } from './doc-card';

export type ListItem = { id: string; title: string; sub?: string; right?: string; tone?: Tone; card: DocCardModel };
export type ListGroup = { title: string; items: ListItem[] };
const DOT: Record<Tone, string> = { '': 'bg-border', ok: 'bg-status-ok', near: 'bg-status-near', over: 'bg-status-over' };

export function ListDetail({ tab, title, summary, groups, selected, onSelect, onDoc, children }: { tab: Tab; title: string; summary: string; groups: ListGroup[] | null; selected?: string | null; onSelect?: (id: string) => void; onDoc?: (r: DocRef) => void; children?: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('rep');
  const [own, setOwn] = useState<string | null>(null);
  useEffect(() => setRole(readRole()), []);
  const items = groups?.flatMap((g) => g.items) ?? [];
  const current = selected ?? own ?? items[0]?.id;
  const card = items.find((i) => i.id === current)?.card;
  const open = onDoc ?? ((r: DocRef) => router.push(`/documents?doc=${encodeURIComponent(r.doc)}${r.at ? `&at=${encodeURIComponent(r.at)}` : ''}`));
  return (
    <div className="flex h-dvh flex-col px-5 pt-3 pb-4">
      <AppBar active={tab} role={role} onRole={(r) => { setRoleCookie(r); setRole(r); }} />
      <div className="mt-5 flex items-baseline gap-4"><h1 className="text-title font-bold tracking-tight">{title}</h1><span className="text-ink-muted">{summary}</span></div>
      {!groups && <p className="mt-8 text-ink-muted">Loading…</p>}
      {groups && (
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_720px] gap-6">
          <div className="min-h-0 overflow-auto pr-2">
            {children}
            {groups.map((g) => (
              <section key={g.title}>
                <h2 className="mt-3 border-b border-ink-primary pb-1.5 text-small font-bold">{g.title}</h2>
                {g.items.map((i) => (
                  <button key={i.id} onClick={() => { setOwn(i.id); onSelect?.(i.id); }} aria-current={i.id === current ? 'true' : undefined} className={`flex w-full cursor-pointer items-center gap-3 border-b border-border px-2 py-2.5 text-left ${i.id === current ? 'bg-accent-tint' : 'hover:bg-bg-surface'}`}>
                    {i.tone !== undefined && <i className={`size-2 shrink-0 rounded-pill ${DOT[i.tone]}`} />}
                    <span className="min-w-0 flex-1"><b className="block truncate font-strong">{i.title}</b>{i.sub && <small className="block truncate text-small text-ink-muted">{i.sub}</small>}</span>
                    {i.right && <span className="font-mono text-small whitespace-nowrap">{i.right}</span>}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div className="relative min-h-0">{card && <DocCard model={card} onDoc={open} />}</div>
        </div>
      )}
    </div>
  );
}
