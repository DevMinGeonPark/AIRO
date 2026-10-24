# 로그인 설정과 확인

## Android 추가 설정 — 2026-09-18

네이티브 PKCE 로그인 코드는 추가되었고 격리된 Auth/DB 및 Android 에뮬레이터에서 이메일 callback·화면 재생성·계정 여행 CRUD·로그아웃을 검사했다. 실제 Supabase/Google 계정의 로그인 완료를 뜻하지 않는다.

- 웹의 기존 callback을 유지하고 `com.heptivision.airo://auth/callback?**`를 운영 Redirect URLs에 저장했다. 실제 Google 시작→취소 응답에서 앱 callback과 `native_state` 유지가 확인됐다. 오타인 `https://airo.dev-heptivision.comv` 항목은 제거했다.
- 가입 확인과 Magic link 기본 템플릿의 링크가 모두 `{{ .ConfirmationURL }}`임을 대시보드에서 확인했다.
- 네이티브 서버 코드는 2026-09-18 운영에 배포했다. 공개 `/auth/mobile/config`는 200·no-store, 미인증 여행 API는 401이다. Cloud는 Supabase PKCE를 사용하므로 Community 전용 `/auth/mobile/session`의 404는 정상이다.
- Aside의 운영 프로젝트 관리 세션에서 설정을 적용했다. `npm run verify:mobile-auth`의 7개 항목이 모두 통과했다. Google·이메일 제공자와 신규 가입 활성화, 앱/웹 복귀 주소, 미등록 주소 차단, 미인증 API를 검사한다. 결과는 `.backups/android-completion/mobile-auth-preflight.json`이다.
- 일반 사용자 이메일 발송용 custom SMTP를 저장하고 재조회했다. 로컬 `~/.cloudflared/cert.pem`의 관리 인증으로 메일 DNS 3개를 등록했고, Resend에서 `auth.airo.dev-heptivision.com` 인증을 완료했다. 해당 도메인으로 제한한 Sending access 키를 사용한다. SMTP TLS 인증은 성공(235)했으며 실제 메일은 보내지 않았다. Resend Free(월 3,000통·일 100통), 초과 과금 꺼짐을 확인했다.
- 실제 사용자 로그인·동의는 사용자 기기에서 확인한다. 테스트 이메일을 운영 Auth에 보내거나 다른 계정의 동의를 대신하지 않는다.

### 이메일 발송 설정

- 발신자: `AIRO <login@auth.airo.dev-heptivision.com>`.
- SMTP: `smtp.resend.com:465`, 사용자 `resend`. 비밀번호는 Supabase에 암호화 저장하며 Git·문서에 넣지 않는다.
- 사용자별 재발송 간격: 60초. custom SMTP 활성화 시 Supabase 기본 발송 제한은 시간당 30통이다.
- DNS: `resend._domainkey.auth.airo` TXT, `rsend.auth.airo`와 `send.auth.airo` CNAME. CNAME은 DNS only이며 기존 앱 터널은 변경하지 않았다.
- 근거: `.backups/android-completion/mail-dns-verification.json`, `smtp-auth-check.json`, `smtp-settings-readback.json`. SMTP 검사에는 `MAIL FROM`·수신자·메일 본문 전송이 없다.
- 실제 Google·이메일 로그인과 기기 복귀는 [Android E2E 점검](docs/ops/ANDROID_E2E.md)에 따라 확인한다. 설정 완료와 실제 이메일 수신 성공은 별도로 기록한다.

아래는 기존 웹 로그인 운영 기록이다.

2026-09-10 운영 설정과 확인 결과:

- Supabase Site URL에 `https://`가 빠져 `requested path is invalid` 오류가 발생했다. Aside를 통해 대시보드에서 `https://airo.dev-heptivision.com`으로 수정·저장했다. 잘못된 리디렉션 요청도 이제 공식 사이트로 복귀하는 것을 실제 인증 서버에서 확인했다.
- 기존 Redirect URLs는 보존했고 `https://airo.dev-heptivision.com/auth/callback`이 허용됨을 확인했다.
- Google Cloud 전용 프로젝트 `airo-heptivision`과 AIRO 웹 OAuth 클라이언트를 만들고, 아래 원본·콜백과 기본 로그인 범위를 등록했다. 결제 계정은 연결하지 않았다.
- AIRO용 OAuth 자격 증명을 Supabase Google 제공자에 등록하고 활성화했다. 비밀값은 문서·Git에 저장하지 않는다.
- 운영 로그인 페이지에서 Google 버튼 활성화와 `accounts.google.com` 이동을 Chrome 1440·390px에서 확인했다. 실제 요청 범위는 `email profile`이며 실제 사용자 로그인·동의와 최종 세션 복귀는 사용자가 확인할 단계다.
- Google 게시 상태는 Testing이다. Production 버튼의 검증 메시지에서 요구하는 앱 이름·지원 이메일·홈페이지는 저장되어 있고, 남은 필수 항목은 실제 공개 개인정보처리방침 URL이다. 약관 URL은 해당 필수 조건에 포함되지 않는다. 현재 기본 신원 범위에는 아래 Google 문서의 Testing 예외가 적용되며, Production/브랜드 검증을 완료했다고 표시하지 않는다.
- Supabase MCP 재인증과 프로젝트 조회는 정상이다. 다만 MCP OAuth가 로그인 설정 권한을 지원하지 않아 설정 조회는 403, `auth:read`·`auth:write` 등록은 400으로 거절된다. 설정 변경은 재인증을 반복하지 않고 대시보드에서 진행했다.

