// Modified by Gigabox Research (2026)
// GET /api/auth/verify?token=xxx — verify magic link, create session

import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLink, findUserByEmail } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
  }

  const email = await consumeMagicLink(token);
  if (!email) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', request.url));
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=user_not_found', request.url));
  }

  // Create session
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  await session.save();

  return NextResponse.redirect(new URL('/', request.url));
}
