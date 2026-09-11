import "server-only";
import { createClient } from "./supabase/server";
import { emptyExpenseBudget, expenseBudgetSchema } from "./expense-budget";

export async function getExpenseBudget(tripId: string) {
  const client = await createClient();
  if (!client) return emptyExpenseBudget();
  const { data, error } = await client.from("trip_archives").select("data->expenseBudget").eq("trip_id", tripId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.expenseBudget == null) return emptyExpenseBudget();
  return expenseBudgetSchema.parse(data.expenseBudget);
}
