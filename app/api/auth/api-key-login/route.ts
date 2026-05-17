// Modified by Gigabox Research (2026)
// POST /api/auth/api-key-login — authenticate with API key, create session

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-keys';
import { getSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const apiKey = body.api_key?.trim();

  if (!apiKey) {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  const user = await authenticateApiKey(apiKey);
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // Create session
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  await session.save();

  return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
}
