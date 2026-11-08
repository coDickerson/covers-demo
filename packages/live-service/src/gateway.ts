// CLAUDE.md rule 4: every write goes through here, and the AuditEvent is written first,
// in the same transaction, so a change without its audit row cannot exist.
import { createHash, randomUUID } from 'node:crypto';
import type { AuditEvent, Ctx } from '@covers/contract';
import type { Sql, Tx } from './db';

export type AuditInput = Omit<AuditEvent, 'id' | 'at' | 'actorId' | 'inputHash'> & { input: unknown };

/** Stable JSON: object keys sorted, undefined dropped, so the same input always hashes the same. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export const hashInput = (input: unknown) => createHash('sha256').update(stableJson(input)).digest('hex');

/** Write the audit event, then run the mutation; both commit or neither does. */
export async function write<T>(sql: Sql, ctx: Ctx, audit: AuditInput, mutate: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await appendAudit(tx, ctx, audit);
    return mutate(tx);
  }) as Promise<T>;
}

export async function appendAudit(tx: Tx | Sql, ctx: Ctx, a: AuditInput): Promise<string> {
  const id = randomUUID();
  await tx`
    insert into audit_events (id, session_id, actor_id, action, plan_id, input_hash, model, prompt_version, pack_id, rule_id, detail)
    values (${id}, ${ctx.sessionId}, ${ctx.actorId}, ${a.action}, ${a.planId ?? null}, ${hashInput(a.input)},
            ${a.model ?? null}, ${a.promptVersion ?? null}, ${a.packId ?? null}, ${a.ruleId ?? null}, ${a.detail})`;
  return id;
}

type AuditRow = {
  id: string; at: Date; actor_id: string; action: string; plan_id: string | null; input_hash: string;
  model: string | null; prompt_version: string | null; pack_id: string | null; rule_id: string | null; detail: string;
};

export async function listAudit(sql: Sql, sessionId: string, planId?: string): Promise<AuditEvent[]> {
  const rows = planId
    ? await sql<AuditRow[]>`select * from audit_events where session_id = ${sessionId} and plan_id = ${planId} order by seq`
    : await sql<AuditRow[]>`select * from audit_events where session_id = ${sessionId} order by seq`;
  return rows.map((r) => ({
    id: r.id, at: r.at.toISOString(), actorId: r.actor_id, action: r.action, inputHash: r.input_hash, detail: r.detail,
    ...(r.plan_id ? { planId: r.plan_id } : {}), ...(r.model ? { model: r.model } : {}),
    ...(r.prompt_version ? { promptVersion: r.prompt_version } : {}), ...(r.pack_id ? { packId: r.pack_id } : {}),
    ...(r.rule_id ? { ruleId: r.rule_id } : {}),
  }));
}
