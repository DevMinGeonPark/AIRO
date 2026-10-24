# Android 앱 완성 기록

현재 배포: **0.3.8 / code 11**. [현재 위치 버튼 검증](CURRENT_LOCATION.md)을 우선 참고한다. [선택형 일정·경로·MCP](STOP_CHOICES.md)도 유지한다. [즉시 체크·시간/GPS·완료 경로 제외](ANDROID_PROGRESS_RESPONSE.md)도 유지한다. 아래 이전 버전 기록은 유지한다.

**이전 0.3.2 / versionCode 5 기록 (2026-09-18).** 최신 웹 지도·일정·완료 체크·Todo·이미지 자료를 네이티브로 반영했다. [0.3.2 구현과 검증](ANDROID_WEB_PARITY.md), [앱 업데이트](ANDROID_UPDATES.md), [실제 계정 E2E](ANDROID_E2E.md)를 따른다.

공개 Cloud APK: https://airo.dev-heptivision.com/downloads/airo-android-cloud-0.3.2.apk

아래는 **0.2.0 당시의 완료 기록**이다. 인증·SMTP 설정 이력은 유지하며, 최신 기능의 완료 여부는 위 0.3.2 기록을 기준으로 한다.

## 0.2.0 기록

갱신: **2026-09-18**. 버전 **0.2.0 / versionCode 2**, 브랜드 **AIRO**.

사용자 지시 **“앱 개발 완료까지 진행해”**에 따라 이전 인계의 구현 중단·단위별 재승인·당일 시간 제한을 대체했다. 별도 과금 API·유료 크레딧은 승인되지 않았으며 사용하지 않았다. 테스트는 독립된 가짜 계정과 임시 DB로 진행했다.

**0.2.0의 기능 구현·로컬 검증·설치 파일·운영 서버 배포·앱 복귀 주소·이메일 DNS 및 SMTP 설정을 완료했다. 운영 인증 사전 검사 7개, DNS 검사 6개와 SMTP TLS 인증이 통과했다. 현재 버전의 실제 계정·기기 E2E가 남았다. 이후 사용자가 지정한 최신 웹 UI/UX와 자료 활용 흐름에는 추가 구현이 필요하며, [최신 AIRO 기준 점검](ANDROID_UIUX_ALIGNMENT_2026-09-18.md)에 차이를 기록했다. 정식 스토어 출시는 별도다.**

## 구현 결과

- [x] 기존 로마 사진·제비 로고를 사용하는 시작 화면, 로그인 전 예시 여행 체험과 출처 안내. 로그인 계정은 내 여행으로 직행.
- [x] 데모 실제 지도 표시, Cloud CARTO 지도, 날짜·번호 핀·장소 선택, 지도 길게 눌러 추가, 편집·삭제·순서 변경, 실제 도로 경로. 실패 구간을 직선으로 만들지 않음.
- [x] Cloud Google/이메일 PKCE 코드, 세션 암호화·갱신 경합·로그아웃·취소/만료·콜백 복귀 처리. Community 서버 선택과 비밀번호 로그인.
- [x] 여행 생성/조회/수정/삭제·검색·필터, 예산 지출/환율/예비비, 즐겨찾기·보관 장소·예약 PDF, JSON 가져오기/내보내기.
- [x] Codex 구독 기기 상태·대화·중지·기기 해제·대기 작업 복구. 유실 응답은 같은 요청 ID로 재시도. API 계정은 작업 불가.
- [x] 모바일 장소 검색과 모든 구독 bridge 도구는 OSM만 사용. 네이티브 작업을 웹 탭에서 재개해도 Google Places fallback을 사용하지 않음.
- [x] 입력 유지·예산 revision 충돌 처리·오래된 조회 취소·저장 실패 시 마지막 확정 데이터 유지.
- [x] PDF 원본 SHA-256 검증, 파일 크기 제한, 사용자별 Bearer/RLS 격리, 쿠키와 토큰 충돌·CSRF 방어.
- [x] 설치 가능한 Demo/Cloud debug APK, R8 최적화 unsigned release APK와 Cloud AAB, README·출처·검사 문서.

