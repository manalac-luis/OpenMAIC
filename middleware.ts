// Modified by Gigabox Research (2026)
// Dual auth: magic-link sessions (default) or legacy ACCESS_CODE

import { NextRequest, NextResponse } from 'next/server';

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
async function verifyAccessCodeToken(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest) {
  const authMode = process.env.AUTH_MODE || 'magic-link';
  const { pathname } = request.nextUrl;

  // Always allow: health, static assets, auth endpoints
  if (
    pathname === '/api/health' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/access-code/') ||
    pathname === '/login'
  ) {
    return NextResponse.next();
  }

  // --- Legacy ACCESS_CODE mode ---
  if (authMode === 'access-code') {
    const accessCode = process.env.ACCESS_CODE;
    if (!accessCode) return NextResponse.next();

    const cookie = request.cookies.get('openmaic_access');
    if (cookie?.value && (await verifyAccessCodeToken(cookie.value, accessCode))) {
      return NextResponse.next();
    }

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
        { status: 401 },
      );
    }

    // Page requests — let through, frontend shows modal
    return NextResponse.next();
  }

  // --- Magic-link session mode (default) ---
  // Check for session cookie (iron-session encrypts it, so we just check existence here;
  // actual validation happens in the API route handlers via getSession())
  const sessionCookie = request.cookies.get('openmaic_session');

  if (sessionCookie?.value) {
    // Has session cookie — let through (API routes validate internally)
    return NextResponse.next();
  }

  // No session — redirect page requests to /login
  if (!pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // API requests without session → 401
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
