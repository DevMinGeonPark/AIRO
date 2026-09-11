import Link from "next/link";
import { AppHeader } from "@/components/app-shell";
export const metadata = { title: "내 Codex 연결 — AIRO" };
export default function CodexGuide() {
  return <div className="min-h-dvh"><AppHeader/><main className="mx-auto max-w-3xl px-6 py-16"><p className="text-xs text-primary">AIRO × Codex</p><h1 className="mt-3 text-3xl font-semibold">내 Codex로, 여기서 여행 만들기.</h1><p className="mt-5 text-sm leading-relaxed text-muted-foreground">Codex에서 AIRO 플러그인을 한 번 연결하면, 아이로 웹과 모바일에서 같은 여행을 이어갈 수 있어요.</p>
    <ol className="my-9 space-y-6"><li><h2 className="font-medium">1. 연결 요청을 Codex에 보내기</h2><p className="mt-2 text-sm text-muted-foreground">내 AI 연결에서 ‘Codex 연결 요청 복사’를 누르고 사용하는 컴퓨터의 Codex에 보내세요. 플러그인 설치를 진행합니다.</p></li><li><h2 className="font-medium">2. 아이로 웹 채팅 연결</h2><p className="mt-2 text-sm text-muted-foreground">플러그인의 ‘아이로 웹 채팅 연결’을 선택하세요. 브라우저가 열리면 AIRO에 로그인하고 같은 연결 번호인지 확인한 뒤 승인하세요.</p></li><li><h2 className="font-medium">3. 여행 화면에서 바로 대화</h2><p className="mt-2 text-sm text-muted-foreground">‘내 Codex · 연결됨’을 확인하고 “둘째 날 점심 다음에 카페를 추가해 줘”처럼 이야기하세요. 선택한 여행의 지도와 일정에 반영됩니다.</p></li></ol>
    <Link href="/app/settings/ai" className="inline-block rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground">내 AI 연결 →</Link>
    <section className="mt-12 border-t pt-7"><h2 className="font-medium">연결 상태 확인</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">‘내 AI 연결’은 실제 실행 기기의 상태를 보여줍니다. 오프라인이면 연결한 컴퓨터를 켜고 플러그인에서 연결을 다시 시작하세요. Codex 로그인이 필요하면 해당 컴퓨터의 Codex에서 로그인하세요. 컴퓨터가 켜져 있으면 휴대폰에서도 같은 AIRO 계정으로 대화할 수 있어요.</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">API는 ‘API로 사용’을 직접 선택했을 때만 호출합니다. 연결이 끊겼을 때 자동으로 API를 사용하지 않아요. 채팅을 중지해도 이미 저장된 일정 변경은 유지됩니다.</p></section>
    <section className="mt-8 border-t pt-7"><h2 className="font-medium">Claude Code 및 다른 AI</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">현재 웹 채팅 연결은 Codex부터 제공합니다. Claude Code에서는 기존 MCP 연결로 대화하며 같은 일정을 수정할 수 있습니다.</p><Link href="/docs/mcp" className="mt-3 inline-block text-sm text-primary">MCP 연결 방법 →</Link></section>
  </main></div>;
}
