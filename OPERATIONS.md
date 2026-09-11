# 아이로 · AIRO — 운영·검증 절차

**어디로든, AI와 함께.** 로고와 색상 기준은 [BRAND.md](BRAND.md)를 참고하세요.

운영 기준 프로젝트는 `AIRO-app`입니다. 개인 여행도 로그인한 계정의 여행으로 저장합니다. `../AIRO`는 개인용 원본 확인과 기존 브라우저 즐겨찾기 내보내기에 사용합니다.

현재 구현: 계정별 여행·일정·대화, 직접 일정 편집, 장소 검색, AI 채팅, MCP, 개인 여행 가져오기, 예산·맛집·도로 경로·PDF 보존, 계정 즐겨찾기, 여행 전체 내보내기.

운영 주소는 `https://airo.dev-heptivision.com`입니다.

운영 환경에는 Supabase가 필수입니다. 설정이 없으면 로그인·여행 API를 닫습니다. 공용 파일 데모는 `next dev`에서만 동작합니다. 결제와 공개 공유는 아직 제공하지 않습니다.

## 개발

```sh
npm ci
npm run dev
```

기본 주소는 `http://localhost:3002`입니다. 인증 설정이 없을 때 개발용 `.demo-db.json`을 사용합니다. 이 파일과 `.private/`는 Git·배포 추적에서 제외합니다.

## 운영 연결

1. Supabase 프로젝트의 SQL Editor 또는 마이그레이션 도구에서 `supabase/migrations/0001_init.sql`, `0002_api_keys.sql`, `0003_unified_trips.sql`, `0004_profile_trigger_permissions.sql`을 순서대로 적용합니다. 기존 데이터베이스에는 아직 적용하지 않은 파일만 실행합니다. 테이블과 RLS를 실제 배포 프로젝트에서 확인해야 합니다.
2. `.env.local.example`을 참고해 배포 환경에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`을 설정합니다. `NEXT_PUBLIC_` 값은 빌드 때 반영되므로 변경 후 다시 빌드합니다. 비밀 키는 Git에 넣지 않습니다.
3. Supabase Auth의 Site URL은 `https://airo.dev-heptivision.com`, Redirect URL은 `https://airo.dev-heptivision.com/auth/callback`으로 설정합니다. `https://`를 생략하면 인증이 잘못된 주소로 돌아갑니다. 콜백에 쿼리를 붙이지 않고 로그인 후 이동 경로는 HttpOnly 쿠키에 보관합니다. Google 제공자에 OAuth Client ID/Secret을 등록하고 활성화하면 로그인 화면에서 바로 사용할 수 있습니다. 별도 공개 환경 플래그나 재빌드는 필요하지 않습니다. 자세한 값은 [AUTH_SETUP.md](AUTH_SETUP.md)를 참고하세요.
4. AI 채팅은 서버의 `OPENAI_API_KEY`를 사용합니다. 운영에서 키가 없으면 직접 일정 편집만 제공하며 가짜 AI 응답을 만들지 않습니다. MCP API 키 방식은 `SUPABASE_JWT_SECRET`과 프로젝트의 HS256 지원이 필요합니다. OAuth 방식은 Supabase OAuth Server와 아이로 승인 화면을 사용합니다. [MCP 설정 및 최종 검증 절차](MCP_SETUP.md)를 확인하세요.
5. `npm run build`, `npm start`로 단일 서비스를 실행합니다. 기존 운영 프로세스를 유지하며 검증할 때는 `NEXT_DIST_DIR=.next-unified npm run build`와 `NEXT_DIST_DIR=.next-unified npx next start -p 3103`을 사용합니다.

