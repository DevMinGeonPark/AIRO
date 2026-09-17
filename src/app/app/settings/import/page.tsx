import { AppHeader } from "@/components/app-shell";
import { TripImport } from "@/components/trip-import";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export default async function ImportPage() {
  const user = supabaseConfigured ? await getUser() : null;
  return <><AppHeader showSignOut={!!user} /><main className="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12"><h1 className="text-2xl font-semibold sm:text-3xl">여행 가져오기</h1>
    {user ? <TripImport email={user.email ?? user.id} /> : <p className="mt-6">로그인 저장소를 연결한 뒤 내 계정으로 여행을 가져올 수 있습니다.</p>}
  </main></>;
}
