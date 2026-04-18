import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

export const db = new Pool({ connectionString });

async function ensureDatabaseCompatibility(): Promise<void> {
  const statements = [
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_reset_code_hash TEXT",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMP",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS two_factor_pending_secret TEXT",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP",
    "ALTER TABLE IF EXISTS weekly_entries ADD COLUMN IF NOT EXISTS company_providing_services_for TEXT",
    "ALTER TABLE IF EXISTS weekly_entries ADD COLUMN IF NOT EXISTS entry_mode TEXT NOT NULL DEFAULT 'weekly'",
    "ALTER TABLE IF EXISTS weekly_entries ADD COLUMN IF NOT EXISTS entry_date DATE"
  ];

  const backfillStatements = [
    "UPDATE weekly_entries SET entry_mode = 'weekly' WHERE entry_mode IS NULL OR TRIM(entry_mode) = ''",
    "UPDATE weekly_entries SET entry_date = week_start_date WHERE entry_date IS NULL"
  ];

  for (const statement of statements) {
    await db.query(statement);
  }

  for (const statement of backfillStatements) {
    await db.query(statement);
  }
}

void ensureDatabaseCompatibility().catch((error) => {
  console.error("Database compatibility check failed", error);
});
