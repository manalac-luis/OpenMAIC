// Modified by Gigabox Research (2026)
// GET /api/auth/verify?token=xxx — verify magic link, create session

import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLink, findUserByEmail } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';

function getBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  const host = request.headers.get('host');
  if (host && !host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
    return `${forwardedProto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const base = getBaseUrl(request);

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', base));
  }

  const email = await consumeMagicLink(token);
  if (!email) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', base));
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=user_not_found', base));
  }

  // Create session
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  await session.save();

  return NextResponse.redirect(new URL('/', base));
}
