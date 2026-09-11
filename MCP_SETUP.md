# AIRO MCP — 설정과 마지막 API 검증

2026-09-10: AIRO 운영 DB에 `0006`·`0007`·`0008`을 적용했다. Supabase OAuth Server, `/app/connect`, Dynamic Client Registration, `public.airo_mcp_token_hook`을 활성화하고 대시보드를 다시 열어 저장값을 확인했다. 현재 서명 키는 ECC P-256이며 기존 키와 Google 로그인 설정은 유지했다. 앱의 `MCP_OAUTH_ENABLED=true`를 설정했다.

API 키용 서버 서명은 미설정이므로 새 API 키를 발급하지 않으며 사용자는 OAuth 로그인 연결을 이용한다. 실제 외부 도구에서 사용자 로그인·여행 권한 승인을 거친 토큰 발급과 편집은 아직 별도 확인이 필요하다. 최종 배포 빌드는 `DEPLOYMENT.md`, 계정형 서비스 기능은 `COMMERCIAL_SERVICE.md`를 참고한다.

## 구현된 흐름

외부 AI → `/api/mcp` → 검증된 사용자·연결 권한 → 공통 여행 도구 → Supabase 소유자 RLS → 아이로 일정·지도 갱신.

- 공식 TypeScript SDK의 상태 없는 Streamable HTTP. 요청마다 독립 서버를 만들고 응답 뒤 종료한다.
- 12개 도구: `listTrips`, `getTrip`, `createTrip`, `updateTrip`, `deleteTrip`, `searchPlaces`, `addStop`, `moveStop`, `removeStop`, `reorderDay`, `getDayRoute`, `searchAlongRoute`.
- 여행 리소스 `airo://trips`, `airo://trips/{tripId}`, 프롬프트 `plan-trip`.
- `afterStopId` / `beforeStopId` / `position` 중 하나로 삽입. 생략하면 추가는 해당 일차의 끝, 수정은 기존 순서를 유지한다. 다른 일차의 기준 장소로 이동할 때 `day`를 생략하면 기준 장소의 일차를 사용한다.
- `createTrip`, `addStop`, `moveStop`, `removeStop`, `reorderDay`는 선택적 `requestId`를 받는다. 같은 계정에서 같은 ID·내용의 재시도는 저장된 결과를 반환하며, 내용이 달라지면 거절한다. 클라이언트는 작업마다 UUID를 만들고 재시도 때만 재사용해야 한다. `requestId` 없이 새로 보내면 추가·생성이 중복될 수 있다.
- 여행 행을 먼저 잠그고 장소와 순번을 한 트랜잭션에서 변경한다. 재정렬에 생략한 장소는 삭제하지 않고 기존 순서로 뒤에 남긴다.
- MCP 조회 권한과 편집 권한을 도구 및 DB에서 검사한다. 읽기 전용 연결로 Supabase에 직접 요청해도 쓰기가 차단된다.
- 장소 검색은 기존 실제 공급자를 사용한다. 경로 주변 검색은 도로 폴리라인의 세 지점에서 최대 20개씩 검색해 중복을 제거하고 경로까지의 근사 거리로 필터링한다. 모든 가게를 수집하는 검색이나 실제 우회 시간 계산은 아니다. 한 요청에 육상 구간 최대 20개. 항공 구간 주변 검색은 거절한다.
- 표시 중인 여행은 약 5초 간격 및 창 복귀 시 갱신한다. ETag가 같으면 본문을 생략한다. 편집·채팅 응답 중에는 자동 갱신을 멈추며 작성 중인 질문은 보존한다.

## 1. 데이터베이스 준비

실제 적용 전 사용할 Supabase 프로젝트와 기존 마이그레이션 이력을 확인한다. 새 프로젝트는 `0001`부터 순서대로, 기존 프로젝트가 `0005`까지 적용되어 있으면 아래 두 파일을 순서대로 적용한다.

