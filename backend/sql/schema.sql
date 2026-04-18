CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  password_hash TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_pending_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP;
ALTER TABLE weekly_entries ADD COLUMN IF NOT EXISTS company_providing_services_for TEXT;
UPDATE users SET role = 'user' WHERE role IS NULL;

CREATE TABLE IF NOT EXISTS weekly_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  week_start_date DATE NOT NULL,
  tax_year TEXT NOT NULL,
  income_total NUMERIC(12,2) NOT NULL,
  company_providing_services_for TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  is_locked BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_entry_id UUID NOT NULL REFERENCES weekly_entries(id),
  category TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  reimbursed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_entry_id UUID NOT NULL REFERENCES weekly_entries(id),
  user_id UUID NOT NULL REFERENCES users(id),
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL DEFAULT NOW()::date,
  effective_to DATE,
  source_reference TEXT,
  notes TEXT,
  created_by TEXT,
  personal_allowance NUMERIC(12,2) NOT NULL,
  basic_rate_limit NUMERIC(12,2) NOT NULL,
  basic_rate NUMERIC(6,4) NOT NULL,
  higher_rate NUMERIC(6,4) NOT NULL,
  ni_class2_weekly NUMERIC(12,2) NOT NULL,
  ni_class4_threshold NUMERIC(12,2) NOT NULL,
  ni_class4_rate NUMERIC(6,4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE tax_rule_sets ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tax_rule_sets ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT NOW()::date;
ALTER TABLE tax_rule_sets ADD COLUMN IF NOT EXISTS effective_to DATE;
ALTER TABLE tax_rule_sets ADD COLUMN IF NOT EXISTS source_reference TEXT;
ALTER TABLE tax_rule_sets ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tax_rule_sets ADD COLUMN IF NOT EXISTS created_by TEXT;

UPDATE tax_rule_sets
SET effective_from = (substring(tax_year FROM 1 FOR 4) || '-04-06')::date
WHERE effective_from IS NULL;

UPDATE tax_rule_sets
SET source_reference = 'https://www.gov.uk/self-employed-national-insurance-rates'
WHERE source_reference IS NULL;

UPDATE tax_rule_sets
SET notes = 'Baseline rule set used for estimate monitoring.'
WHERE notes IS NULL;

UPDATE tax_rule_sets
SET created_by = 'schema-backfill'
WHERE created_by IS NULL;

CREATE TABLE IF NOT EXISTS tax_rule_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year TEXT NOT NULL,
  rule_set_id UUID REFERENCES tax_rule_sets(id),
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by TEXT,
  performed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tax_year TEXT NOT NULL,
  total_income NUMERIC(12,2) NOT NULL,
  total_expenses NUMERIC(12,2) NOT NULL,
  net_profit NUMERIC(12,2) NOT NULL,
  estimated_income_tax NUMERIC(12,2) NOT NULL,
  estimated_ni NUMERIC(12,2) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_weekly_entries_user_tax_year ON weekly_entries(user_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_expenses_weekly_entry ON expenses(weekly_entry_id);
CREATE INDEX IF NOT EXISTS idx_receipts_weekly_entry ON receipts(weekly_entry_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_rule_sets_tax_year ON tax_rule_sets(tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_rule_sets_year_version ON tax_rule_sets(tax_year, version DESC);
CREATE INDEX IF NOT EXISTS idx_tax_rule_audit_tax_year ON tax_rule_audit_events(tax_year, performed_at DESC);
