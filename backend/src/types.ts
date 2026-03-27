export type ExpenseInput = {
  category: string;
  total_amount: number;
  reimbursed_amount?: number;
};

export type TaxRuleSet = {
  id: string;
  tax_year: string;
  version: number;
  effective_from: string;
  effective_to: string | null;
  source_reference: string | null;
  notes: string | null;
  created_by: string | null;
  personal_allowance: number;
  basic_rate_limit: number;
  basic_rate: number;
  higher_rate: number;
  ni_class2_weekly: number;
  ni_class4_threshold: number;
  ni_class4_rate: number;
};

export type ComplianceWarning = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
};