데모에는 자체 계정·AI·온라인 장소/경로 호출이 없다. 데모 여행 편집은 기기에만 저장되며 실시간 도로 조회는 계정 여행의 기능이다.

## 주요 수정과 확인 근거

### 지도

기존 로마 GeoJSON의 **4점 미만 polygon 166개**가 Native GeoJSON 전체 source를 거부하게 만들었다. 로고·핀은 뜨지만 도로가 전혀 안 나오는 상태를 재현했다. `android/scripts/prepare-map-assets.py`로 퇴화 polygon만 제거해 3,151개 feature를 번들로 생성했다. 유효한 도로 좌표와 웹 원본은 보존했다.

지도 lifecycle·크기 확정 후 camera fit·새 장소 반영·오류/재시도 상태도 처리했다. 에뮬레이터 화면에서 도로 픽셀과 번호 핀을 검사했다. 별도의 Cloud 지도 검사로 공개 CARTO 타일의 실제 렌더도 확인했다. 로마 판테온→카페 구간은 기존 서버의 Valhalla 경로 함수로 48개 좌표, 453m의 실제 도로 응답을 확인했다.

### 인증·데이터

- 요청 busy 중 들어온 callback을 큐에 넣어 유실을 막고, PKCE verifier/state는 암호화 저장해 재생성 이후에도 사용한다.
- 잘못된 Bearer는 유효한 웹 쿠키로 fallback하지 않는다. 원래 사용자 JWT를 DB에 전달하며 service-role 우회가 없다.
- Community 로그인은 기존 비밀번호 검사·제한·JWT 서명기를 재사용한다. 추가 세그먼트가 붙은 JWT는 거부한다.
- 저장 직후의 낡은 조회와 취소된 요청의 상태 덮어쓰기를 막았다. 예산 충돌 시 최신 자료를 읽기 전 재저장을 차단하고 작성 내용을 남긴다.
- 가져오기/내보내기에서 PDF 원본 바이트·해시·source 자료와 기존 메시지 시각을 유지한다.

## 실행한 검사

검증 환경: macOS arm64, JDK 21, Android SDK 36, Android 16/API 36 전용 에뮬레이터. 기본 약 411dp 및 **320dp(720×1280, density 360)**.

| 검사 | 결과 | 증거 |
| --- | --- | --- |
| Kotlin 단위 테스트 | 21건 통과 | `android/app/build/test-results/testDemoDebugUnitTest/` |
| Demo 화면·지도 검사 | 5건 통과, 320dp | `.backups/android-completion/final-validation.log` |
| Cloud 이메일 PKCE 복귀→생성/수정→재생성→삭제/로그아웃 | 통과, 가짜 Auth + 실제 임시 DB | `native-cloud-journey.log` |
| Community 비밀번호 로그인→동일 여행 흐름 | 통과 | `native-community-journey.log` |
| Cloud 온라인 지도 | 도로·핀 픽셀 검사 통과 | `online-map-test.log` |
| Android 파일 선택기 | 실제 저장→파일 선택→가져오기→여행 열기 통과 | `document-picker-retest.log`, `final-validation.log` |
| R8 최적화 앱 실행 | 시작·지도·여행 저장·프로세스 종료 후 복구 통과 | `release-runtime-results.json`와 `release-*-320-final.png` |
| Android Lint | 양쪽 오류 0건, 경고 각 26건 | `android/app/build/reports/lint-results-*Debug.xml` |
| Demo/Cloud debug·release APK, Cloud AAB | 빌드 통과 | `delivery-build.log` |
| Next.js TypeScript·변경 파일 ESLint·diff 검사 | 통과 | 세션 실행 기록 |
| Next.js 프로덕션 빌드 | 루트 및 독립 배포본 통과 | `next-build.log`, `staged-server-build.log` |
| 모바일 서버 통합 | 9개 SQL migration·RLS·CRUD·예산 충돌·원본 PDF·파일·구독 bridge·Community 통과 | `mobile-api-final.log`, `mobile-api-results.json` |
| Codex 기존 회귀 검사 | DB 격리·중복/도구 배타·해제·프로토콜 통과 | `codex-regression.log` |
| 배포본 브라우저 | Chrome 390/1440, WebKit 320의 12개 페이지 통과 | `staged-server-checks.json` |
| 패키지 | 개발 서명·ZIP 16KB 정렬·64비트 ELF LOAD 16KB 정렬 확인 | `apk-verification.txt`, `native-elf-alignment.json` |
| 운영 공개 API·웹 | 앱 로그인 설정 200, 미인증 모바일 API 401, 기존 웹 200 | `production-api-checks.json` |
| 운영 APK 다운로드 | Demo/Cloud 전체 다운로드 크기·SHA-256 일치 | `production-package-checks.json` |
| 운영 인증 설정 | Google·이메일 활성화, 앱 callback/state·웹 callback 유지, 미등록 주소 차단 등 7개 통과 | `mobile-auth-preflight.json` |
| 이메일 DNS·SMTP 설정 | DNS 6개 검사, Resend 도메인 인증, TLS SMTP 인증 235, Supabase 저장·재조회 | `mail-dns-verification.json`, `smtp-auth-check.json`, `smtp-settings-readback.json` |

