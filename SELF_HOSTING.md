# AIRO 셀프호스팅

AIRO는 직접 운영하는 소프트웨어입니다. 요금제·한도·결제가 없고, 운영자가 따로 있는 호스팅 서비스도 없습니다. 구성은 두 가지입니다.

| | **Community** (이 문서의 기본) | **Supabase** (여러 사용자) |
| --- | --- | --- |
| 계정 | 소유자 1명, 비밀번호 | Supabase Auth, 이메일·Google |
| 저장소 | 내 PostgreSQL + PostgREST (docker compose) | 내 Supabase 프로젝트 |
| AI | 내 OpenAI 키 또는 내 Codex | 같음 |
| MCP | API 키 | API 키 + OAuth |
| 설치 | 아래 5분 설치 | [아래 Supabase 구성](#여러-사용자로-운영-supabase) |

같은 코드, 같은 SQL입니다. `NEXT_PUBLIC_AIRO_EDITION=community`(도커 이미지 기본값)이면 Community, 없으면 Supabase 구성입니다.

## 5분 설치

필요한 것: Docker + docker compose v2.24 이상(`env_file`의 `required` 문법).

```sh
git clone https://github.com/DevMinGeonPark/AIRO.git && cd AIRO
cp community.env.example .env
# .env 열어서 세 값 채우기:
#   POSTGRES_PASSWORD   openssl rand -hex 24 (영숫자만)
#   AIRO_JWT_SECRET     openssl rand -hex 32
#   AIRO_OWNER_PASSWORD 로그인 비밀번호(16자 이상, 짧으면 앱이 시작하지 않음)
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
- `docker/db-init.sh`가 첫 기동에 역할(anon/authenticated/authenticator), `auth` 스키마 shim, 마이그레이션 전부, 소유자 계정을 만듭니다. 적용 이력은 `public.airo_migrations`.
- `service_role`은 어디에도 없습니다. 세션 없는 호출(API 키 조회, Codex 워커)은 `anon` 역할로 security definer RPC만 부릅니다.

## 업데이트

```sh
git pull
docker compose pull airo          # 소스 빌드라면: docker compose -f docker-compose.yml -f docker-compose.build.yml build airo
docker compose exec db /docker-entrypoint-initdb.d/10-airo.sh   # 새 마이그레이션만 적용
docker compose up -d
```

## AI 연결

- **내 Codex(구독)**: 로그인 후 `/app/settings/ai`에서 연결 요청을 복사해 내 컴퓨터의 Codex에 붙여넣습니다. 플러그인은 이 GitHub 저장소(`plugins/airo`)에서, 브리지 실행 파일은 GitHub Releases에서 받고, 연결 스킬이 `AIRO_ORIGIN=<AIRO_SITE_URL>`로 내 서버와 짝을 맺습니다. 기기 비밀은 내 PC에만 남고 서버는 SHA-256만 저장합니다. 구조는 [CODEX_CONNECTION.md](CODEX_CONNECTION.md).
- **내 OpenAI 키**: `.env`의 `OPENAI_API_KEY`. 채팅에서 "API로 사용"을 직접 선택한 요청만 호출합니다.
- **외부 AI 도구(Claude, Cursor, ChatGPT)**: `/app/settings/keys`에서 `airo_` API 키 발급 → 도구의 MCP 서버 URL에 `{AIRO_SITE_URL}/api/mcp`, Bearer에 키. 안내는 `/docs/mcp`.

## 백업

여행은 전부 PostgreSQL 볼륨 `airo-db`에 있습니다.

```sh
docker compose exec db pg_dump -U postgres airo > airo-$(date +%F).sql
```

앱 안에서도 여행별 '전체 내보내기'(`airo-trip` JSON, PDF·예산·즐겨찾기 포함)를 받을 수 있고, 다른 AIRO 서버의 `/app/settings/import`로 그대로 가져갑니다.

## 검증

```sh
COMMUNITY_BASE_URL=http://localhost:3002 AIRO_OWNER_PASSWORD=... npm run test:community
```

비밀번호 로그인·제한 없는 여행 생성·일정 추가·MCP API 키 호출·워커 인증 거부·로그아웃을 확인합니다.

## 알아둘 것

- 비밀번호 시도는 서버 전체로 15분에 5회(소유자 1명이라 IP 구분 없음). 프로세스 재시작 시 초기화. 인터넷에 공개하면 누군가 틀린 비밀번호를 계속 보내 소유자 로그인을 막을 수 있으니, Tailscale·사설망·접근 제어가 있는 프록시 뒤에 두세요.
- 앱 포트는 기본 `127.0.0.1`에만 열립니다(`AIRO_BIND`). LAN에 열려면 `AIRO_BIND=0.0.0.0` — 평문 HTTP라 같은 망에서 비밀번호·세션을 엿볼 수 있으니 TLS 프록시를 권장합니다.
- `OPENAI_API_KEY`·`GOOGLE_MAPS_API_KEY`는 `.env` 파일에서만 읽습니다. 셸에 export한 값은 컨테이너로 넘어가지 않습니다(모르는 과금 방지). Google Places는 사용자당 시간당 `GOOGLE_PLACES_HOURLY_LIMIT`(기본 60)회를 넘으면 OSM으로 대체합니다.
- 세션 쿠키는 30일 JWT이며 사용 중이면 자동 연장됩니다. 로그아웃은 브라우저 쿠키만 지웁니다. 유출이 의심되면 `AIRO_OWNER_PASSWORD`를 바꾸고 재시작하세요 — 기존 세션이 전부 무효화됩니다.
- Codex 플러그인과 브리지 실행 파일은 GitHub(저장소·Releases)에서 받습니다. 내 서버는 `/docs/codex/install` 안내문에 자기 주소만 넣어 주면 되므로 이미지에 다운로드 파일이 없습니다. `AIRO_ORIGIN`은 https 주소이거나 사설망(localhost·10.x·192.168.x·100.64~127.x·172.16~31.x·`.local`)의 http 주소만 받습니다.
- HTTPS는 앞단(Tailscale Serve, Cloudflare Tunnel, Caddy)에 맡깁니다. 앱은 `AIRO_SITE_URL`이 `https:`면 쿠키에 `Secure`를 붙입니다.

## 여러 사용자로 운영 (Supabase)

가족·친구와 함께 쓰거나 Google 로그인이 필요하면 내 Supabase 프로젝트에 붙입니다. 가입을 막으려면 Supabase Auth에서 신규 가입(Allow new users to sign up)을 끄고 사용자를 직접 초대하세요.

1. **DB**: SQL Editor에서 `supabase/migrations/`의 파일을 번호 순서대로 모두 적용합니다. 업데이트 때는 아직 적용하지 않은 파일만 실행합니다.
2. **환경 값** (`.env.local.example` 참고, `NEXT_PUBLIC_*`는 빌드 때 반영되므로 바꾸면 다시 빌드):
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable 또는 anon key>
   NEXT_PUBLIC_SITE_URL=https://<내 AIRO 주소>
   SUPABASE_JWT_SECRET=<legacy JWT secret>   # MCP API 키 방식에 필요(HS256)
   ```
3. **Auth URL**: Authentication → URL Configuration에서 Site URL = `NEXT_PUBLIC_SITE_URL`, Redirect URLs = `https://<내 AIRO 주소>/auth/callback`(Android 앱도 쓰면 `com.heptivision.airo://auth/callback?**` 추가). `https://`를 빼먹으면 로그인이 엉뚱한 주소로 돌아갑니다.
4. **Google 로그인(선택)**: Google Cloud에서 웹 OAuth 클라이언트를 만들고 Authorized JavaScript origins = 내 AIRO 주소, Authorized redirect URIs = `https://<project>.supabase.co/auth/v1/callback`. Client ID/Secret은 Supabase → Sign In / Providers → Google에만 넣습니다. Google에 넣는 콜백은 Supabase 쪽, Supabase에 넣는 콜백은 AIRO 쪽입니다.
5. **실행**: `npm ci && npm run build && npm start` (포트 3002).
6. **MCP OAuth(선택)**: 아래 SQL로 리소스 주소를 내 서버로 바꾼 뒤 [MCP_SETUP.md](MCP_SETUP.md)의 OAuth 절차(OAuth Server, `/app/connect`, `public.airo_mcp_token_hook`, `MCP_OAUTH_ENABLED=true`)를 따릅니다.
   ```sql
   update public.mcp_settings set resource = 'https://<내 AIRO 주소>/api/mcp' where singleton;
   ```

로그인은 `NEXT_PUBLIC_SITE_URL` 도메인에서만 시작합니다. 다른 별칭으로 열면 그 주소로 옮겨 PKCE 쿠키와 콜백 도메인을 맞춥니다.
