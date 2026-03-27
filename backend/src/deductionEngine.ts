const SUGGESTED_CATEGORIES = [
  "phone",
  "home_office",
  "vehicle_maintenance",
  "ppe",
  "parking_tolls",
  "accountancy"
];

export function getDeductionSuggestions(existingCategories: string[]): string[] {
  const normalized = new Set(existingCategories.map((c) => c.toLowerCase()));
  return SUGGESTED_CATEGORIES.filter((category) => !normalized.has(category));
}
