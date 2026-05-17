// Modified by Gigabox Research (2026)
// GET /api/auth/me — current user info

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const { user, error } = await authenticateRequest(request);

  if (!user) {
    return NextResponse.json({ authenticated: false, error }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