표에서 경로를 생략한 증거 파일은 `.backups/android-completion/` 아래에 있다. 테스트의 첫 실패와 재검사 기록도 보존했다. 초기 파일 선택기 자동화의 뒤로 가기가 저장 창을 닫던 문제를 수정했고, 실제 저장·가져오기까지 다시 통과했다. 최종 시각 검토에서 선택 칩의 기본 보라색을 기존 AIRO 블루로 맞췄다.

단위 테스트의 인증과 AI 검사는 로컬 MockWebServer를 사용한다. 실제 모델 호출·실제 이메일 발송·운영 사용자 자료 변경은 없다. 16KB 정렬 검사는 실제 16KB 페이지 기기의 실행 검사를 대신하지 않는다. TalkBack 전체 탐색과 실제 사용자 휴대폰 확인은 별도다.

Lint 26건은 의존성 최신 버전 안내·KTX 권고·필요한 동기 SharedPreferences 저장·리소스 qualifier 권고 등이다. 오류를 숨기는 baseline은 추가하지 않았다. MapLibre 호환용 메모리 callback의 deprecated 경고가 남는다.

## 설치 파일과 재현

- Demo: `public/downloads/airo-android-demo-0.2.0.apk`
- Cloud/Community: `public/downloads/airo-android-cloud-0.2.0.apk`
- 정확한 크기·SHA-256: `public/downloads/airo-android-0.2.0.json`
- 최적화 APK: `android/app/build/outputs/apk/{demo,cloud}/release/*-unsigned.apk`
- 최적화 AAB: `android/app/build/outputs/bundle/cloudRelease/app-cloud-release.aab`

공유용 APK는 **Android 개발 인증서로 서명한 검증용 파일**이다. 정식 배포는 소유자의 릴리스 키로 서명해야 한다. 기존에 보고된 설치 보안 경고의 원인은 미확인이고 해결됐다고 설명하지 않는다. 사용하지 않는 위치 권한은 제거했으며 위치·SMS·접근성 권한을 새로 요구하지 않는다.

설치·구조·검사 명령은 [Android README](../../android/README.md), 자료 출처는 [CREDITS](../../android/CREDITS.md)를 따른다. SDK는 임시 경로 대신 `~/Library/Android/sdk`에 설치했다. Wrapper 배포 checksum을 고정했다.

## 운영 적용 — 설정 완료, 실제 계정 E2E 대기

- [x] 사용자 지시에 따라 공개 서버를 `.private/releases/native-20260918`로 전환. 빌드 ID `pYinSa0klGazeRSte88QN`.
- [x] 공개 로그인 설정 API·미인증 보호·기존 웹과 두 APK 다운로드 검증.
- [x] Supabase Redirect URLs에 `com.heptivision.airo://auth/callback?**` 저장 및 운영 응답 확인. 기존 웹 callback 유지, `.comv` 오타 항목 제거.
- [x] 가입 확인·Magic link 기본 템플릿의 `{{ .ConfirmationURL }}` 확인.
- [x] 일반 사용자 이메일 발송용 DNS·custom SMTP 연결. Resend Free, 도메인 한정 발송 키, SMTP 인증과 설정 재조회 확인.
- [ ] 실제 Google·이메일 로그인 복귀 E2E 확인.
- [ ] 사용자 PC의 실제 Codex 구독 연결로 앱에서 대화 확인. 자동 테스트는 구독 프로토콜을 모사한다.
- [ ] 정식 유통을 원할 경우 릴리스 서명 키·공개 개인정보 안내·스토어 정보와 제출 절차 확정.

