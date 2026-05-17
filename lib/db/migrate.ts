// Modified by Gigabox Research (2026)
// Run SQL migrations on startup

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getPool } from './pool';

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Ensure _migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Find migration files
  const migrationsDir = join(process.cwd(), 'migrations');
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    // No migrations directory — skip
    return;
  }

  for (const file of files) {
    // Check if already applied
    const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue;

    // Apply migration
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    console.log(`[migrate] Applied: ${file}`);
  }
}
