// Modified by Gigabox Research (2026)
// POST /api/auth/magic-link — send magic link email

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createMagicLink, createUser } from '@/lib/db/queries';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = body.email?.trim()?.toLowerCase();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  // Ensure user exists
  await createUser(email);

  // Generate token
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await createMagicLink(token, email, expiresAt);

  // Build verify URL
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
  const verifyUrl = `${baseUrl}/api/auth/verify?token=${token}`;

  // Send email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@send.gigabox.ai';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `OpenMAIC <${fromEmail}>`,
        to: [email],
        subject: 'Sign in to OpenMAIC',
        html: `
          <p>Click the link below to sign in to OpenMAIC:</p>
          <p><a href="${verifyUrl}">Sign in to OpenMAIC</a></p>
          <p>This link expires in 15 minutes.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `,
      }),
    });
  } else {
    // Dev mode: log the link
    console.log(`[auth] Magic link for ${email}: ${verifyUrl}`);
  }

  return NextResponse.json({ success: true });
}
