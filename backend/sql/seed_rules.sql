WITH inserted AS (
  INSERT INTO tax_rule_sets (
    tax_year,
    version,
    effective_from,
    source_reference,
    notes,
    created_by,
    personal_allowance,
    basic_rate_limit,
    basic_rate,
    higher_rate,
    ni_class2_weekly,
    ni_class4_threshold,
    ni_class4_rate
  )
  SELECT
    '2025-26',
    1,
    DATE '2025-04-06',
    'https://www.gov.uk/self-employed-national-insurance-rates',
    'Seeded baseline rates for MVP monitoring.',
    'seed_rules.sql',
    12570,
    37700,
    0.20,
    0.40,
    3.45,
    12570,
    0.09
  WHERE NOT EXISTS (
    SELECT 1 FROM tax_rule_sets WHERE tax_year = '2025-26' AND version = 1
  )
  RETURNING id, tax_year, version
)
INSERT INTO tax_rule_audit_events (tax_year, rule_set_id, event_type, event_payload, performed_by)
SELECT tax_year, id, 'RULE_SET_SEEDED', jsonb_build_object('version', version), 'seed_rules.sql'
FROM inserted;

WITH inserted AS (
  INSERT INTO tax_rule_sets (
    tax_year,
    version,
    effective_from,
    source_reference,
    notes,
    created_by,
    personal_allowance,
    basic_rate_limit,
    basic_rate,
    higher_rate,
    ni_class2_weekly,
    ni_class4_threshold,
    ni_class4_rate
  )
  SELECT
    '2026-27',
    1,
    DATE '2026-04-06',
    'https://www.gov.uk/self-employed-national-insurance-rates',
    'Seeded baseline rates for MVP monitoring.',
    'seed_rules.sql',
    12570,
    37700,
    0.20,
    0.40,
    3.45,
    12570,
    0.09
  WHERE NOT EXISTS (
    SELECT 1 FROM tax_rule_sets WHERE tax_year = '2026-27' AND version = 1
  )
  RETURNING id, tax_year, version
)
INSERT INTO tax_rule_audit_events (tax_year, rule_set_id, event_type, event_payload, performed_by)
SELECT tax_year, id, 'RULE_SET_SEEDED', jsonb_build_object('version', version), 'seed_rules.sql'
FROM inserted;