1. `supabase/migrations/0006_mcp_itinerary.sql`
2. `supabase/migrations/0007_mcp_authorization.sql`

새 코드는 `create_trip_once`, `mutate_itinerary`, `resolve_mcp_key`, `consume_mcp_request` RPC를 사용하므로 **새 앱 빌드로 전환하기 전에 두 마이그레이션이 필요하다.** 초기 테이블을 다시 만들거나 운영 자료를 가져오는 작업은 필요 없다. 적용 전 운영 DB의 일반적인 백업/복구 절차를 따른다.

`mcp_settings.resource`의 초기값은 `https://airo.dev-heptivision.com/api/mcp`다. 다른 배포 주소라면 SQL Editor에서 실제 주소로 수정한다. 이 값은 `NEXT_PUBLIC_SITE_URL`에 `/api/mcp`를 붙인 값과 정확히 같아야 한다.

```sql
-- 다른 환경을 사용하는 경우에만 실제 주소로 변경
update public.mcp_settings
set resource = 'https://실제-아이로-주소/api/mcp'
where singleton;
```

기존 API 키는 현재 권한을 유지하며 만료일은 비어 있다. 새로 발급하는 키는 조회/편집과 30·90·365일 중 유효 기간을 선택한다. 새 마이그레이션은 기존 키를 폐기하지 않는다.

MCP 요청 한도는 계정당 1분에 120회다. 키와 OAuth 연결들이 같은 계정 한도를 공유한다. 초과하면 HTTP 429와 `Retry-After: 60`을 반환한다.

## 2. API 키 방식

필요한 서버 환경 값:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://프로젝트.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=프로젝트의_publishable_또는_anon_key
NEXT_PUBLIC_SITE_URL=https://실제-아이로-주소
SUPABASE_JWT_SECRET=해당_프로젝트의_legacy_JWT_secret
```

API 키의 해시를 검증한 뒤 해당 사용자와 키 ID를 포함한 짧은 `authenticated` JWT로 DB에 접근한다. `service_role`은 사용하지 않는다. 이 방식에는 프로젝트의 HS256 토큰 검증 지원이 필요하다. HS256 지원이 종료된 프로젝트는 아래 OAuth 방식을 사용한다.

앱 `/app/settings/keys`에서 키를 발급하고 `/docs/mcp`의 클라이언트별 설정을 적용한다. 원문 키는 서버에 저장하지 않는다. 개인 토큰을 프로젝트 설정 파일이나 Git에 넣지 않는다.

## 3. OAuth 로그인 방식

OAuth 인증 서버는 **기존 Supabase Auth**다. Supabase가 authorization code·PKCE·등록·만료·refresh token rotation을 처리하고, AIRO는 승인 UI와 여행 권한·토큰 대상 검사를 구현한다. 자체 OAuth 토큰 서버를 별도로 운영하지 않는다. [Supabase MCP 인증](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)

Supabase 대시보드에서 아래를 설정한다.

1. Authentication → URL Configuration의 Site URL을 `NEXT_PUBLIC_SITE_URL`과 맞춘다. 기존 아이로 로그인 callback 설정은 유지한다.
2. Authentication → OAuth Server를 활성화하고 **Authorization Path를 `/app/connect`**로 지정한다.
3. 사용할 외부 클라이언트를 사전 등록하거나 Dynamic Client Registration을 활성화한다. 리디렉션 URI는 클라이언트에 실제 표시된 주소를 사용한다.
4. `openid` 사용을 위해 비대칭 서명 키(ES256/RS256)를 구성한다. 기존 서명 키는 영향 확인 없이 제거하지 않는다.
5. Authentication → Hooks에서 **Custom Access Token Hook**으로 `public.airo_mcp_token_hook`을 연결한다. 기존 훅이 있으면 두 동작을 병합해야 한다. 새 훅으로 무조건 덮어쓰지 않는다.
6. 앱 서버에 `MCP_OAUTH_ENABLED=true`를 설정해 새 빌드를 준비한다.

Supabase가 제공하는 discovery와 승인 UI 구성 방식은 [OAuth Server 시작 안내](https://supabase.com/docs/guides/auth/oauth-server/getting-started)를 따른다. 훅은 기존 필수 claims를 보존하고 승인된 MCP 클라이언트에 대상 audience와 grant version을 붙인다. [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook), [OAuth 토큰과 RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)

AIRO가 제공하는 보호 리소스 메타데이터:

- `/.well-known/oauth-protected-resource/api/mcp`
- `/.well-known/oauth-protected-resource`
- 인증이 없으면 `WWW-Authenticate`에서 위 메타데이터를 안내한다.

메타데이터의 authorization server는 `https://프로젝트.supabase.co/auth/v1`이며, 인증 서버의 발견·토큰·등록 엔드포인트는 Supabase가 제공한다. MCP 클라이언트가 보내는 `resource`는 AIRO MCP URL이다. **발급 JWT에는 동일한 audience, `client_id`, `mcp_grant_version`이 필요하며 일반 로그인 JWT는 MCP에서 거절한다.** 다른 resource의 토큰을 훅이 AIRO 토큰으로 바꾸지 않는다.

