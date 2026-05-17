// Modified by Gigabox Research (2026)
// Typed query functions for users and progress

import { query } from './pool';

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

export interface ClassroomProgress {
  user_id: number;
  classroom_id: string;
  current_scene: number;
  completed: boolean;
  last_accessed: string;
}

export interface SceneCompletion {
  user_id: number;
  classroom_id: string;
  scene_index: number;
  completed_at: string;
}

// --- Users ---

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await query<User>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<User | null> {
  const rows = await query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createUser(email: string, name?: string): Promise<User> {
  const rows = await query<User>(
    'INSERT INTO users (email, name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING *',
    [email, name ?? null],
  );
  return rows[0];
}

// --- Magic Links ---

export async function createMagicLink(token: string, email: string, expiresAt: Date): Promise<void> {
  await query(
    'INSERT INTO magic_links (token, email, expires_at) VALUES ($1, $2, $3)',
    [token, email, expiresAt],
  );
}

export async function consumeMagicLink(token: string): Promise<string | null> {
  const rows = await query<{ email: string }>(
    `UPDATE magic_links SET used_at = now()
     WHERE token = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING email`,
    [token],
  );
  return rows[0]?.email ?? null;
}

// --- API Keys ---

export async function findApiKeyByHash(hash: string): Promise<{ user_id: number } | null> {
  const rows = await query<{ user_id: number }>(
    `SELECT user_id FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
  if (rows[0]) {
    await query('UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1', [hash]);
  }
  return rows[0] ?? null;
}

// --- Progress ---

export async function getProgress(userId: number, classroomId: string): Promise<ClassroomProgress | null> {
  const rows = await query<ClassroomProgress>(
    'SELECT * FROM classroom_progress WHERE user_id = $1 AND classroom_id = $2',
    [userId, classroomId],
  );
  return rows[0] ?? null;
}

export async function getAllProgress(userId: number): Promise<ClassroomProgress[]> {
  return query<ClassroomProgress>(
    'SELECT * FROM classroom_progress WHERE user_id = $1 ORDER BY last_accessed DESC',
    [userId],
  );
}

export async function upsertProgress(
  userId: number,
  classroomId: string,
  currentScene: number,
  completed: boolean,
): Promise<void> {
  await query(
    `INSERT INTO classroom_progress (user_id, classroom_id, current_scene, completed, last_accessed)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, classroom_id)
     DO UPDATE SET current_scene = $3, completed = $4, last_accessed = now()`,
    [userId, classroomId, currentScene, completed],
  );
}

export async function markSceneComplete(
  userId: number,
  classroomId: string,
  sceneIndex: number,
): Promise<void> {
  await query(
    `INSERT INTO scene_completions (user_id, classroom_id, scene_index)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, classroomId, sceneIndex],
  );
}

export async function getSceneCompletions(userId: number, classroomId: string): Promise<number[]> {
  const rows = await query<{ scene_index: number }>(
    'SELECT scene_index FROM scene_completions WHERE user_id = $1 AND classroom_id = $2 ORDER BY scene_index',
    [userId, classroomId],
  );
  return rows.map((r) => r.scene_index);
}