2026-09-18 사용자 지시 “모든 설정까지 완료해서 E2E 테스트만 남기라니까”에 따라 Aside의 운영 프로젝트 관리 세션에서 앱 복귀 주소를 저장했다. 초기 검사에서 발생한 웹 홈 fallback이 해결됐고, 앱 callback과 `native_state`가 모두 유지된다. 기존 웹 callback과 미등록 주소 차단도 유지된다. 변경 전후 기록은 `.private/deployment/native-20260918/auth-url-before.json`과 `auth-url-after.json`이다. 실제 사용자 로그인·이메일 발송은 하지 않았다.

추가한 `npm run verify:mobile-auth`는 운영 인증 설정을 실제 로그인·메일 발송·모델 호출 없이 검사한다. 현재 7개 항목이 모두 통과했다. 근거는 `.backups/android-completion/mobile-auth-preflight.json`, 실제 계정 점검 순서는 [Android E2E 점검](ANDROID_E2E.md)에 있다.

이메일 SMTP 설정을 완료했다. Cloudflare 브라우저 로그인을 기다릴 필요 없이 로컬 `~/.cloudflared/cert.pem`의 관리 인증으로 메일 DNS 3개를 등록했다. 권한 서버와 외부 DNS에서 6개 검사가 통과했고, Resend 도메인 인증도 완료됐다. `auth.airo.dev-heptivision.com`으로 제한한 Sending access 키를 만들어 TLS SMTP 인증(235)을 확인한 뒤 Supabase에 저장·재조회했다. 발신자는 `AIRO <login@auth.airo.dev-heptivision.com>`, 호스트는 `smtp.resend.com:465`, 사용자별 재발송 간격은 60초다. Resend Free의 월 3,000통·일 100통 한도와 초과 과금 비활성화를 확인했다. 실제 메일은 보내지 않았으며 임시 비밀값 파일은 삭제했다. 구성과 DNS 값은 `.private/deployment/native-20260918/resend-setup.json`에 기록했다.

배포 위치:

- 새 snapshot: `.private/releases/native-20260918`, 빌드 `.next-live`.
- 새 snapshot 검사 리스너: `127.0.0.1:3158`, 유료 API 키를 빈 값으로 둔 검증 프로세스.
- Android 최초 배포 snapshot: `.private/releases/native-20260918`, 포트 3410. 이후 운영 릴리스 변경은 [배포 기록](DEPLOYMENT.md)을 따른다.
- 이전 운영 snapshot: `.private/releases/pwa-20260917`, 롤백용 보존.
- 적용한 설정: `.private/deployment/native-20260918/proposed-app.plist`.
- 복구 설정: `.private/deployment/native-20260918/previous-app.plist`.
- 배포 실행 기록: `.private/deployment/native-20260918/deployment-result.json`.
- 공개 호스트·터널·운영 DB schema 변경 없음.

초기 서비스 교체에서 `bootout` 직후 `bootstrap`이 오류 5를 반환해 기존 서비스로 복구했다. 서비스 해제와 포트 종료를 기다리는 방식으로 다시 적용했고 새 배포본이 정상 실행 중이다. 공개 검사 중 Python 기본 HTTP 클라이언트는 Cloudflare 403을 받아, curl 및 앱과 같은 OkHttp User-Agent로 다시 검사해 정상 응답을 확인했다.

코드·신규 파일은 작업 디렉터리에 보존했으며 commit/push하지 않았다. `android/`를 포함한 untracked 파일은 Git clone만으로 옮겨지지 않으므로 작업 인계 시 저장소 전체 또는 별도 snapshot을 함께 보관해야 한다.
