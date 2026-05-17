// Modified by Gigabox Research (2026)
// API key hashing and lookup

import { createHash } from 'crypto';
import { findApiKeyByHash, findUserById } from '../db/queries';
import type { User } from '../db/queries';

const API_KEY_PREFIX = 'gbox_pk_';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function isValidApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length > API_KEY_PREFIX.length + 10;
}

export async function authenticateApiKey(key: string): Promise<User | null> {
  if (!isValidApiKeyFormat(key)) return null;

  const hash = hashApiKey(key);
  const record = await findApiKeyByHash(hash);
  if (!record) return null;

  return findUserById(record.user_id);
}
