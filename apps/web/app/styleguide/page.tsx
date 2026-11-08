// Every token, rendered from the generated values. If Figma changes and tokens:pull runs, this page changes.
import { tokens } from '@/lib/tokens';

const entries = Object.entries(tokens) as [string, string | number][];
const group = (prefix: string) => entries.filter(([n]) => n.startsWith(prefix));
const cssVar = (name: string) => `var(--${name.replace(/\//g, '-')})`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-heading font-strong">{title}</h2>
      {children}
    </section>
  );
}

export default function Styleguide() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 p-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-strong">Covers styleguide</h1>
        <p className="text-ink-secondary">{entries.length} tokens from design/tokens.json (Figma collection “Covers tokens”).</p>
      </header>

      <Section title="Color">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {group('color/').map(([name, value]) => (
            <div key={name} className="flex flex-col overflow-hidden rounded-card border border-border bg-bg-surface">
              <div className="h-16" style={{ background: cssVar(name) }} />
              <div className="flex flex-col gap-1 p-3">
                <code className="text-small">{name}</code>
                <span className="tabular text-small text-ink-secondary">{value}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-bg-surface p-6">
          {group('type/size/').map(([name, value]) => (
            <div key={name} className="flex items-baseline gap-6">
              <code className="w-48 text-small text-ink-secondary">{name} · {value}</code>
              <span style={{ fontSize: cssVar(name) }}>Dr. Ana Ruvane · $1,940.00 of $2,000.00</span>
            </div>
          ))}
          <div className="flex items-baseline gap-6">
            <code className="w-48 text-small text-ink-secondary">type/weight/strong</code>
            <span className="font-strong">Blocked: over the annual limit</span>
          </div>
          <div className="flex items-baseline gap-6">
            <code className="w-48 text-small text-ink-secondary">tabular numerals</code>
            <span className="tabular text-amount">$102.00 · $1,111.11 · $875.00</span>
          </div>
        </div>
      </Section>

      <Section title="Space and radius">
        <div className="flex flex-wrap items-end gap-4">
          {group('space/').map(([name, value]) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <div className="bg-accent-strong" style={{ width: cssVar(name), height: cssVar(name) }} />
              <code className="text-small text-ink-secondary">{name.split('/')[1]} · {value}</code>
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          {group('radius/').map(([name, value]) => (
            <div key={name} className="flex h-20 w-32 items-center justify-center border border-border bg-bg-surface" style={{ borderRadius: cssVar(name) }}>
              <code className="text-small">{name.split('/')[1]} · {value}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Signature elements (rough, before Figma components)">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-bg-surface p-6">
          <div className="relative w-full max-w-md rounded-pill bg-bg-canvas" style={{ height: cssVar('size/capbar/height') }}>
            <div className="absolute inset-y-0 left-0 rounded-pill bg-ink-primary" style={{ width: '88%' }} />
            <div className="absolute inset-y-0 rounded-pill bg-status-over" style={{ left: '88%', width: '8%' }} />
            <div className="absolute -inset-y-1 w-px bg-ink-primary" style={{ left: '91%' }} />
          </div>
          <span className="w-fit rounded-control border-2 border-status-over px-3 py-1 font-strong text-status-over" style={{ rotate: cssVar('stamp/rotation') }}>
            BLOCKED
          </span>
          <button className="w-fit rounded-control bg-accent px-4 py-2 font-strong text-on-accent">Unlock card budget</button>
        </div>
      </Section>

      <Section title="Motion">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {group('motion/').map(([name, value]) => (
            <code key={name} className="rounded-control border border-border bg-bg-surface p-3 text-small">{name.replace('motion/', '')} · {value}</code>
          ))}
        </div>
      </Section>
    </main>
  );
}
