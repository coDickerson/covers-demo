import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function connect(url: string): Sql {
  return postgres(url, { max: 5, onnotice: () => {} });
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
