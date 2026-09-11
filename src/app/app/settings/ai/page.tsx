import { AppHeader } from "@/components/app-shell";
import { AiConnectionManager } from "@/components/ai-connection-manager";
import { siteUrl } from "@/lib/supabase/config";
export const dynamic = "force-dynamic";
export default function AiSettings() {
  const candidate = process.env.AIRO_CODEX_INSTALL_URL;
  const installUrl = candidate && /^https:\/\/(chatgpt\.com|chat\.openai\.com|codex\.openai\.com)\//.test(candidate) ? candidate : null;
  return <div className="min-h-dvh"><AppHeader showSignOut/><main className="mx-auto max-w-3xl px-5 py-12 sm:py-16"><h1 className="text-3xl font-semibold">내 AI 연결</h1><p className="mb-8 mt-3 text-sm text-muted-foreground">내 계정의 Codex를 연결하고, 여행은 아이로에서 이어가세요.</p><AiConnectionManager installUrl={installUrl} server={siteUrl}/></main></div>;
}
