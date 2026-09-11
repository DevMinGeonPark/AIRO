# AIRO Community Edition — 내 서버에서 돌리기

호스팅 버전과 같은 코드입니다. 차이는 환경변수 하나(`NEXT_PUBLIC_AIRO_EDITION=community`)로 갈립니다.

| | Cloud (airo.dev-heptivision.com) | Community (이 문서) |
| --- | --- | --- |
| 계정 | Supabase Auth, 이메일·Google | 소유자 1명, 비밀번호 |
| 저장소 | Supabase | 내 PostgreSQL + PostgREST (docker compose) |
| AI | 서버 키 또는 내 Codex | 내 OpenAI 키 또는 내 Codex. 서버 키 없음 |
| MCP | API 키 + OAuth | API 키 |
| 한도·결제 | 무료 3개, 결제 예정 | 없음 |
| 라이선스 | `src/ee/` 상용 | AGPL-3.0 (`src/ee/`는 비활성) |

## 5분 설치

필요한 것: Docker + docker compose v2.

```sh
git clone https://github.com/DevMinGeonPark/AIRO.git && cd AIRO
cp community.env.example .env
# .env 열어서 세 값 채우기:
#   POSTGRES_PASSWORD   openssl rand -hex 24 (영숫자만)
#   AIRO_JWT_SECRET     openssl rand -hex 32
#   AIRO_OWNER_PASSWORD 로그인 비밀번호
docker compose up -d
```

http://localhost:3002 → 비밀번호로 로그인. 끝.

앱 이미지는 `ghcr.io/devmingeonpark/airo:latest`(amd64·arm64, `v*` 태그마다 GitHub Actions가 빌드)를 받습니다. 소스에서 직접 빌드하려면 3~5분 걸리는 빌드를 한 번 합니다.

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Tailscale이나 터널 뒤에서 열려면 `.env`의 `AIRO_SITE_URL`을 실제 주소로 바꾸고 `docker compose up -d`로 재시작합니다(재빌드 불필요). MCP 문서와 로그인 복귀 경로가 그 주소를 씁니다.

## 동작 구조

```
브라우저 ──쿠키(HS256 JWT, sub=owner)──▶ airo (Next.js)
                                          │ Authorization: Bearer <같은 JWT>
                                          ▼
                                       postgrest ──role authenticated──▶ postgres (RLS 그대로)
```

- 앱이 `AIRO_JWT_SECRET`으로 JWT를 서명하고 PostgREST가 같은 비밀로 검증합니다. Supabase Auth는 없지만 `auth.uid()`·RLS·RPC(`create_trip_once`, `ai_bridge`, `api_key_owner`)는 호스팅 버전과 동일한 SQL(`supabase/migrations/`)이 그대로 돕니다.
- `docker/db-init.sh`가 첫 기동에 역할(anon/authenticated/authenticator), `auth` 스키마 shim, 마이그레이션 전부, 소유자 계정, `pro` 구독 행(3개 한도 해제)을 만듭니다. 적용 이력은 `public.airo_migrations`.
- `service_role`은 어디에도 없습니다. 세션 없는 호출(API 키 조회, Codex 워커)은 `anon` 역할로 security definer RPC만 부릅니다.

## 업데이트

```sh
git pull
docker compose pull airo          # 소스 빌드라면: docker compose -f docker-compose.yml -f docker-compose.build.yml build airo
docker compose exec db /docker-entrypoint-initdb.d/10-airo.sh   # 새 마이그레이션만 적용
docker compose up -d
```

## AI 연결

- **내 Codex(구독)**: 로그인 후 `/app/settings/ai`에서 연결 요청을 복사해 내 컴퓨터의 Codex에 붙여넣습니다. 플러그인 자체는 클라우드 주소(`airo.dev-heptivision.com/plugins/airo.git`)에서 받고, 연결 스킬이 `AIRO_ORIGIN=<AIRO_SITE_URL>`로 내 서버와 짝을 맺습니다(플러그인 0.2.1+). 기기 비밀은 내 PC에만 남고 서버는 SHA-256만 저장합니다. 구조는 [CODEX_CONNECTION.md](CODEX_CONNECTION.md).
- **내 OpenAI 키**: `.env`의 `OPENAI_API_KEY`. 채팅에서 "API로 사용"을 직접 선택한 요청만 호출합니다.
- **외부 AI 도구(Claude, Cursor, ChatGPT)**: `/app/settings/keys`에서 `airo_` API 키 발급 → 도구의 MCP 서버 URL에 `{AIRO_SITE_URL}/api/mcp`, Bearer에 키. 안내는 `/docs/mcp`.

## 백업

여행은 전부 PostgreSQL 볼륨 `airo-db`에 있습니다.

```sh
docker compose exec db pg_dump -U postgres airo > airo-$(date +%F).sql
```

앱 안에서도 여행별 '전체 내보내기'(`airo-trip` JSON, PDF·예산·즐겨찾기 포함)를 받을 수 있고, 다른 AIRO(호스팅 포함)의 `/app/settings/import`로 그대로 가져갑니다.

## 검증

```sh
COMMUNITY_BASE_URL=http://localhost:3002 AIRO_OWNER_PASSWORD=... npm run test:community
```

비밀번호 로그인·제한 없는 여행 생성·일정 추가·MCP API 키 호출·워커 인증 거부·로그아웃을 확인합니다.

## 알아둘 것

- 비밀번호 시도는 서버 전체로 15분에 5회(소유자 1명이라 IP 구분 없음). 프로세스 재시작 시 초기화.
- 세션 쿠키는 30일 JWT이며 사용 중이면 자동 연장됩니다. 로그아웃은 브라우저 쿠키만 지웁니다. 유출이 의심되면 `AIRO_OWNER_PASSWORD`를 바꾸고 재시작하세요 — 기존 세션이 전부 무효화됩니다.
- Codex 플러그인과 브리지 실행 파일은 클라우드가 배포합니다. 내 서버는 `/docs/codex/install` 안내문에 자기 주소만 넣어 주면 되므로 이미지에 다운로드 파일이 없습니다. `AIRO_ORIGIN`은 https 주소이거나 사설망(localhost·10.x·192.168.x·100.64~127.x·172.16~31.x·`.local`)의 http 주소만 받습니다.
- HTTPS는 앞단(Tailscale Serve, Cloudflare Tunnel, Caddy)에 맡깁니다. 앱은 `AIRO_SITE_URL`이 `https:`면 쿠키에 `Secure`를 붙입니다.
