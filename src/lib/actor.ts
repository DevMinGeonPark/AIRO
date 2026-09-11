import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 요청 하나 동안 "누구로서 동작하는가". MCP 처럼 세션 쿠키가 없는 경로에서
 * Bearer 토큰으로 해석한 사용자를 store 전체에 흘려보내기 위한 통로.
 * 설정돼 있지 않으면 store 는 평소대로 쿠키 세션을 쓴다.
 */
export type Actor = { userId: string; client: SupabaseClient | null };

export const actorStore = new AsyncLocalStorage<Actor>();
export const currentActor = () => actorStore.getStore();
