import { db } from "./db.js";
import type { TaxRuleSet } from "./types.js";

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
};

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
    throw new Error(`No rule set found for tax year ${taxYear}`);
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
    available_versions: versions.rows.map((row) => Number(row.version))
  };
}
