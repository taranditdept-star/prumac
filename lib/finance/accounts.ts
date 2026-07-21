// Chart-of-account codes referenced by the finance reports to map operational
// data (invoices, payments, fuel, maintenance, depreciation) onto accounts.
export const ACC = {
  VEHICLES: "1000",
  ACCUM_DEP: "1010",
  AR: "1100",
  CASH: "1200",
  CASH_ON_HAND: "1210",
  INVENTORY: "1300",
  AP: "2000",
  ACCRUALS: "2100",
  TAX: "2200",
  LOANS: "2300",
  CAPITAL: "3000",
  RETAINED: "3100",
  DRAWINGS: "3200",
  REVENUE: "4000",
  OTHER_INCOME: "4100",
  FUEL: "5000",
  MAINTENANCE: "5100",
  PARTS: "5200",
  SALARIES: "5300",
  INSURANCE: "5400",
  LICENSING: "5500",
  DEPRECIATION: "5600",
  ADMIN: "5700",
  OTHER_EXPENSE: "5900",
} as const;

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  normal_balance: "debit" | "credit";
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
}

export const TYPE_LABEL: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

export const TYPE_TONE: Record<AccountType, string> = {
  asset: "sky",
  liability: "amber",
  equity: "violet",
  income: "emerald",
  expense: "rose",
};

export const fmtMoney = (n: number, dp = 0): string =>
  `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const fmtMoneyC = (n: number): string => {
  const neg = n < 0;
  const s = `$${Math.abs(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return neg ? `(${s})` : s;
};
