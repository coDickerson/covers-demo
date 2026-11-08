// Per-visitor sandbox identity. proxy.ts guarantees both cookies exist on every request.
import { cookies } from 'next/headers';
import type { Ctx } from '@covers/contract';
import { IDS } from '@covers/contract/fixtures';

export const SESSION_COOKIE = 'covers_sid';
export const ROLE_COOKIE = 'covers_role';

export const ROLES = { rep: IDS.rep, compliance: IDS.compliance } as const;
export type Role = keyof typeof ROLES;

export const isRole = (v: unknown): v is Role => v === 'rep' || v === 'compliance';

/** The service context for the current request: whose sandbox, and who is acting (header role switch). */
export async function getCtx(): Promise<Ctx> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) throw new Error('No session cookie: proxy.ts should have set one.');
  const role = jar.get(ROLE_COOKIE)?.value;
  return { sessionId, actorId: ROLES[isRole(role) ? role : 'rep'] };
}
