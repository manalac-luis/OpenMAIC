// Modified by Gigabox Research (2026)
// GET /api/auth/verify?token=xxx — verify magic link, create session

import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLink, findUserByEmail } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';

function redirectTo(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path.split('?')[0];
  url.search = path.includes('?') ? '?' + path.split('?')[1] : '';
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return redirectTo(request, '/login?error=missing_token');
  }

  const email = await consumeMagicLink(token);
  if (!email) {
    return redirectTo(request, '/login?error=invalid_or_expired');
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return redirectTo(request, '/login?error=user_not_found');
  }

  // Create session
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  await session.save();

  return redirectTo(request, '/');
}
