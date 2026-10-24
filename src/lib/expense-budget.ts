import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  ["flight", "항공"], ["stay", "숙소"], ["food", "식비"], ["transport", "교통"],
  ["activity", "입장·체험"], ["shopping", "쇼핑"], ["other", "기타"],
] as const;
export const EXPENSE_CURRENCIES = ["KRW", "JPY", "USD", "EUR", "GBP", "CNY", "TWD", "THB", "VND", "SGD", "AUD", "CAD"] as const;
export const expenseSchema = z.object({
  id: z.uuid(), name: z.string().trim().min(1).max(200),
  category: z.enum(["flight", "stay", "food", "transport", "activity", "shopping", "other"]),
  day: z.number().int().min(0).max(3650).nullable(),
  amount: z.number().finite().min(0).max(1e12),
  currency: z.enum(EXPENSE_CURRENCIES),
  exchangeRate: z.number().finite().positive().max(1e6),
  paid: z.boolean(),
  reservationId: z.uuid().nullable().optional(),
}).refine(entry => entry.currency !== "KRW" || entry.exchangeRate === 1, { message: "원화 환율은 1이어야 합니다." })
  .refine(entry => entry.amount * entry.exchangeRate <= 1e12, { message: "한 항목의 원화 금액은 1조 원 이하여야 합니다." });
export const expenseBudgetSchema = z.object({
  version: z.literal(1), revision: z.number().int().min(0).max(2147483646),
  reserve: z.number().finite().min(0).max(1e12),
  entries: z.array(expenseSchema).max(500),
}).refine(budget => new Set(budget.entries.map(entry => entry.id)).size === budget.entries.length, { message: "지출 항목이 중복되었습니다." })
  .refine(budget => { const ids = budget.entries.flatMap(entry => entry.reservationId ? [entry.reservationId] : []); return new Set(ids).size === ids.length; }, { message: "예약은 한 지출 항목에만 연결할 수 있습니다." });

// One reservation links to one ledger entry; retrying a native form must not add a duplicate.
export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseBudgetState = z.infer<typeof expenseBudgetSchema>;
export const emptyExpenseBudget = (): ExpenseBudgetState => ({ version: 1, revision: 0, reserve: 0, entries: [] });
export function expenseTotals(budget: ExpenseBudgetState) {
  let paid = 0, planned = 0;
  for (const entry of budget.entries) {
    const won = Math.round(entry.amount * entry.exchangeRate);
    if (entry.paid) paid += won; else planned += won;
  }
  return { paid, planned, total: paid + planned + budget.reserve };
}
