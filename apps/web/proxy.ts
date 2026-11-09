// Gives every visitor a private sandbox (session cookie, 24 h) and a role (rep by default). No login.
// A phone close-out link (/m/{planId}?s={sessionId}, from the Slack "Close it out" button) joins that sandbox as the rep,
// so the phone sees the same dinner, card and charge as the laptop that issued the card.
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'covers_sid';
const ROLE_COOKIE = 'covers_role';
const DAY = 60 * 60 * 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cookieOpts = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DAY });

export function proxy(request: NextRequest) {
  const joining = request.nextUrl.pathname.startsWith('/m/') ? request.nextUrl.searchParams.get('s') : null;
  if (joining && UUID.test(joining)) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete('s'); // keep the session id out of the address bar and history
    const res = NextResponse.redirect(clean);
    res.cookies.set(SESSION_COOKIE, joining, cookieOpts());
    res.cookies.set(ROLE_COOKIE, 'rep', { ...cookieOpts(), httpOnly: false });
    return res;
  }

  const missingSession = !request.cookies.has(SESSION_COOKIE);
  const missingRole = !request.cookies.has(ROLE_COOKIE);
  if (!missingSession && !missingRole) return NextResponse.next();

  const sid = missingSession ? crypto.randomUUID() : request.cookies.get(SESSION_COOKIE)!.value;
  // Set on the request too, so server components rendering this very request already see them.
  if (missingSession) request.cookies.set(SESSION_COOKIE, sid);
  if (missingRole) request.cookies.set(ROLE_COOKIE, 'rep');

  const res = NextResponse.next({ request: { headers: request.headers } });
  const opts = cookieOpts();
  if (missingSession) res.cookies.set(SESSION_COOKIE, sid, opts);
  if (missingRole) res.cookies.set(ROLE_COOKIE, 'rep', { ...opts, httpOnly: false });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|samples/).*)'],
};
