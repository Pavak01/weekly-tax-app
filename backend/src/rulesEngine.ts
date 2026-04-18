import { db } from "./db.js";
import type { TaxRuleSet } from "./types.js";

const DEFAULT_RULE_VALUES = {
  personal_allowance: 12570,
  basic_rate_limit: 37700,
  basic_rate: 0.2,
  higher_rate: 0.4,
  ni_class2_weekly: 3.45,
  ni_class4_threshold: 12570,
  ni_class4_rate: 0.09
} as const;

export type RuleReviewCheck = {
  status: "ok" | "review";
  checked_at: string;
  message: string;
  signals: string[];
  source_reference: string | null;
};

export type RuleMonitoringSnapshot = {
  tax_year: string;
  active_rule_set: {
    id: string;
    version: number;
    effective_from: string;
    effective_to: string | null;
    source_reference: string | null;
    notes: string | null;
    created_by: string | null;
  };
  available_versions: number[];
  review: RuleReviewCheck;
};

function getTaxYearStartYear(taxYear: string): number {
  const match = /^(\d{4})-\d{2}$/.exec(taxYear);
  if (!match) {
    throw new Error(`Invalid tax year ${taxYear}`);
  }

  return Number(match[1]);
}

function getExpectedTaxYearStartDate(taxYear: string): string {
  return `${getTaxYearStartYear(taxYear)}-04-06`;
}

function buildRuleReviewCheck(activeRule: TaxRuleSet, taxYear: string, availableVersions: number[]): RuleReviewCheck {
  const checkedAt = new Date().toISOString();
  const expectedEffectiveFrom = getExpectedTaxYearStartDate(taxYear);
  const expectedStartDate = new Date(`${expectedEffectiveFrom}T00:00:00Z`);
  const daysFromExpectedStart = Math.floor((Date.now() - expectedStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const signals: string[] = [];

  if (!activeRule.source_reference) {
    signals.push("No source reference is configured for this rule set.");
  }

  if (activeRule.effective_from !== expectedEffectiveFrom) {
    signals.push(`Effective from date differs from the expected HMRC tax year start of ${expectedEffectiveFrom}.`);
  }

  if (daysFromExpectedStart >= -30 && daysFromExpectedStart <= 60 && availableVersions.length <= 1) {
    signals.push("Only the baseline rule version exists during the yearly rollover window. Review HMRC updates.");
  }

  if (daysFromExpectedStart > 330) {
    signals.push("The active rule set is over 330 days old. Review before filing.");
  }

  return {
    status: signals.length > 0 ? "review" : "ok",
    checked_at: checkedAt,
    message:
      signals.length > 0
        ? "Rule review is recommended before relying on this tax year configuration."
        : "No immediate rule review signals were detected.",
    signals,
    source_reference: activeRule.source_reference
  };
}

export function getTaxYearFromDate(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid week_start_date");
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  const startsNewTaxYear = month > 4 || (month === 4 && day >= 6);
  const startYear = startsNewTaxYear ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

async function createDefaultRuleSet(taxYear: string): Promise<TaxRuleSet> {
  const effectiveFrom = getExpectedTaxYearStartDate(taxYear);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query<TaxRuleSet>(
      `SELECT id, tax_year, version, effective_from::text, effective_to::text, source_reference, notes, created_by,
              personal_allowance, basic_rate_limit, basic_rate, higher_rate,
              ni_class2_weekly, ni_class4_threshold, ni_class4_rate
       FROM tax_rule_sets
       WHERE tax_year = $1
       ORDER BY version DESC, created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [taxYear]
    );

    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    const inserted = await client.query<TaxRuleSet>(
      `INSERT INTO tax_rule_sets (
         tax_year, version, effective_from, effective_to, source_reference, notes, created_by,
         personal_allowance, basic_rate_limit, basic_rate, higher_rate,
         ni_class2_weekly, ni_class4_threshold, ni_class4_rate, created_at
       )
       VALUES ($1, 1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       RETURNING id, tax_year, version, effective_from::text, effective_to::text, source_reference, notes, created_by,
                 personal_allowance, basic_rate_limit, basic_rate, higher_rate,
                 ni_class2_weekly, ni_class4_threshold, ni_class4_rate`,
      [
        taxYear,
        effectiveFrom,
        "https://www.gov.uk/self-employed-national-insurance-rates",
        "Auto-seeded default rule set so tax estimates remain available until reviewed.",
        "auto-seeded-defaults",
        DEFAULT_RULE_VALUES.personal_allowance,
        DEFAULT_RULE_VALUES.basic_rate_limit,
        DEFAULT_RULE_VALUES.basic_rate,
        DEFAULT_RULE_VALUES.higher_rate,
        DEFAULT_RULE_VALUES.ni_class2_weekly,
        DEFAULT_RULE_VALUES.ni_class4_threshold,
        DEFAULT_RULE_VALUES.ni_class4_rate
      ]
    );

    await client.query(
      `INSERT INTO tax_rule_audit_events (tax_year, rule_set_id, event_type, event_payload, performed_by, performed_at)
       VALUES ($1, $2, 'RULE_SET_AUTOSEEDED', jsonb_build_object('version', 1, 'source', 'rulesEngine.ts'), 'system', NOW())`,
      [taxYear, inserted.rows[0].id]
    );

    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getRulesForTaxYear(taxYear: string): Promise<TaxRuleSet> {
  const result = await db.query<TaxRuleSet>(
    `SELECT id, tax_year, version, effective_from::text, effective_to::text, source_reference, notes, created_by,
            personal_allowance, basic_rate_limit, basic_rate, higher_rate,
            ni_class2_weekly, ni_class4_threshold, ni_class4_rate
     FROM tax_rule_sets
     WHERE tax_year = $1
     ORDER BY version DESC, created_at DESC
     LIMIT 1`,
    [taxYear]
  );

  if (result.rows.length === 0) {
    return createDefaultRuleSet(taxYear);
  }

  return result.rows[0];
}

export async function getRuleMonitoringSnapshot(taxYear: string): Promise<RuleMonitoringSnapshot> {
  const activeRule = await getRulesForTaxYear(taxYear);

  const versions = await db.query<{ version: string }>(
    `SELECT version::text
     FROM tax_rule_sets
     WHERE tax_year = $1
     GROUP BY version
     ORDER BY version DESC`,
    [taxYear]
  );

  const availableVersions = versions.rows.map((row) => Number(row.version));

  return {
    tax_year: taxYear,
    active_rule_set: {
      id: activeRule.id,
      version: Number(activeRule.version),
      effective_from: activeRule.effective_from,
      effective_to: activeRule.effective_to,
      source_reference: activeRule.source_reference,
      notes: activeRule.notes,
      created_by: activeRule.created_by
    },
    available_versions: availableVersions,
    review: buildRuleReviewCheck(activeRule, taxYear, availableVersions)
  };
}
