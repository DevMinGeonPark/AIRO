# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** on this repository
(GitHub private vulnerability reporting). Include affected version/commit, reproduction steps and impact.

You can expect an initial response within 7 days.

## Scope

- Web app, API routes (`src/app/api/**`), MCP server (`/api/mcp`), Codex bridge (`/api/bridge`)
- Supabase migrations and RLS policies (`supabase/migrations/`)
- Community Edition docker compose setup
- Android client (`android/`)

## Supported versions

Only the latest release and `main` receive fixes.
