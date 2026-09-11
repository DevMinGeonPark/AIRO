import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured, demoEnabled } from "./config";
import { currentActor } from "../actor";

/** 미설정이면 null. 호출부에서 데모 모드로 분기한다. */
export async function createClient() {
  if (!supabaseConfigured) {
    if (!demoEnabled) throw new Error("로그인 저장소가 설정되지 않았습니다.");
    return null;
  }
  // MCP 처럼 Bearer 토큰으로 들어온 요청은 쿠키 대신 해당 사용자 클라이언트를 쓴다.
  const actor = currentActor();
  if (actor?.client) return actor.client;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        // Server Component 에서는 쓰기가 막혀 있다. 세션 갱신은 미들웨어가 한다.
        try {
          for (const { name, value, options } of list)
            store.set(name, value, options);
        } catch {}
      },
    },
  });
}

export async function getUser() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}
