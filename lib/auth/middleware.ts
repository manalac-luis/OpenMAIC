// Modified by Gigabox Research (2026)
// Auth check utility for API routes

import { getSession } from './session';
import { authenticateApiKey } from './api-keys';
import { findUserById } from '../db/queries';
import type { User } from '../db/queries';
import { NextRequest } from 'next/server';

export interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * Authenticate a request via session cookie or API key bearer token.
 * Returns the authenticated user or an error message.
 */
export async function authenticateRequest(request?: NextRequest): Promise<AuthResult> {
  // 1. Check API key in Authorization header
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer gbox_pk_')) {
      const key = authHeader.slice(7); // Remove "Bearer "
      const user = await authenticateApiKey(key);
      if (user) return { user, error: null };
      return { user: null, error: 'Invalid API key' };
    }
  }

  // 2. Check session cookie
  const session = await getSession();
  if (session.userId) {
    const user = await findUserById(session.userId);
    if (user) return { user, error: null };
    // Session references deleted user — clear it
    session.destroy();
  }

  return { user: null, error: 'Not authenticated' };
}

/**
 * Require authentication — returns user or throws Response.
 */
export async function requireAuth(request?: NextRequest): Promise<User> {
  const { user, error } = await authenticateRequest(request);
  if (!user) {
    throw new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return user;
}
