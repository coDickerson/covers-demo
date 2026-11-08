import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/**
 * max: COVERS_DB_MAX_CONNECTIONS (default 5; use 1–2 on serverless).
 * Supabase's transaction pooler (port 6543) cannot use prepared statements, so they are turned off there.
 * On Vercel, prefer the transaction pooler URL: the session pooler (5432) allows only 15 clients on the free plan.
 */
export function connect(url: string, opts: { max?: number } = {}): Sql {
  const max = opts.max ?? (Number(process.env.COVERS_DB_MAX_CONNECTIONS) || 5);
  const transactionPooler = /:6543\//.test(url);
  return postgres(url, { max, onnotice: () => {}, ...(transactionPooler ? { prepare: false } : {}) });
}

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

/** Applies migrations/*.sql in name order, once each. Safe to run on every boot. */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(MIGRATIONS, name), 'utf8'));
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    applied.push(name);
  }
  return applied;
}
