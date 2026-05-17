// Modified by Gigabox Research (2026)
// POST /api/auth/logout — clear session

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ success: true });
}
