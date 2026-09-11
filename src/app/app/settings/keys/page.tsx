import Link from "next/link";
import { listApiKeys, currentPlan } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { AppHeader } from "@/components/app-shell";
import { ApiKeyManager } from "@/components/api-key-manager";
import { McpConnectionManager } from "@/components/mcp-connection-manager";
import { listMcpConnections } from "@/lib/mcp-connections";
import { mcpResource, mcpOAuthEnabled, mcpApiKeyEnabled } from "@/lib/mcp-config";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const [keys, plan, connections] = await Promise.all([listApiKeys(), currentPlan(), listMcpConnections()]);
  return (
    <div className="min-h-dvh">
      <AppHeader plan={plan} showSignOut={supabaseConfigured} />
      <SetupNotice configured={supabaseConfigured} />

      <main className="mx-auto max-w-4xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">MCP 연결</h1>
        <Link href="/app/settings/ai" className="mt-4 inline-block rounded-full border border-primary/40 px-5 py-3 text-sm text-primary">AIRO 웹에서 내 Codex로 대화하기 →</Link>
        <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
          어디서 대화하든 같은 여행을 이어갑니다. AI가 바꾼 장소와 방문 순서는 아이로의 일정과 지도에 반영됩니다.{" "}
          <Link
            href="/docs/mcp"
            className="text-primary hover:underline dark:text-primary"
          >
            MCP 연동 문서 ›
          </Link>
        </p>
        <McpConnectionManager endpoint={mcpResource} oauthEnabled={mcpOAuthEnabled} apiKeyEnabled={mcpApiKeyEnabled} initialConnections={connections} />
        <section className="mt-12 border-t pt-8"><h2 className="text-lg font-medium">API 키로 연결하기</h2><ApiKeyManager initialKeys={keys} enabled={mcpApiKeyEnabled} /></section>
      </main>
    </div>
  );
}
