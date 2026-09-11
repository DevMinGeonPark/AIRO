import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";
import { mcpOAuthEnabled } from "@/lib/mcp-config";
import { providerRedirect } from "@/lib/oauth-redirect";
import { McpConsent } from "@/components/mcp-consent";
import { AppHeader } from "@/components/app-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "AIRO 연결 승인", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id } = await searchParams;
  const parsed = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).safeParse(authorization_id);
  if (!mcpOAuthEnabled || !parsed.success) return <ConnectError message={!mcpOAuthEnabled ? "OAuth 연결을 준비하고 있습니다. MCP 설정에서 API 키로 연결할 수 있습니다." : "연결 요청이 올바르지 않습니다. 사용하던 AI 도구에서 연결을 다시 시작해 주세요."} />;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/connect?authorization_id=${parsed.data}`)}`);
  const client = (await createClient())!;
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(parsed.data);
  if (error || !data) return <ConnectError message="연결 요청이 만료되었거나 확인할 수 없습니다. AI 도구에서 다시 연결해 주세요." />;
  if (!("authorization_id" in data)) redirect(providerRedirect(data.redirect_url));
  if (data.user.id !== user.id) return <ConnectError message="이 계정의 연결 요청이 아닙니다. 다시 로그인해 주세요." />;
  return <div className="min-h-dvh"><AppHeader /><main className="mx-auto max-w-xl px-5 py-12 sm:py-20"><McpConsent details={data} /></main></div>;
}
function ConnectError({ message }: { message: string }) {
  return <div className="min-h-dvh"><AppHeader /><main className="mx-auto max-w-xl px-6 py-20"><h1 className="text-2xl font-semibold">아이로 연결</h1><p className="text-muted-foreground mt-4 leading-relaxed">{message}</p><Link className="text-primary mt-7 inline-block text-sm" href="/app/settings/keys">MCP 연결 설정으로 돌아가기 →</Link></main></div>;
}
