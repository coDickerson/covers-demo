import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-16">
      <h1 className="text-title font-strong">Covers</h1>
      <p className="text-ink-secondary">Compliance checks for speaker dinners, enforced at the company card.</p>
      <Link className="w-fit rounded-control bg-accent px-4 py-2 font-strong text-on-accent" href="/styleguide">
        Styleguide
      </Link>
    </main>
  );
}
