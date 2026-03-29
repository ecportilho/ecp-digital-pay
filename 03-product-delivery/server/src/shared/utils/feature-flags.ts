import { getDb } from '../../database/connection.js';

/**
 * Get a feature flag value from the database.
 * Falls back to environment variable, then to defaultValue.
 */
export function getFeatureFlag(key: string, defaultValue?: string): string {
  const db = getDb();

  const row = db.prepare('SELECT value FROM feature_flags WHERE key = ?').get(key) as { value: string } | undefined;

  if (row) {
    return row.value;
  }

  // Fallback to environment variable
  const envValue = process.env[key];
  if (envValue !== undefined) {
    return envValue;
  }

  return defaultValue ?? '';
}

/**
 * Set a feature flag value in the database.
 */
export function setFeatureFlag(key: string, value: string, updatedBy?: string): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO feature_flags (key, value, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(key, value, updatedBy ?? null);
}

/**
 * Get all feature flags as a key-value map.
 */
export function getAllFeatureFlags(): Record<string, string> {
  const db = getDb();

  const rows = db.prepare('SELECT key, value FROM feature_flags').all() as Array<{ key: string; value: string }>;

  const flags: Record<string, string> = {};
  for (const row of rows) {
    flags[row.key] = row.value;
  }
  return flags;
}
