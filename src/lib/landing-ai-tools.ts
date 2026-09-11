/** Client capabilities checked against the linked official docs on 2026-09-10.
 * These are configurable MCP clients, not claims of a live connected account.
 */
export const landingAiTools = [
  {
    id: "chatgpt-desktop", name: "ChatGPT", surface: "데스크톱",
    description: "데스크톱 앱에서 대화하며, 아이로 여행을 확인하고 일정을 바꿔요.",
    source: "https://learn.chatgpt.com/docs/extend/mcp?surface=app",
    note: "아래는 데스크톱 앱 기준이에요. 웹에서는 개발자 모드의 원격 MCP 앱으로 연결하며, 계정·워크스페이스에 따라 메뉴가 달라요.",
    setup: "Settings → MCP servers → Add server에서 이름은 airo, 방식은 Streamable HTTP로 선택하고 아래 주소를 입력하세요. Save → Restart 후 Authenticate를 누르세요.",
    verify: "대화 입력창에 /mcp를 입력해 airo 서버가 연결되었는지 확인하세요.",
  },
  {
    id: "claude-code", name: "Claude Code", surface: "",
    description: "Claude Code에 원하는 장소를 말하고, 아이로 일정에 더해요.",
    source: "https://code.claude.com/docs/en/mcp",
    note: "Claude Code 기준이에요. Claude 웹·데스크톱의 커넥터와는 설정이 달라요.",
    setup: "아래 명령을 터미널에서 실행한 뒤 Claude Code를 여세요. /mcp에서 airo를 선택하고 인증을 진행하세요.",
    verify: "Claude Code의 /mcp에서 airo 상태가 Connected인지 확인하세요.",
  },
  {
    id: "cursor", name: "Cursor", surface: "",
    description: "Cursor의 Agent 채팅에서 여행을 불러오고, 방문 순서를 바꿔요.",
    source: "https://cursor.com/docs/mcp",
    note: "Cursor의 MCP 설정에서 로그인 또는 API 키 방식으로 연결해요.",
    setup: "아래 설정을 ~/.cursor/mcp.json의 mcpServers에 추가하세요. 기존 서버는 유지하고, Customize에서 airo를 켠 뒤 로그인하세요.",
    verify: "Customize에서 airo가 켜져 있고 여행 도구가 표시되는지 확인하세요.",
  },
  {
    id: "codex", name: "Codex", surface: "CLI · IDE",
    description: "Codex에서 같은 여행을 확인하고, 원하는 일정 수정을 부탁해요.",
    source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
    note: "로컬 Codex CLI·IDE의 MCP 설정으로 연결해요.",
    setup: "아래 설정을 ~/.codex/config.toml에 추가하세요. 터미널에서 codex mcp login airo를 실행하고 로그인하세요.",
    verify: "Codex의 /mcp에서 airo 서버와 여행 도구가 표시되는지 확인하세요.",
  },
  {
    id: "claude", name: "Claude", surface: "웹",
    description: "Claude에서 여행을 이야기하고, 아이로의 일정과 지도에 이어 담아요.",
    source: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
    note: "개인 Pro·Max의 커스텀 커넥터 기준이에요. Team·Enterprise는 조직 소유자의 추가가 먼저 필요해요.",
    setup: "Customize → Connectors → + → Add custom connector에서 이름은 AIRO, URL은 아래 주소로 입력하세요. Add 후 Connect를 눌러 로그인하세요.",
    verify: "새 대화의 + → Connectors에서 AIRO를 켜세요.",
  },
  {
    id: "chatgpt-web", name: "ChatGPT", surface: "웹",
    description: "ChatGPT 웹의 대화에서 아이로 여행을 불러오고, 원하는 장소를 더해요.",
    source: "https://developers.openai.com/api/docs/guides/developer-mode",
    note: "개발자 모드를 지원하는 웹 계정 기준이에요. 요금제·워크스페이스 관리자 설정에 따라 사용 가능 여부가 달라요.",
    setup: "Settings → Security and login → Developer mode를 켜세요. Plugins의 +에서 원격 MCP 앱을 추가하고, 아래 URL과 OAuth 인증을 선택하세요.",
    verify: "새 대화의 + → Developer mode에서 추가한 AIRO 앱을 선택하세요.",
  },
] as const;

export type LandingAiTool = (typeof landingAiTools)[number];

export function mcpClientSnippet(tool: LandingAiTool["id"], endpoint: string, apiKey: boolean) {
  if (tool === "claude" || tool === "chatgpt-web") return endpoint;
  if (tool === "chatgpt-desktop" && !apiKey) return endpoint;
  if (tool === "codex" || tool === "chatgpt-desktop") {
    return `[mcp_servers.airo]\nurl = ${JSON.stringify(endpoint)}${apiKey ? '\nbearer_token_env_var = "AIRO_API_KEY"' : ""}`;
  }
  if (tool === "claude-code" && !apiKey) return `claude mcp add --transport http airo ${endpoint}`;
  return JSON.stringify({ mcpServers: { airo: {
    ...(tool === "claude-code" ? { type: "http" } : {}),
    url: endpoint,
    ...(apiKey ? { headers: { Authorization: tool === "cursor" ? "Bearer ${env:AIRO_API_KEY}" : "Bearer ${AIRO_API_KEY}" } } : {}),
  } } }, null, 2);
}