Supabase 로그인 scope(`openid` 등)와 AIRO 여행 권한은 구분한다. 여행의 조회/편집은 `/app/connect`에서 사용자가 선택하고 `mcp_connections`에 저장한다. 임의의 `trips:read` scope를 Supabase OAuth URL에 덧붙이지 않는다. 권한은 `/app/settings/keys`에서 변경할 수 있다.

아이로에서 연결을 해제하면 DB의 현재 grant를 즉시 차단한 뒤 Supabase OAuth grant와 갱신 세션을 해제한다. Supabase 응답이 실패해도 아이로 접근은 차단하며, 화면에서 로그인 연결 해제를 재시도할 수 있다. Supabase 대시보드 등 **아이로 밖에서만** 해제한 경우 기존 access JWT의 즉시 무효화 여부는 제공자의 세션 정책 및 만료 시간에 영향을 받으므로 별도로 확인한다.

브라우저 클라이언트가 `Origin`을 보내는 경우 실제 origin만 `MCP_ALLOWED_ORIGINS`에 쉼표로 등록한다. 서버/네이티브 클라이언트는 일반적으로 Origin이 없다. 승인 페이지의 POST는 아이로의 canonical origin에서만 허용한다. 사이트 별칭으로 들어왔다면 canonical 주소에서 다시 연결한다.

## 4. 개발 중 완료한 확인

```sh
npm run test:mcp:local
node scripts/test-mcp-ui.mjs
npx tsc --noEmit
NEXT_DIST_DIR=.next-airo-mcp npm run build
```

`test:mcp:local`은 네트워크 fetch를 차단하고, 주입한 가정 응답·SDK 메모리 전송·PGlite의 메모리 PostgreSQL을 사용한다. 실제 Supabase 서버에 SQL을 적용하지 않는다. SQL 문법과 순서·중복·RLS·폐기·만료·요청 한도는 확인하지만 실제 복수 DB 연결의 경합이나 운영 PostgREST/Supabase Auth 호환성까지 증명하지는 않는다.

`test-mcp-ui.mjs`는 임시 개발 경로와 별도 Next 빌드를 만들고 실제 컴포넌트에 가정 데이터를 전달한다. `/api/*`는 브라우저에서 모두 가로채고 외부 네트워크도 차단한다. 테스트 후 임시 경로·서버를 제거한다. 운영 로그인·실제 API 검증과 구분한다. 결과는 `assets/validation/mcp/`에 남고 Git에서는 제외한다.

## 5. 사용자가 마지막에 실행할 실제 검증

