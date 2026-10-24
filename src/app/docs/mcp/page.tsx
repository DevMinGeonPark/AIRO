import Link from "next/link";
import { toolDefinitions, type ToolName } from "@/lib/tool-contracts";
import { mcpResource, mcpOAuthEnabled, mcpApiKeyEnabled } from "@/lib/mcp-config";
import { AppHeader } from "@/components/app-shell";
import { CodeBlock } from "@/components/code-block";
import { landingAiTools, mcpClientSnippet } from "@/lib/landing-ai-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "MCP 연결 — 아이로" };
const names = Object.keys(toolDefinitions) as ToolName[];

export default function McpDocs() {
  const cursor = mcpClientSnippet("cursor", mcpResource, true);
  const claude = mcpClientSnippet("claude-code", mcpResource, true);
  const codex = mcpClientSnippet("codex", mcpResource, true);
  return <div className="min-h-dvh"><AppHeader /><main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
    <p className="text-primary text-xs font-medium tracking-widest">AIRO MCP</p>
    <h1 className="mt-4 text-3xl leading-tight font-semibold sm:text-4xl">쓰던 AI에게 말하고,<br />아이로에서 확인하기</h1>
    <p className="text-muted-foreground mt-5 max-w-2xl leading-relaxed">외부 AI에서 내 여행을 읽고 장소를 추가하면, 아이로의 같은 일정과 지도가 바뀝니다. 목적지를 고른 뒤 가는 길의 식당과 카페를 찾아 방문 순서에 이어 넣을 수 있습니다.</p>
    <Link className="bg-primary text-primary-foreground mt-6 inline-flex rounded-full px-5 py-2.5 text-sm" href="/app/settings/keys">MCP 연결 설정 →</Link>

    <Link className="text-primary mt-4 block text-sm" href="/#mcp">처음이라면: 랜딩에서 순서대로 연결하기 →</Link>

    <section className="mt-14" id="연결"><h2 className="text-xl font-semibold">1. 로그인으로 연결</h2>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">OAuth를 지원하는 도구에서 원격 MCP 서버를 추가하고 아래 URL을 입력하세요. 아이로 로그인 후 승인 화면에서 ‘조회만 허용’ 또는 ‘함께 여행 만들기’를 선택합니다.</p>
      <CodeBlock className="mt-4" code={mcpResource} />
      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{mcpOAuthEnabled ? "이 서버는 OAuth 연결을 제공하도록 설정되어 있습니다. 실제 연결 상태는 사용하는 도구에서 확인하세요." : "이 서버의 OAuth 연결은 아직 활성화되지 않았습니다. 서버 설정 후 사용할 수 있으며, API 키를 지원하는 도구에서는 아래 방식을 사용하세요."}</p>
      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">ChatGPT·Claude 웹의 연결 메뉴와 사용 가능 여부는 계정·워크스페이스 설정에 따라 달라집니다. <a className="text-primary underline" href="https://developers.openai.com/api/docs/guides/developer-mode" target="_blank" rel="noreferrer">ChatGPT 공식 안내 ↗</a> · <a className="text-primary underline" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Claude 공식 안내 ↗</a></p>
      <h3 id="claude" className="mt-8 font-medium">Claude 웹</h3><p className="text-muted-foreground mt-2 text-sm leading-relaxed">{landingAiTools.find(tool => tool.id === "claude")?.setup} 승인 후 대화의 + → Connectors에서 AIRO를 켜세요. 개인 Pro·Max 기준이며, 조직 계정에서는 소유자의 추가가 먼저 필요합니다.</p>
      <h3 id="chatgpt-web" className="mt-8 font-medium">ChatGPT 웹</h3><p className="text-muted-foreground mt-2 text-sm leading-relaxed">개발자 모드를 지원하는 계정에서 Settings → Security and login → Developer mode를 켜고, Plugins의 +에서 원격 MCP 앱을 추가하세요. 위 서버 URL과 OAuth 인증을 사용합니다. 대화의 + → Developer mode에서 추가한 앱을 선택하세요. 조직에서는 관리자 설정에 따라 제한될 수 있습니다.</p>
      <p className="text-muted-foreground mt-3 text-sm">연결을 해제하거나 편집 권한을 바꾸려면 <Link href="/app/settings/keys" className="text-primary underline">MCP 연결 설정</Link>을 여세요. 권한 변경은 다음 요청부터 적용됩니다.</p>
    </section>

    <section className="mt-14" id="발급"><h2 className="text-xl font-semibold">2. API 키로 연결</h2>
      {!mcpApiKeyEnabled && <p role="status" className="mt-3 rounded-xl border p-4 text-sm">API 키 연결은 준비 중입니다. 현재는 위의 로그인 연결을 사용하세요. 아래 내용은 API 키 방식이 활성화된 경우의 설정 방법입니다.</p>}
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">MCP 연결 설정에서 도구별 키를 발급하세요. 조회 전용 또는 일정 편집 권한과 만료 기간을 선택할 수 있습니다. 토큰 원문은 발급 직후에만 표시합니다.</p>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">발급한 키를 AI 도구 실행 환경의 <code>AIRO_API_KEY</code>에 넣으세요. macOS·Linux 터미널에서는 다음과 같이 설정할 수 있습니다. 데스크톱 앱은 앱이 실행되는 환경에도 변수가 있어야 합니다.</p>
      <CodeBlock className="mt-4" code="export AIRO_API_KEY='airo_여기에_발급한_토큰'" />
      <h3 id="claude-code" className="mt-8 font-medium">Claude Code</h3><p className="text-muted-foreground mt-2 text-sm">프로젝트의 <code>.mcp.json</code>에 추가하고 <code>/mcp</code>에서 연결을 확인하세요.</p><CodeBlock className="mt-3" code={claude} />
      <a className="text-primary mt-2 inline-block text-xs" href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noreferrer">Claude Code 공식 문서 ↗</a>
      <h3 id="cursor" className="mt-8 font-medium">Cursor</h3><p className="text-muted-foreground mt-2 text-sm"><code>~/.cursor/mcp.json</code> 또는 프로젝트의 <code>.cursor/mcp.json</code>에 추가하세요.</p><CodeBlock className="mt-3" code={cursor} />
      <a className="text-primary mt-2 inline-block text-xs" href="https://cursor.com/docs/mcp" target="_blank" rel="noreferrer">Cursor 공식 문서 ↗</a>
      <h3 id="codex" className="mt-8 font-medium">Codex CLI · IDE</h3><p className="text-muted-foreground mt-2 text-sm"><code>~/.codex/config.toml</code>에 추가하세요. OAuth로 연결하려면 아래 설정의 <code>bearer_token_env_var</code> 줄을 제외하고 <code>codex mcp login airo</code>를 실행합니다.</p><CodeBlock className="mt-3" code={codex} />
      <a className="text-primary mt-2 inline-block text-xs" href="https://learn.chatgpt.com/docs/extend/mcp" target="_blank" rel="noreferrer">Codex 공식 문서 ↗</a>
      <h3 id="chatgpt-desktop" className="mt-8 font-medium">ChatGPT 데스크톱</h3><p className="text-muted-foreground mt-2 text-sm leading-relaxed">Settings → MCP servers → Add server에서 Streamable HTTP와 위 서버 URL을 입력하세요. Save → Restart 후 Authenticate로 아이로에 로그인하고 편집 권한을 승인하세요. 대화창의 /mcp에서 연결을 확인합니다. 이 서버의 OAuth 연결이 활성화된 뒤 사용할 수 있습니다.</p>
      <a className="text-primary mt-2 inline-block text-xs" href="https://learn.chatgpt.com/docs/extend/mcp?surface=app" target="_blank" rel="noreferrer">데스크톱 공식 안내 ↗</a>
    </section>

    <section className="mt-14" id="사용"><h2 className="text-xl font-semibold">3. 이렇게 여행을 이어가세요</h2>
      <ol className="mt-5 space-y-4 text-sm leading-relaxed">
        <li><strong className="font-medium">“아이로에 저장된 여행을 보여줘.”</strong><p className="text-muted-foreground mt-1">여행을 선택하면 현재 일차·방문 순서·장소를 불러옵니다.</p></li>
        <li><strong className="font-medium">“첫날 콜로세움에서 트레비 분수까지 가고 싶어. 가는 길에 밥집 있어?”</strong><p className="text-muted-foreground mt-1">목적지를 검색해 선택한 뒤, 저장된 두 장소 사이의 도로를 따라 후보를 찾습니다.</p></li>
        <li><strong className="font-medium">“두 번째 식당을 넣고, 식당 다음에는 이 카페를 넣어줘.”</strong><p className="text-muted-foreground mt-1">관광지 → 식당 → 카페 → 다음 목적지 순으로 이어집니다. 다른 장소는 유지합니다.</p></li>
        <li><strong className="font-medium">아이로에서 변경된 지도 확인</strong><p className="text-muted-foreground mt-1">열려 있는 여행 화면은 약 5초마다 변경을 확인합니다. 직접 편집·채팅 중에는 자동 갱신을 잠시 멈춥니다.</p></li>
      </ol>
      <p className="text-muted-foreground mt-5 text-xs leading-relaxed">식당 검색은 실제 도로의 세 지점 주변 후보를 모으는 방식입니다. 경로까지의 거리는 근사값이며, 영업 여부와 실제 우회 시간은 별도로 확인해야 합니다. 도로 공급자 오류가 나면 직선 경로를 대신 만들지 않습니다.</p>
    </section>

    <section className="mt-14" id="도구"><h2 className="text-xl font-semibold">4. 사용할 수 있는 도구</h2><div className="mt-5 divide-y rounded-2xl border px-4 sm:px-5">{names.map(name => <div key={name} className="py-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">{toolDefinitions[name].title}</h3><code className="text-muted-foreground text-xs">{name}</code><span className="text-primary rounded-full border border-primary/20 px-2 py-0.5 text-[10px]">{toolDefinitions[name].permission === "trips:write" ? "편집 권한 필요" : "조회"}</span></div><p className="text-muted-foreground mt-2 text-xs leading-relaxed">{toolDefinitions[name].description}</p></div>)}</div>
      <p className="text-muted-foreground mt-4 text-sm leading-relaxed">PDF는 파일당 2 MiB까지 첨부하고 원본 파일로 조회할 수 있습니다. 예약 상태와 결제 상태는 각각 저장됩니다. 예산·예약·알림을 수정할 때는 먼저 조회한 revision을 사용하세요. 다른 곳에서 수정했다면 최신 자료를 다시 조회해야 합니다.</p>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">변경 이력은 기능 도입 이후부터 기록됩니다. 복원 전에 변경 내용을 확인하고, 최신 이력 ID와 함께 되돌리기를 요청하세요. 이후 같은 자료가 수정되었으면 복원을 중단합니다. 여행 전체 삭제는 복원 대상에 포함되지 않습니다.</p>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">알림은 시간대·시각·활성화 설정을 보관합니다. 현재 푸시·메일·문자 발송 서비스는 연결되어 있지 않습니다.</p>
      <p className="text-muted-foreground mt-4 text-xs leading-relaxed">여행 리소스 <code>airo://trips</code>, <code>airo://trips/여행ID</code>와 여행 계획 프롬프트 <code>plan-trip</code>도 제공합니다. 실제 노출되는 도구는 연결 권한에 따라 달라집니다.</p>
    </section>
    <section className="mt-14" id="문제해결"><h2 className="text-xl font-semibold">연결이 안 될 때</h2><ul className="text-muted-foreground mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed"><li>401: 키 만료·폐기 또는 로그인 연결 해제 여부를 확인하고 다시 연결하세요.</li><li>403: 조회 전용 연결에서는 일정을 수정할 수 없습니다. MCP 연결 설정에서 권한을 변경하세요. 브라우저 Origin 제한도 원인이 될 수 있습니다.</li><li>503: 서버의 인증·데이터베이스 설정 또는 공급자 상태 확인이 필요합니다.</li><li>직접 HTTP로 확인할 때는 <code>Accept: application/json, text/event-stream</code>과 <code>Content-Type: application/json</code>을 함께 보내세요.</li></ul></section>
  </main></div>;
}
