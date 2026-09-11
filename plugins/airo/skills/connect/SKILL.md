---
name: connect
description: Connect the user's own Codex to AIRO web travel chat, or reconnect/check that connection. Use when the user asks to connect AIRO, says 아이로 웹 채팅 연결, or checks their AIRO connection.
---

# AIRO web chat connection

Connect the local Codex account to an AIRO server — https://airo.dev-heptivision.com by default, or the user's own self-hosted AIRO. This plugin launches a dedicated local Codex App Server and an outbound AIRO bridge. It does not collect OpenAI tokens, edit global Codex settings, or switch to paid API inference.

## Connect

1. Resolve this plugin root (two directories above this skill). On macOS/Linux run its `scripts/connect.sh`; on Windows run `scripts/connect.ps1` with PowerShell. **Self-hosted AIRO**: if the user's request or the server's `/docs/codex/install` guide names a server address other than airo.dev-heptivision.com, run the script with the environment variable `AIRO_ORIGIN=<that address>` (scheme + host, no path; https, or http only on a private/Tailscale address). The bridge remembers the address per device; changing it starts a new pairing. Execute the installed script yourself through the local shell tool; do not ask the user to paste commands or edit JSON. The scripts install checksum-verified runtime files in the user's `.airo` directory and start the connection. These are the plugin's normal setup dependencies.
2. The script opens AIRO in the browser and returns a `url` and `pairingCode`. Show the user a clickable **AIRO 연결 승인** link using the returned URL and the short pairing code. That URL is a private pairing credential: do not send it to external services or include it in logs/issues. Let the user finish Google login and approve that same code.
3. Point the user to **내 AI 연결** in AIRO. Only call the device connected after AIRO actually shows **연결됨**. MCP permissions, plugin installation, and a started process are not proof of a working connection.
4. Once connected, the user chats at AIRO's travel page. The paired computer must remain awake and online; mobile AIRO uses the same account and connection. API is a separate explicit option in AIRO.

## Troubleshooting

- Running the connect script again reuses a live connection; it does not start multiple workers.
- If AIRO shows **Codex 로그인 필요**, help the user finish Codex's own standard ChatGPT login on this machine, then run the script again. Never read or copy `auth.json`, ask for tokens, or send credentials to AIRO.
- **Codex 구독 로그인 필요** means the runtime is using an API/provider account. Let the user choose to sign in through Codex's official ChatGPT login or use AIRO's explicit API option. Never silently change inference billing.
- A revoked connection can be replaced by running the script again. Do not reapprove the connection for the user.
- Do not bypass command approvals, sandbox restrictions, or network restrictions. This integration exposes only the chosen trip's travel tools to its dedicated Codex session.
- The plugin includes a pinned official Codex runtime so a stale globally installed CLI cannot break a newer model. It still uses Codex's own local login and selected model.

## Disconnect

The user can revoke the device in the AIRO server's `/app/settings/ai` page (https://airo.dev-heptivision.com/app/settings/ai for the cloud service). Revocation blocks new work and the local worker exits after its next connection check. Already saved itinerary edits remain saved.
