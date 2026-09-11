"use client";
import { useState } from "react";
import Link from "next/link";
import { CodeBlock } from "./code-block";
import type { McpConnection } from "@/lib/types";
import { mcpClientSnippet } from "@/lib/landing-ai-tools";

export function McpConnectionManager({ endpoint, oauthEnabled, apiKeyEnabled = true, initialConnections }: { endpoint: string; oauthEnabled: boolean; apiKeyEnabled?: boolean; initialConnections: McpConnection[] }) {
  const [client, setClient] = useState<"web" | "claude" | "cursor" | "codex">(oauthEnabled ? "web" : "claude");
  const [connections, setConnections] = useState(initialConnections), [busy, setBusy] = useState<string | null>(null), [message, setMessage] = useState("");
  const snippets = {
    claude: JSON.stringify({ mcpServers: { airo: { type: "http", url: endpoint, headers: { Authorization: "Bearer ${AIRO_API_KEY}" } } } }, null, 2),
    cursor: JSON.stringify({ mcpServers: { airo: { url: endpoint, headers: { Authorization: "Bearer ${env:AIRO_API_KEY}" } } } }, null, 2),
    codex: `[mcp_servers.airo]\nurl = "${endpoint}"\nbearer_token_env_var = "AIRO_API_KEY"`,
  };
  async function change(id: string, action: "read" | "write" | "revoke") {
    if (busy) return;
    setBusy(id); setMessage("");
    try {
      const response = await fetch(`/api/mcp/connections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "연결을 변경하지 못했습니다.");
      setConnections(rows => rows.map(row => row.client_id !== id ? row : { ...row, ...(action === "revoke" ? { revoked_at: new Date().toISOString() } : { permissions: action === "write" ? ["trips:read", "trips:write"] : ["trips:read"] }) }));
      setMessage(result.warning ?? (action === "revoke" ? "도구의 아이로 접근을 차단했습니다." : "다음 MCP 요청부터 변경한 권한이 적용됩니다."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결을 변경하지 못했습니다."); }
    finally { setBusy(null); }
  }
  return <>
    <section className="mt-8 rounded-2xl border p-5 sm:p-6" aria-labelledby="mcp-setup-title">
      <h2 id="mcp-setup-title" className="text-lg font-medium">쓰던 AI에 아이로 연결하기</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">“내 여행을 보여줘”로 시작해 보세요. 장소를 고르고, 가는 길의 식당과 카페를 일정에 이어 담을 수 있습니다.</p>
      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="연결할 AI 도구">{([{ id: "web", label: "로그인으로 연결" }, { id: "claude", label: "Claude Code" }, { id: "cursor", label: "Cursor" }, { id: "codex", label: "Codex" }] as const).map(item => <button key={item.id} role="tab" aria-selected={client === item.id} aria-controls="mcp-client-panel" id={`mcp-tab-${item.id}`} onClick={() => setClient(item.id)} className={`rounded-full border px-3 py-2 text-xs ${client === item.id ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}`}>{item.label}</button>)}</div>
      <div id="mcp-client-panel" role="tabpanel" aria-labelledby={`mcp-tab-${client}`} className="mt-5">
        {client === "web" ? <><p className="text-muted-foreground mb-3 text-sm leading-relaxed">{oauthEnabled ? "OAuth를 지원하는 도구의 MCP 서버 추가 화면에 아래 URL을 입력하고 아이로에 로그인하세요. 승인 화면에서 조회 또는 일정 편집을 선택합니다." : "로그인 연결은 서버의 OAuth 설정을 마친 뒤 사용할 수 있습니다. 지금은 API 키를 사용하는 도구의 설정을 확인할 수 있습니다."}</p><CodeBlock code={endpoint} /><p className="text-muted-foreground mt-3 text-xs leading-relaxed">ChatGPT·Claude 웹의 커넥터 제공 여부는 사용하는 계정과 워크스페이스 설정에 따라 달라집니다.</p></> : <>
          <p className="text-muted-foreground mb-3 text-sm leading-relaxed">{apiKeyEnabled ? `${client === "claude" ? "프로젝트의 .mcp.json" : client === "cursor" ? "~/.cursor/mcp.json 또는 프로젝트의 .cursor/mcp.json" : "~/.codex/config.toml"}에 추가하세요. 아래에서 발급한 키를 도구 실행 환경의 AIRO_API_KEY에 넣어야 합니다.` : "아래 연결 정보를 도구에 추가하고 아이로 로그인과 여행 권한 승인을 진행하세요."}</p>
          <CodeBlock key={client} code={apiKeyEnabled ? snippets[client] : mcpClientSnippet(client === "claude" ? "claude-code" : client, endpoint, false)} />
          <p className="text-muted-foreground mt-3 text-xs">{apiKeyEnabled ? "설정에 토큰 원문을 넣지 않고 환경 변수에서 읽습니다." : oauthEnabled ? "승인 화면에서 ‘함께 여행 만들기’를 선택하면 일정 편집도 사용할 수 있습니다." : "로그인 연결은 현재 준비 중입니다."}</p>
        </>}
      </div>
      <Link href="/docs/mcp" className="text-primary mt-5 inline-block text-xs">전체 연결 방법과 사용 예시 →</Link>
    </section>
    <section className="mt-10" aria-labelledby="mcp-connections-title">
      <h2 id="mcp-connections-title" className="text-lg font-medium">로그인으로 연결한 도구</h2>
      {message && <p role="status" className="text-primary mt-3 text-sm">{message}</p>}
      {connections.length ? <ul className="mt-4 divide-y rounded-2xl border px-4">{connections.map(row => <li key={row.client_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0"><p className="text-sm font-medium break-all">{row.client_name || "외부 AI 도구"}</p><p className="text-muted-foreground mt-1 text-xs">{row.revoked_at ? "연결 해제됨" : row.permissions.includes("trips:write") ? "조회 및 일정 편집" : "조회 전용"} · {new Date(row.authorized_at).toLocaleDateString("ko-KR")}</p></div>
        <div className="flex items-center gap-3">{!row.revoked_at && <select disabled={Boolean(busy)} aria-label={`${row.client_name} 접근 권한`} className="bg-background rounded-lg border px-2 py-1.5 text-xs" value={row.permissions.includes("trips:write") ? "write" : "read"} onChange={e => change(row.client_id, e.target.value as "read" | "write")}><option value="read">조회 전용</option><option value="write">일정 편집</option></select>}
          <button disabled={Boolean(busy)} className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-50" onClick={() => change(row.client_id, "revoke")}>{busy === row.client_id ? "처리 중…" : row.revoked_at ? "로그인 연결 해제 재시도" : "연결 해제"}</button></div>
      </li>)}</ul> : <p className="text-muted-foreground mt-4 rounded-2xl border border-dashed px-5 py-7 text-sm">로그인으로 승인한 도구가 여기에 표시됩니다.</p>}
    </section>
  </>;
}