로그인 리디렉션과 쿠키 갱신은 [Supabase SSR 문서](https://supabase.com/docs/guides/auth/server-side/creating-a-client)를 기준으로 구성합니다.

## 개인 자료 이식

```sh
npm run export:personal
```

`.private/exports/`에 개인 여행과 기존 데모 여행별 JSON 파일을 만듭니다. 기존 파일은 덮어쓰지 않습니다. 새 시점의 파일이 필요하면 `EXPORT_DIR=.private/exports-새날짜 npm run export:personal`처럼 별도 경로를 지정합니다. 개인용의 원본 코드, 예산의 모든 계산 결과와 근거, 맛집·사진·경로, 상위 폴더 PDF를 보존합니다. 데모 API 키는 새 계정으로 복제하지 않으며 원본 백업에 보존합니다. 계정에서 새 키를 발급한 뒤 외부 연결을 변경해야 합니다.

1. 본인 계정으로 로그인합니다.
2. `/app/settings/import`에서 표시된 이메일을 확인하고 JSON 파일을 선택합니다.
3. 미리보기 후 ‘이 계정으로 가져오기’를 누릅니다. 저장은 로그인 세션의 사용자에게만 이루어집니다. 같은 원본은 계정당 한 번만 가져오며 기존 여행을 덮어쓰지 않습니다. 여행·일정·대화·자료·즐겨찾기는 한 DB 트랜잭션에서 저장됩니다.
4. 기존 개인용을 쓰던 브라우저에서 ‘즐겨찾기 내보내기’를 누릅니다. 통합 서비스의 해당 여행 → ‘여행 자료’ → ‘즐겨찾기 가져오기’에서 추가합니다. 다른 주소의 브라우저 저장소는 자동으로 읽을 수 없습니다.
5. 일정(0일차 포함), 예산, 맛집, PDF, 즐겨찾기를 확인하고 ‘전체 내보내기’로 계정 저장 결과를 내려받습니다.
6. 이 검증과 실제 로그인 확인이 끝난 뒤 기존 개인용 주소를 통합 서비스로 전환하고 개인용 프로세스를 종료합니다. 원본과 사전 백업은 유지합니다.

일정과 예산에 서로 다른 시점의 예약 기록이 있더라도 가져오기 과정에서 임의로 고치지 않습니다. 원본 자료는 그대로 보존하며, 이후 일정 변경은 계정 여행에 반영합니다. 예산은 가져온 시점의 계산 기록입니다.

## 검증

랜딩의 지구본에서 여행지를 고르면 해당 도시로 내려간 뒤 3일 일정, 지도, 대화와 하단 미리보기가 함께 바뀝니다. 교토와 추가 52개 도시, 총 477개 장소의 예시가 들어 있습니다. 새 여행지는 `src/lib/landing-destinations.json`에 추가하고 `python3 scripts/prepare-destination-maps.py`로 지도 스냅샷을 준비합니다. 지도 출처와 재생성 방법은 [assets/maps/README.md](assets/maps/README.md)에 정리되어 있습니다.

3016 포트의 랜딩 검증용 빌드와 실행:

```sh
NEXT_DIST_DIR=.next-airo-paths npm run build
NEXT_DIST_DIR=.next-airo-paths npx next start -H 0.0.0.0 -p 3016
LANDING_BASE_URL=http://<tailscale-ip>:3016 npm run test:atlas
LANDING_BASE_URL=http://<tailscale-ip>:3016 npm run test:destinations
LANDING_BASE_URL=http://<tailscale-ip>:3016 npm run test:landing
```

현재 공개 주소와 미리보기는 `.next-airo-paths`를 사용한다. 휴대폰 첫 화면은 한 화면에 들어오며, 지구본은 5초마다 보이는 도시를 무작위로 선택한다. 159개 일정은 실제 OSM 도로·보행로를 따르고 이동 점도 같은 경로 위에서 움직인다. `npm run test:roads`는 저장한 경로 원본을 검증하며, `node scripts/test-road-playback.mjs`는 실제 브라우저에서 이동 점이 도로를 따르는지 확인한다. 지도 준비 시에는 도시 지도 생성 후 `python3 scripts/prepare-landing-routes.py`, `python3 scripts/prepare-route-streets.py`를 순서대로 실행한다.

```sh
npm run lint
npm run test:archive
NEXT_DIST_DIR=.next-unified npm run build
```

`test:archive`는 먼저 내보내기 파일을 생성해야 합니다. 원본 필드, PDF 해시, 잘못된 좌표·일차·중복 ID, 로그인 리디렉션을 확인합니다.

`test:database`는 **비어 있는 전용 테스트 컨테이너** `airo-migration-test`와 DB `airo_test`가 필요합니다. PostgreSQL 17에서 마이그레이션, 계정 격리, 완전한 자료 일치, 중복 방지, 트랜잭션 취소, 동시 생성 한도, 대화 한도를 검증합니다. 운영 DB에 실행하지 않습니다.

`test:integration`은 위 테스트 DB와 로컬 PostgREST(`127.0.0.1:3105`)를 사용합니다. 테스트용 Auth 응답과 서명된 세션으로 실제 RLS·API·브라우저를 확인합니다. 실제 이메일·Google 로그인 검증을 대체하지 않습니다. 실행 예시는 `scripts/test-integration.mjs`, `scripts/test-auth-fixture.mjs`를 참고하세요. 화면 캡처는 `.private/verification/`에 저장됩니다.

기존 `test:smoke`는 별도 개발 서버와 별도 `DEMO_DB_PATH`에서 실행합니다. 여행 생성·채팅·검색·MCP·토큰 폐기 등을 확인합니다. 실제 데이터가 있는 개발 서버에 실행하지 마세요.

브랜드 파일 형식은 `airo-trip` / `airo-saved`, 새 API 키 접두사는 `airo_`다. 기존 DB에도 `0005_airo_archive_format.sql`을 적용한다. 이전 파일은 가져오기 시 변환하며 원본 여행 자료와 이미 발급한 키의 인증은 보존한다.


모바일 검증은 `npm run test:mobile`로 실행한다. Chrome·WebKit에서 320/360/390/430/768/844/1024px, 세로·가로 화면, 여행지 검색 창, 메뉴, 여행 목록·자료·예산·설정, 일정 편집·지도·채팅과 키보드 높이 변화를 확인한다. WebKit은 `npx playwright install webkit`으로 설치한다.

계정 화면 검증은 위의 전용 테스트 DB와 PostgREST를 준비하고 `node scripts/mobile-fixture.mjs`를 실행한다. 이 프로세스는 로컬 3104/3106만 사용하며 테스트 계정과 긴 제목의 여행을 만든다. `.private/exports/personal-trip.json`이 필요하다. 공개 화면만 확인할 때는 `MOBILE_AUTH=false MOBILE_BASE_URL=https://airo.dev-heptivision.com npm run test:mobile`을 사용한다. 실제 계정·메일 인증이나 운영 DB를 변경하지 않는다.
