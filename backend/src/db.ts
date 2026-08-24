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
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE IF EXISTS weekly_entries ADD COLUMN IF NOT EXISTS company_providing_services_for TEXT",
    "ALTER TABLE IF EXISTS weekly_entries ADD COLUMN IF NOT EXISTS entry_mode TEXT NOT NULL DEFAULT 'weekly'",
    "ALTER TABLE IF EXISTS weekly_entries ADD COLUMN IF NOT EXISTS entry_date DATE",
    `CREATE TABLE IF NOT EXISTS two_factor_backup_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      code_hash TEXT NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_two_factor_backup_codes_user ON two_factor_backup_codes(user_id)",
    `CREATE TABLE IF NOT EXISTS security_audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      email TEXT,
      event_type TEXT NOT NULL,
      event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_security_audit_log_created ON security_audit_log(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_security_audit_log_user ON security_audit_log(user_id, created_at DESC)"
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
