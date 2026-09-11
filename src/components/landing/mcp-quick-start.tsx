"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { mcpClientSnippet, type LandingAiTool } from "@/lib/landing-ai-tools";

export type McpLandingConfig = { endpoint: string; oauthEnabled: boolean; apiKeyEnabled?: boolean };

export function McpQuickStart({ tool, endpoint, oauthEnabled, apiKeyEnabled = true, city }: McpLandingConfig & { tool: LandingAiTool; city: string }) {
  const [method, setMethod] = useState<"login" | "key">("login");
  const supportsApiKey = apiKeyEnabled && ["claude-code", "cursor", "codex"].includes(tool.id);
  const apiKey = method === "key" && supportsApiKey;
  const file = tool.id === "claude-code" ? "프로젝트의 .mcp.json" : tool.id === "cursor" ? "~/.cursor/mcp.json" : "~/.codex/config.toml";
  const firstRequest = "아이로에 저장된 내 여행 목록을 보여줘. 아직 없으면 없다고 알려줘.";
  const createRequest = `아이로에 ${city} 3일 여행을 만들어줘. 첫날 가볼 만한 장소를 찾아서 내가 고르면 일정에 넣어줘.`;
  return <div className="mcp-quick-start" id="mcp-시작" aria-labelledby="mcp-quick-title">
    <header><div><p className="mcp-quick-eyebrow">직접 연결해 보기</p><h3 id="mcp-quick-title">{tool.name}에서 시작하는 내 여행</h3></div><p>위에서 쓰는 AI를 고르고,<br />아래 순서대로 따라오세요.</p></header>
    <ol className="mcp-quick-steps">
      <li><span className="mcp-step-label">01 / 연결</span><div>
        <h4>{tool.name}에 아이로 추가하기</h4>
        {supportsApiKey && <div className="mcp-auth-choice" role="group" aria-label="연결 방식"><button type="button" aria-pressed={!apiKey} onClick={() => setMethod("login")}>로그인으로 연결</button><button type="button" aria-pressed={apiKey} onClick={() => setMethod("key")}>API 키로 연결</button></div>}
        {!apiKey && !oauthEnabled && <p className="mcp-setup-pending" role="note">로그인 연결은 준비 중이에요. 아래는 연결이 열리면 따라 할 순서예요.</p>}
        {apiKey ? <>
          <p><Link href="/app/settings/keys" target="_blank" rel="noopener noreferrer" prefetch={false}>아이로 로그인 · API 키 발급 <ArrowUpRight size={13} /></Link>에서 ‘일정 편집’ 권한으로 키를 만드세요. 열린 설정 창에서 키를 복사한 뒤 이 안내로 돌아오세요.</p>
          <p>아래 설정을 <code>{file}</code>에 추가하세요. 기존 설정이 있다면 airo 항목만 합쳐 넣으세요.</p>
          <CodeBlock key={`${tool.id}-key`} className="mcp-setup-code" label={`${tool.name} 설정`} code={mcpClientSnippet(tool.id, endpoint, true)} />
          <details className="mcp-key-help" open><summary>발급한 키는 어디에 넣나요?</summary><p>macOS·Linux 터미널에서 아래 예시의 따옴표 안을 발급한 키로 바꿔 실행하세요. 키는 이 페이지나 대화창에 붙여넣지 않아요.</p><CodeBlock className="mcp-setup-code" label="API 키 환경 변수 예시" code="export AIRO_API_KEY='airo_여기에_발급한_키'" /><p>{tool.id === "claude-code" ? "같은 터미널에서 claude를 실행하세요." : tool.id === "codex" ? "같은 터미널에서 codex를 실행하세요. IDE는 실행 환경에 같은 변수를 설정한 뒤 다시 시작하세요." : "데스크톱 앱이 실행되는 환경에도 AIRO_API_KEY 변수가 있어야 해요. 터미널에만 설정하면 이미 실행 중인 앱에는 전달되지 않아요."} Windows는 PowerShell에서 <code>{"$env:AIRO_API_KEY='발급한 키'"}</code>를 사용하세요.</p></details>
        </> : <>
          <p>{tool.setup}</p>
          <CodeBlock key={`${tool.id}-login`} className="mcp-setup-code" label={`${tool.name} 연결 정보`} code={mcpClientSnippet(tool.id, endpoint, false)} />
          <p>아이로에서 Google 또는 이메일로 로그인한 뒤, 승인 화면의 <strong>‘함께 여행 만들기’ → ‘연결 허용’</strong>을 선택하세요. 조회만 허용하면 일정을 수정할 수 없어요.</p>
        </>}
        <p className="mcp-step-check">{tool.verify}</p>
      </div></li>
      <li><span className="mcp-step-label">02 / 첫 대화</span><div><h4>연결한 AI에게 이렇게 말해 보세요</h4><CodeBlock className="mcp-setup-code mcp-prompt-code" label="첫 요청" code={firstRequest} /><p>내 여행 목록이나 ‘저장된 여행이 없어요’라는 실제 조회 결과가 오면 연결된 거예요. 서버 주소 복사만으로 연결이 완료되지는 않아요.</p><details><summary>아직 여행이 없다면</summary><CodeBlock className="mcp-setup-code mcp-prompt-code" label="여행 만들기 요청" code={createRequest} /><p>조회 전용 키를 사용했다면 연결 설정에서 편집 권한의 키를 발급하세요.</p></details></div></li>
      <li><span className="mcp-step-label">03 / 내 여행</span><div><h4>식당과 카페를 더하고, 지도에서 확인</h4><p>목적지 두 곳을 고른 다음 “가는 길에 식당 찾아줘”, “이 식당 다음에 카페도 넣어줘”라고 이어가세요.</p><p className="mcp-example-route">출발지 <span>→</span> 식당 <span>→</span> 카페 <span>→</span> 목적지</p><p>아이로에서 같은 여행을 열어두면 약 5초 간격으로 변경을 확인해요. 장소를 직접 편집하거나 채팅 답변을 받는 동안에는 잠시 멈춰요.</p><Link className="mcp-open-trip" href="/app" target="_blank" rel="noopener noreferrer" prefetch={false}>내 여행 열어두기 <ArrowUpRight size={15} /></Link></div></li>
    </ol>
    <details className="mcp-quick-help"><summary>연결이 안 되거나 일정이 바뀌지 않아요</summary><ul><li>연결 메뉴가 없어요: 사용하는 도구의 계정·요금제 또는 조직 관리자 설정을 확인하세요.</li><li>인증에 실패해요: 키 만료·폐기 여부를 확인하거나 AI 도구에서 다시 로그인하세요.</li><li>조회는 되는데 수정이 안 돼요: ‘함께 여행 만들기’ 또는 API 키의 ‘일정 편집’ 권한이 필요해요.</li><li>서버를 사용할 수 없다고 나와요: 아이로의 연결 서비스 준비가 필요할 수 있어요. 로그인 연결 ‘준비 중’ 안내를 확인하세요.</li><li>지도가 그대로예요: 같은 계정의 같은 여행인지 확인하고 편집 창을 닫은 뒤 잠시 기다려 주세요.</li></ul><Link href="/docs/mcp#문제해결" prefetch={false}>자세한 연결 도움말 <ArrowUpRight size={12} /></Link></details>
  </div>;
}
