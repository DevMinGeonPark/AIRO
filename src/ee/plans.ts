/**
 * Hosted plans (AIRO Cloud). Licensed under src/ee/LICENSE, not AGPL.
 * The community edition never reaches a limit: the self-hoster owns the database.
 */
import { localAuth } from "@/lib/supabase/config";
import type { Plan } from "@/lib/types";

export const FREE_TRIP_LIMIT = 3;

export const tripLimit = (plan: Plan) => (localAuth || plan === "pro" ? Infinity : FREE_TRIP_LIMIT);
export const atTripLimit = (plan: Plan, count: number) => count >= tripLimit(plan);
export const planLabel = (plan: Plan) => (localAuth ? "Self-hosted" : plan === "pro" ? "프로" : "무료");