## Supabase URL 설정

[Authentication → URL Configuration](https://supabase.com/dashboard/project/colczqltsfzqgzsnnqvc/auth/url-configuration)

- Site URL: `https://airo.dev-heptivision.com`
- Redirect URLs: `https://airo.dev-heptivision.com/auth/callback`, `com.heptivision.airo://auth/callback?**`

주소 앞의 `https://`를 포함한다. 새 코드의 Google·이메일 로그인은 위 콜백을 쿼리 없이 사용한다. 원래 열려고 한 여행/MCP 승인 화면은 30분 유효한 HttpOnly 쿠키에 보관하고, 성공·실패 후에도 안전한 `/app` 내부 경로로 복귀한다. 예전의 쿼리형 링크보다 새 로그인 요청으로 받은 링크를 사용한다.

로그인은 공식 도메인에서 시작한다. 테일스케일·별칭에서 로그인 화면을 열면 공식 주소로 이동하므로 PKCE 검증 쿠키와 콜백의 도메인이 일치한다.

## Google 제공자 활성화

1. [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients)에서 AIRO용 OAuth 클라이언트를 만들거나 기존 웹 애플리케이션 클라이언트를 연다.
2. Authorized JavaScript origins: `https://airo.dev-heptivision.com`
3. Authorized redirect URIs: `https://colczqltsfzqgzsnnqvc.supabase.co/auth/v1/callback`
4. [Supabase → Sign In / Providers → Google](https://supabase.com/dashboard/project/colczqltsfzqgzsnnqvc/auth/providers)에 해당 Client ID와 Client Secret을 등록하고 Enable을 켠다. 비밀값은 Supabase에만 저장하며 Git·채팅에 넣지 않는다.
5. Google의 게시 상태와 요청 범위를 확인한다. 이름·이메일·프로필만 요청하는 Google 로그인은 Testing 상태의 테스트 사용자 제한과 7일 만료에 대한 예외가 있다. 다른 범위를 추가하면 이 예외가 적용되지 않으므로 게시·검증 요건을 다시 확인한다. [Google 앱 대상 관리 문서](https://support.google.com/cloud/answer/15549945?hl=en)

Google에 등록하는 URI는 Supabase의 `/auth/v1/callback`이다. Supabase에 등록하는 URI는 아이로의 `/auth/callback`이다. 서로 바꾸지 않는다. [Supabase Google 로그인 문서](https://supabase.com/docs/guides/auth/social-login/auth-google), [리디렉션 주소 문서](https://supabase.com/docs/guides/auth/redirect-urls)

## 확인

- 제공자 활성화 상태는 로그인 페이지를 열 때 읽는다. Google 비활성화 상태를 연결 완료로 표시하지 않는다.
- Google 계정 선택 → 동의 → 아이로 `/auth/callback` → 원래 여행 또는 MCP 연결 화면.
- 로그인 취소·만료·네트워크 오류에서도 재시도 화면과 원래 이동 경로를 유지한다.
- 이메일 발송과 실제 Google 계정 로그인은 본인 계정으로 마지막에 확인한다. 자동 검증에서는 이메일을 발송하지 않고 가정 응답을 사용한다.

## 이전 웹 로그인 배포 기록 — 2026-09-10

로그인 수정은 당시 운영 기준 `794fe2b` 위에 인증 파일만 적용한 `.private/releases/login-20260910`에서 빌드했다. 당시 운영 서비스 `com.heptivision.airo-app`은 이 릴리스의 `.next-login-final`을 사용했다. 이전 설정은 `.private/backups/login-20260910/airo-app.plist`에 보관했다. 새 MCP 데이터베이스 마이그레이션을 요구하는 여행 API는 이 로그인 배포에 포함하지 않았다. 기존 미러 3016·3402도 같은 로그인 릴리스로 교체했다. 현재 운영 배포는 [배포 기록](docs/ops/DEPLOYMENT.md)을 따른다.

브라우저 가정 응답 검증: Chrome 1440·390px, WebKit 320px에서 Google·이메일 PKCE 코드 교환, 원래 경로 복귀, HttpOnly 쿠키 소비, 만료 후 재시도, 제공자 활성화 즉시 반영, 외부 경로 차단, CSRF 차단을 확인했다. 실제 메일 발송과 Google 계정 인증은 실행하지 않았다. 결과는 `assets/validation/auth-login/`에 있다.

실제 Google 제공자 활성화 후 검증은 `assets/validation/auth-login/google-live-checks.json`과 `google-live-1440.png`·`google-live-390.png`에 있다. 두 화면 모두 가로 넘침과 페이지 오류 없이 Google 로그인 화면으로 연결되며, 허용되지 않은 복귀 주소의 폴백도 공식 사이트로 수정되었다.

재실행: `npm run test:auth`. 별도 빌드와 로컬 가짜 인증 서버(3431·3432)를 만들며 운영 DB·메일·Google 계정에 접근하지 않는다.
