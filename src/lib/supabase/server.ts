import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured, demoEnabled, localAuth } from "./config";
import { assertLocalConfigured, localAnonKey, localClientOptions, localSession, SESSION_COOKIE } from "./local";
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
  if (localAuth) {
    assertLocalConfigured();
    // 세션 JWT 를 그대로 PostgREST 에 넘긴다. 없으면 anon 으로 질의돼 RLS 가 빈 결과를 돌려준다.
    const token = store.get(SESSION_COOKIE)?.value;
    const bearer = localSession(token) ? token! : localAnonKey();
    return createSupabaseClient(SUPABASE_URL, localAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` }, ...localClientOptions().global },
    });
  }
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
  if (localAuth) return localSession((await cookies()).get(SESSION_COOKIE)?.value);
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}
