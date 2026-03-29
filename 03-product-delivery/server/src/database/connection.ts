import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || resolve(__dirname, '../../database-pay.sqlite');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run migrations
    runMigrations(db);
  }

  return db;
}

function runMigrations(database: Database.Database): void {
  const migrationPath = resolve(__dirname, 'migrations/001-initial.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  // Execute each statement separately (better-sqlite3 does not support multiple statements in exec by default for some versions)
  database.exec(sql);

  console.log('[database] Migrations applied successfully');
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
