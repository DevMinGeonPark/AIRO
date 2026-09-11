# Codex web chat connection

AIRO uses a paired local Codex App Server for web/mobile chat by default. The existing external-client MCP integration remains separate. API inference requires explicit selection in the travel chat and `provider: "api"` on `/api/chat`.

## User flow

Open https://airo.dev-heptivision.com/app/settings/ai, copy the connection request, and send it to Codex on the computer that will process the conversation. Codex installs `airo@airo` and runs the plugin's platform setup script. The user signs into AIRO and approves the matching pairing code. The travel chat shows Codex, the actual paired device name, and heartbeat status; during a job it keeps showing the assigned device even if another device becomes available.

The public installation instructions are `/docs/codex/install`; the public Git marketplace is `/plugins/airo.git`. An official Codex plugin share URL could not be issued: `plugin/share/save` returned HTTP 404 for the workspace upload endpoint on 2026-09-10. No directory listing or official one-click installation is claimed. If a valid share URL is later issued, `AIRO_CODEX_INSTALL_URL` can enable the install link.

The paired computer must remain awake and online. Reopening the plugin's connect skill restarts a stopped bridge. Native automatic login/startup installation is not included. Claude Code can already edit trips through MCP; its AIRO web-chat bridge is not enabled.

## Account boundary

- Migration `0009_codex_bridge.sql` creates device, job, and tool-call queues. Direct client table access is revoked; RPC ownership/role checks protect all operations.
- Pairing uses a random device secret, stored in a private local file, with only its SHA-256 hash in the database. The browser receives it in the URL fragment and clears it after approval. A connection is not ready until its heartbeat reports a ChatGPT-backed Codex account.
- The worker only claims jobs for its paired account. The authenticated browser executes the existing trip tools through `/api/bridge/jobs/:id` with the selected trip fixed server-side. Tool claims are exclusive; mutation request IDs are stable. Revocation and cancellation stop further claims; already saved changes remain.
- The AIRO server does not receive OpenAI authentication tokens. The native official runtime reads its own normal Codex login. API/provider accounts do not silently become the subscription connection.
- A dedicated ephemeral read-only thread exposes only the itinerary tools. Explicit per-server/plugin overrides disable inherited MCP integrations; startup checks that no inherited tools remain. Local command approvals are declined. The user's global Codex configuration is not edited by the bridge.

## Release

`npm run plugin:build` cross-compiles the bridge with Bun and verifies pinned official Codex npm runtimes. `npm run plugin:package` packages the reviewed plugin as a static Git marketplace and ZIP. Both commands must run before a production build and generated `public/downloads` plus `public/plugins/airo.git` must be included in the deployment snapshot. No `.private` contents are published.

The bundled official Codex runtime is pinned to 0.154.0. The previous globally installed 0.144.1 could not serve the configured model. No model substitution was used. Packages target macOS arm64/x64, Linux arm64/x64, and Windows x64. An actual subscription model turn was verified on macOS arm64. A clean Linux arm64 container installed the public plugin, ran the checksum-verifying platform bootstrap and compiled bridge, initialized App Server, and correctly reported missing Codex login. The other compiled targets are not claimed as end-to-end tested.

## Verification

- `node scripts/test-codex-bridge.mjs`: SQL ownership, role and key checks, job replay, exclusive tools, cancellation/revocation, fake App Server protocol and rejected unrelated tools.
- `node scripts/test-workspace-ui.mjs`: Chrome desktop/mobile and WebKit 320px, chat tool application, default Codex and no implicit API calls, cancellation, copy onboarding, pair/revoke, live/offline device identity, API identification, existing map/budget behavior and overflow.
- Actual official Codex ChatGPT-account turn changed an in-memory fixture stop once and returned a reply with zero inherited MCP tools. No real itinerary mutation was used for this check.
- Live database pairing/heartbeat/job checks ran inside a rolled-back transaction. Test rows did not remain.
- TypeScript, ESLint and production build. Browser artifacts: `assets/validation/workspace/`; private runtime/database verification: `.private/deployment/codex-bridge-20260910/`.
- `node scripts/verify-codex-release.mjs`: public guide and mobile layouts, pairing fragment retained through the canonical login redirect, no secret in network URLs, unauthenticated endpoint rejection, installation instructions and native package checksum. Local previews redirect login to the canonical production host and cannot retain browser storage across that origin change; native pairing links always use the canonical public URL.
- Public HTTP Git clone and `codex plugin marketplace add` / `codex plugin add airo@airo` succeeded in an isolated container with no host Codex configuration or account changes. Official-directory publication remains unavailable as described above.
