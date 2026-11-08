// Gives every visitor a private sandbox (session cookie, 24 h) and a role (rep by default). No login.
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'covers_sid';
const ROLE_COOKIE = 'covers_role';
const DAY = 60 * 60 * 24;

export function proxy(request: NextRequest) {
  const missingSession = !request.cookies.has(SESSION_COOKIE);
  const missingRole = !request.cookies.has(ROLE_COOKIE);
  if (!missingSession && !missingRole) return NextResponse.next();

  const sid = missingSession ? crypto.randomUUID() : request.cookies.get(SESSION_COOKIE)!.value;
  // Set on the request too, so server components rendering this very request already see them.
  if (missingSession) request.cookies.set(SESSION_COOKIE, sid);
  if (missingRole) request.cookies.set(ROLE_COOKIE, 'rep');

  const res = NextResponse.next({ request: { headers: request.headers } });
  const opts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DAY };
  if (missingSession) res.cookies.set(SESSION_COOKIE, sid, opts);
  if (missingRole) res.cookies.set(ROLE_COOKIE, 'rep', { ...opts, httpOnly: false });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|samples/).*)'],
};
