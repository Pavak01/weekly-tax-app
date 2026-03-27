import type { ComplianceWarning, TaxRuleSet } from "./types.js";

type TaxEstimateInput = {
  annualProfit: number;
  weeksLogged: number;
  rules: TaxRuleSet;
};

export type TaxEstimate = {
  taxable_income: number;
  estimated_income_tax: number;
  ni_class2: number;
  ni_class4: number;
  estimated_ni: number;
  total_to_set_aside: number;
};

type ComplianceMonitoringInput = {
  annualProfit: number;
  weeksLogged: number;
  totalExpenseAmount: number;
  totalReimbursedAmount: number;
  hasFoodExpense: boolean;
  excessReimbursement: number;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function calculateTaxEstimate({ annualProfit, weeksLogged, rules }: TaxEstimateInput): TaxEstimate {
  const taxableIncome = Math.max(0, annualProfit - Number(rules.personal_allowance));

  let incomeTax = 0;
  if (taxableIncome > 0) {
    if (taxableIncome <= Number(rules.basic_rate_limit)) {
      incomeTax = taxableIncome * Number(rules.basic_rate);
    } else {
      incomeTax =
        Number(rules.basic_rate_limit) * Number(rules.basic_rate) +
        (taxableIncome - Number(rules.basic_rate_limit)) * Number(rules.higher_rate);
    }
  }

  let class2 = 0;
  let class4 = 0;
  if (annualProfit > Number(rules.ni_class4_threshold)) {
    class2 = Number(rules.ni_class2_weekly) * weeksLogged;
    class4 = (annualProfit - Number(rules.ni_class4_threshold)) * Number(rules.ni_class4_rate);
  }

  const estimatedNi = class2 + class4;
  const total = incomeTax + estimatedNi;

  return {
    taxable_income: round2(taxableIncome),
    estimated_income_tax: round2(incomeTax),
    ni_class2: round2(class2),
    ni_class4: round2(class4),
    estimated_ni: round2(estimatedNi),
    total_to_set_aside: round2(total)
  };
}

export function generateComplianceWarnings(input: ComplianceMonitoringInput): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];

  if (input.weeksLogged < 4) {
    warnings.push({
      code: "LOW_SAMPLE_SIZE",
      message: "Fewer than 4 weeks logged this tax year; estimates may be materially unreliable.",
      severity: "medium"
    });
  }

  if (input.hasFoodExpense) {
    warnings.push({
      code: "MEAL_EXPENSE_REVIEW",
      message: "Meal claims often require strict business-purpose evidence. Keep supporting notes and receipts.",
      severity: "medium"
    });
  }

  if (input.excessReimbursement > 0) {
    warnings.push({
      code: "EXCESS_REIMBURSEMENT",
      message: "Reimbursements above recorded expense were treated as income. Verify this matches your records.",
      severity: "high"
    });
  }

  if (input.totalExpenseAmount > 0) {
    const reimbursedRatio = input.totalReimbursedAmount / input.totalExpenseAmount;
    if (reimbursedRatio > 0.6) {
      warnings.push({
        code: "HIGH_REIMBURSEMENT_RATIO",
        message: "A high proportion of expenses were reimbursed. Ensure only net business cost is being claimed.",
        severity: "medium"
      });
    }
  }

  if (input.annualProfit < 0) {
    warnings.push({
      code: "LOSS_POSITION",
      message: "You are currently in a loss position. Confirm treatment of losses with your tax adviser if needed.",
      severity: "low"
    });
  }

  return warnings;
}
