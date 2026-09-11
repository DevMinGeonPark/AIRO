import { redirect } from "next/navigation";
import { demoEnabled, supabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured && !demoEnabled) redirect("/login");
  if (supabaseConfigured && !await getUser()) redirect("/login");
  return children;
}
