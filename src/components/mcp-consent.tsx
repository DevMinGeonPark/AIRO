"use client";
import { useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { ArrowUpRight, Check, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";

export function McpConsent({ details }: { details: OAuthAuthorizationDetails }) {
  const [permission, setPermission] = useState<"read" | "write">("read");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function decide(decision: "approve" | "deny") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/mcp/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorizationId: details.authorization_id, permission, decision }) });
      const result = await response.json();
      if (!response.ok || !result.redirectUrl) throw new Error(result.error ?? "연결을 처리하지 못했습니다.");
      window.location.assign(result.redirectUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 처리하지 못했습니다."); setBusy(false); }
  }
  const identityScopes = details.scope.split(/\s+/).filter(Boolean);
  return <section>
    <div className="bg-primary/10 text-primary mb-7 flex size-12 items-center justify-center rounded-2xl"><MapPinned size={23} /></div>
    <p className="text-primary text-xs font-medium tracking-widest">AIRO MCP</p>
    <h1 className="mt-3 text-3xl leading-snug font-semibold break-words">{details.client.name || "외부 AI 도구"}와<br />여행을 이어갈까요?</h1>
    <p className="text-muted-foreground mt-4 text-sm leading-relaxed">{details.user.email} 계정의 여행을 연결합니다. 이 도구에서 허용할 작업을 선택하세요.</p>
    <fieldset disabled={busy} className="mt-8 space-y-3">
      <legend className="mb-3 text-sm font-medium">여행 접근 권한</legend>
      {([{ value: "read", title: "조회만 허용", description: "여행·일정·메모·대화 기록을 읽고 장소와 이동 경로를 검색합니다." }, { value: "write", title: "함께 여행 만들기", description: "조회에 더해 여행과 장소를 만들고 수정·삭제하며 방문 순서를 바꿀 수 있습니다." }] as const).map(option => <label key={option.value} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${permission === option.value ? "border-primary/60 bg-primary/5" : "border-border"}`}>
        <input className="accent-primary mt-1" type="radio" name="permission" value={option.value} checked={permission === option.value} onChange={() => setPermission(option.value)} />
        <span><span className="block text-sm font-medium">{option.title}</span><span className="text-muted-foreground mt-1 block text-xs leading-relaxed">{option.description}</span></span>
      </label>)}
    </fieldset>
    <div className="text-muted-foreground mt-6 space-y-2 text-xs leading-relaxed">
      <p className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0" />연결한 도구와 권한은 아이로 설정에서 언제든 변경하거나 해제할 수 있습니다.</p>
      {!!identityScopes.length && <p>로그인 제공자가 요청한 정보: {identityScopes.map(s => ({ openid: "계정 식별", email: "이메일", profile: "프로필", phone: "전화번호" })[s] ?? s).join(" · ")}</p>}
      <p className="break-all">돌아갈 주소: {details.redirect_uri}</p>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
    <div className="mt-8 flex gap-3"><Button disabled={busy} variant="outline" className="rounded-full px-6" onClick={() => decide("deny")}>취소</Button><Button disabled={busy} className="flex-1 rounded-full" onClick={() => decide("approve")}>{busy ? "처리 중…" : "연결 허용"}<ArrowUpRight size={16} /></Button></div>
  </section>;
}
