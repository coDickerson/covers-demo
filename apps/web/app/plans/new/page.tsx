'use client';
// For dinners that need to be logged by hand. Creates a real draft plan, then opens its map.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Hcp, Speaker } from '@covers/contract';
import { IDS } from '@covers/contract/fixtures';
import { AppBar, readRole, setRoleCookie } from '../../../components/app-bar';
import { covers, CoversClientError } from '../../../lib/client';
import type { Role } from '../../../lib/dinner';

const field = 'mt-1 block w-full border border-border bg-bg-surface px-2.5 py-2';

export default function NewDinner() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('rep');
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [speakerId, setSpeakerId] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Hcp[]>([]);
  const [invited, setInvited] = useState<Hcp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRole(readRole()); void covers.listSpeakers().then((s) => { setSpeakers(s); setSpeakerId(s[0]?.id ?? ''); }); }, []);
  useEffect(() => {
    if (!query.trim()) { setFound([]); return; }
    const t = setTimeout(() => { void covers.searchHcps(query).then(setFound).catch(() => setFound([])); }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const speaker = speakers.find((s) => s.id === speakerId);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget), dollars = Number(f.get('estimate')), when = new Date(String(f.get('date')));
    if (!speaker) return setError('Choose a speaker.');
    if (!invited.length) return setError('Invite at least one doctor.');
    if (!Number.isFinite(dollars) || dollars <= 0) return setError('Enter the estimated cost per person.');
    if (Number.isNaN(when.getTime())) return setError('Enter the date and time.');
    const topic = String(f.get('topic'));
    setBusy(true); setError(null);
    try {
      const plan = await covers.createPlan({ title: `Speaker dinner: ${speaker.hcp.name} on ${topic.toLowerCase()}`, purpose: String(f.get('purpose')), topic, repId: IDS.rep, speakerId, venue: String(f.get('venue')), date: when.toISOString(), inviteeNpis: invited.map((h) => h.npi), employeeCount: Number(f.get('employees')), estimatedPerPerson: Math.round(dollars * 100) });
      router.push(`/plans/${encodeURIComponent(plan.id)}`);
    } catch (err) { setError(err instanceof CoversClientError ? err.message : 'The dinner was not saved. Try again.'); setBusy(false); }
  };

  return (
    <main className="px-5 pt-3 pb-8">
      <AppBar active={null} role={role} onRole={(r) => { setRoleCookie(r); setRole(r); }} />
      <form onSubmit={submit} className="mx-auto mt-6 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-4">
        <h1 className="col-span-2 text-title font-bold tracking-tight">New dinner</h1>
        <label>Speaker<select value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} className={field}>{speakers.map((s) => <option key={s.id} value={s.id}>{s.hcp.name}</option>)}</select></label>
        <label>Topic<input name="topic" required list="topics" defaultValue="" className={field} /><datalist id="topics">{speaker?.approvedTopics.map((t) => <option key={t} value={t} />)}</datalist></label>
        <label>Restaurant<input name="venue" required className={field} /></label>
        <label>Date and time<input name="date" type="datetime-local" required className={field} /></label>
        <label>Estimated cost per person, all in<input name="estimate" inputMode="decimal" required placeholder="110" className={`${field} font-mono`} /></label>
        <label>Employees attending, including the rep<input name="employees" type="number" min={0} defaultValue={1} required className={`${field} font-mono`} /></label>
        <label className="col-span-2">Business purpose<textarea name="purpose" required rows={2} className={field} /></label>
        <div className="col-span-2">
          <label>Invite doctors, by name or NPI<input value={query} onChange={(e) => setQuery(e.target.value)} className={field} /></label>
          {found.filter((h) => !invited.some((i) => i.npi === h.npi)).slice(0, 8).map((h) => <button type="button" key={h.npi} onClick={() => { setInvited((x) => [...x, h]); setQuery(''); }} className="flex w-full cursor-pointer justify-between border-b border-border px-2 py-1.5 text-left hover:bg-bg-surface"><span>{h.name}</span><span className="font-mono text-small text-ink-muted">{h.npi}</span></button>)}
          <div className="mt-2 flex flex-wrap gap-1.5">{invited.map((h) => <button type="button" key={h.npi} aria-label={`Remove ${h.name}`} onClick={() => setInvited((x) => x.filter((i) => i.npi !== h.npi))} className="cursor-pointer border border-ink-primary bg-accent-tint px-2 py-1 text-small">{h.name} ×</button>)}</div>
        </div>
        {error && <p role="alert" className="col-span-2 text-status-over">{error}</p>}
        <div className="col-span-2"><button disabled={busy} className="cursor-pointer border border-ink-primary bg-accent px-5 py-2.5 font-strong text-on-accent disabled:cursor-default disabled:opacity-60">Create the dinner</button></div>
      </form>
    </main>
  );
}