처음에는 테스트 계정과 테스트 여행을 사용한다.

1. **로그인·키 발급:** 이메일 로그인 후 조회 전용 키와 편집 키를 각각 만든다. 발급·복사·목록·만료 표시를 확인한다.
2. **연결:** 사용하는 MCP 클라이언트에서 initialize → tools/list를 확인한다. 조회 전용에는 5개, 편집에는 12개 도구가 표시되어야 한다.
3. **계정 격리:** A 계정 키에서 B 계정의 여행 ID를 조회/수정하면 거절되어야 한다.
4. **여행 생성:** 같은 `requestId`로 `createTrip`을 두 번 보내도 여행이 하나만 만들어져야 한다. 무료 여행 개수 제한과 재시도 결과도 확인한다.
5. **핵심 여행 흐름:** 실제 장소 두 곳 A/B를 검색해 저장 → `searchAlongRoute`로 식당 선택 → `afterStopId=A`로 식당 추가 → 식당의 ID 뒤에 카페 추가. 일정은 **A → 식당 → 카페 → B**가 되어야 한다.
6. **중복·순서:** 식당 추가를 같은 `requestId`로 재시도한다. 하나만 남아야 한다. 다른 날로 옮기기, 일부 ID만 재정렬하기, 없는 장소/잘못된 좌표/중복 ID도 확인한다. 실패한 작업은 기존 순서를 바꾸지 않아야 한다.
7. **실제 지도:** Valhalla 경로와 장소 공급자의 응답을 확인한다. 실제 도로를 표시하고, 실패 시 오류가 보이며 직선으로 대체하지 않아야 한다. 평점·영업 정보는 공급자가 준 경우에만 표시한다.
8. **화면 반영:** 아이로 여행을 연 채 외부 MCP로 장소/제목을 변경한다. 약 5초 안에 변경이 반영되어야 한다. 장소 편집 중에는 입력이 유지되고, 닫은 뒤 새 일정이 표시되어야 한다. 전송하지 않은 채팅 문구도 유지되어야 한다.
9. **OAuth:** 웹/데스크톱 클라이언트에서 로그인 → 승인/취소 → 토큰 수신을 확인한다. 대상 audience·grant version이 있는 access token만 허용되어야 한다. 잘못된 PKCE verifier, 사용한 code 재사용, 등록하지 않은 redirect URI, 다른 resource, 만료 토큰을 거절하는지 확인한다.
10. **갱신·해제:** OAuth refresh 후 같은 여행에 접근되는지, 이전 refresh 재사용 정책이 적용되는지 확인한다. 아이로에서 조회 전용으로 내리면 수정이 막히고, 연결 해제/키 폐기 후에는 기존 자격증명으로 접근되지 않아야 한다.
11. **동시 요청:** 같은 여행에 여러 클라이언트가 동시에 삽입/이동했을 때 중복 순번이 생기지 않는지 확인한다. 같은 요청 ID로 두 요청을 동시에 보내도 하나만 저장되어야 한다.
12. **다른 실제 API:** 마지막으로 앱 AI 채팅, Google Places를 사용하는 경우 해당 키·할당량, 이메일 로그인과 예산/자료 보존을 확인한다. MCP 자체는 아이로 서버의 OpenAI 키 없이 사용할 수 있으며, 앱 내 AI 채팅만 OpenAI 키를 필요로 한다.

직접 HTTP로 확인할 때:

```sh
curl -sS "$AIRO_URL/api/mcp" \
  -H "Authorization: Bearer $AIRO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

사용자용 실제 설정 예시는 앱 `/docs/mcp`에 있다. 클라이언트별 기준 자료: [Claude Code](https://code.claude.com/docs/en/mcp), [Cursor](https://cursor.com/docs/mcp), [Codex](https://learn.chatgpt.com/docs/extend/mcp), [OpenAI OAuth 연결](https://developers.openai.com/plugins/build/auth).
