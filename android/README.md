# AIRO Android

Kotlin/Jetpack Compose 네이티브 클라이언트. 기존 Next.js 서버의 여행·예산·자료·Codex 구독 연결을 공유한다. WebView 앱이 아니다.

현재 버전은 **0.3.8 / versionCode 11**다. Day별 숙소 정보 버튼을 누르면 그날 숙소와 예약·지도 링크를 별도 모달에서 확인한다. 지도 오른쪽 위의 현재 위치 버튼으로 내 위치를 표시하고 지도를 이동한다. [현재 위치 검증](../docs/ops/CURRENT_LOCATION.md). 점심·저녁 등 한 칸에 여러 장소 후보를 묶고, 점선 경로 비교 후 선택해 확정한다. 후보 변경·선택 해제·MCP 설정을 지원한다. [선택형 일정 검증](../docs/ops/STOP_CHOICES.md). 체크 즉시 화면 반영, 저장 중 연속 체크·취소, 완료 핀 애니메이션, 완료 장소를 남은 경로/재생에서 제외하고 실패·취소 시 복원한다. Day 설정에서 시간·GPS 체크를 일괄 적용할 수 있다. [변경·검증 기록](../docs/ops/ANDROID_PROGRESS_RESPONSE.md).

0.3.1 이상 사용자는 **내 정보 → 설정 → 앱 업데이트**로 설치한다. 0.3.0 이하는 [0.3.8 APK](https://airo.dev-heptivision.com/downloads/airo-android-cloud-0.3.8.apk)를 한 번 직접 설치한다. 앱을 삭제하지 않아야 로그인·로컬 자료가 유지된다. [이전 Day·Todo·앱 링크·사진 기능](../docs/ops/ANDROID_NATIVE_LINKS.md)은 유지한다.

0.3.0은 전체 지도·날짜 카드, 장소별 PDF·예약, 직접 PDF 추가와 앱 내부 미리보기, 예약·예산 연결, 변경 이력, 자료를 활용하는 AI 대화와 Android 공유 받기를 제공한다. 구현 범위와 검증 결과는 [최신 UI/UX 구현 기록](../docs/ops/ANDROID_UIUX_IMPLEMENTATION.md)을 따른다.

## 실행

- JDK 17 이상(검증 환경 JDK 21), Android SDK 36, Build Tools 35.0.0.
- 최소 Android 8.0/API 26, target API 36.
- Gradle Wrapper와 의존성 버전은 저장소에 고정되어 있다.

저장소 루트에서:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
./android/gradlew -p android :app:assembleDemoDebug :app:assembleCloudDebug
```

환경변수 대신 Android Studio에서 `android/`를 열고 SDK/JDK를 지정해도 된다. 생성 경로:

| 용도 | APK | 앱 ID |
| --- | --- | --- |
| 기기 안에서만 저장하는 샘플 | `app/build/outputs/apk/demo/debug/app-demo-debug.apk` | `com.heptivision.airo.demo` |
| Cloud 또는 Community 서버 | `app/build/outputs/apk/cloud/debug/app-cloud-debug.apk` | `com.heptivision.airo` |

두 앱은 함께 설치할 수 있다. Debug APK는 개발용 인증서로 서명되며 스토어 배포본이 아니다. 설치 보안 경고를 숨기거나 기기 보안 기능을 끄지 않는다.

Cloud 기본 서버는 `https://airo.dev-heptivision.com`. 로그아웃 상태의 로그인 화면에서 **서버 변경**으로 자체 운영 Community 서버의 HTTPS origin을 지정한다. 경로·사용자 정보·쿼리가 포함된 주소는 거절한다. Debug에서만 localhost/127.0.0.1/10.0.2.2 HTTP를 허용한다.

기본 주소를 빌드에 고정하려면 `-PairoBaseUrl=https://example.com`을 추가한다. 테스트는 앱 설정만 임시 서버로 바꾸며 배포 APK의 기본 주소를 바꾸지 않는다.

## 기능과 구조

- `feature/welcome`: 기존 로마 사진과 오프라인 지도 기반 소개·예시 여행. 계정에 쓰거나 AI를 호출하지 않는다.
- `feature/auth`, `data/auth`: Google Custom Tab·이메일 PKCE, Community 비밀번호 로그인, 토큰 갱신·로그아웃·서버 선택.
- `feature/trips`, `feature/itinerary`: 여행 CRUD·검색·필터, 전체 지도·가까운 날짜 자동 선택·카드 스와이프·조작부 전환, 장소 추가·수정·삭제·순서 변경과 실제 도로 경로.
- `feature/budget`: 지출·결제 여부·통화/수동 환율·예비비. 서버 revision 충돌 시 편집 내용을 남긴다. 예약에서 새 지출을 만들거나 기존 지출에 연결하며 `reservationId`로 중복을 방지한다.
- `feature/resources`: 보관한 장소·즐겨찾기·일정 추가·예약 PDF 열기. 2MB 이하 PDF 직접 추가·원본 미리보기·장소 연결 수정, 예약 상태/링크/문서 관리와 날짜·장소 검색. 해시를 검증하고 Android PdfRenderer로 앱 안에서 페이지·확대를 제공한다.
- `feature/history`: 변경 전후 메타데이터 검토와 확인 후 되돌리기. revision 충돌 시 최신 이력을 다시 확인한다. 데모는 이력을 보관하지 않는다.
- `feature/share`: PDF 또는 HTTPS 링크 한 개를 공유받아 여행 선택·로그인 후 이어가기. 원격 링크는 자동으로 다운로드하지 않는다.
- `feature/transfer`: Android 파일 선택기로 AIRO JSON 가져오기/내보내기. 원본 PDF·출처 자료를 보존하고 중복 가져오기를 막는다.
- `feature/profile`, `data/update`: 공식 고정 HTTPS 배포 주소에서 수동 업데이트 확인. APK를 메모리에 통째로 올리지 않고 스트리밍하며 크기·SHA-256·패키지 ID·버전·기존 설치 서명을 검사한다. 다운로드 완료 상태는 앱 재실행 후 복원하고 설치 직전에 다시 검증한다. Community 서버 주소는 앱 배포 주소에 영향을 주지 않는다.
- `feature/chat`, `data/ai`: 연결된 PC의 Codex 구독 기기로 요청. 선택한 날짜·장소·PDF 식별자를 함께 전달하며, 처리 후 일정/자료/예산으로 돌아간다. 응답 유실 시 같은 요청 ID로 재시도, 중지·진행 복구·장치 해제.
- `core/design`: 공통 스타일·폼·MapLibre Native 수명주기. 데모 지도는 번들 OSM, Cloud 지도는 CARTO.
- `data/trips`: Cloud와 Demo 저장소. UI에서 HTTP 또는 비밀 저장소를 직접 만들지 않는다.
- `core/security`: Android Keystore AES-GCM 암호화 저장. OS 백업 제외. 로그아웃 시 세션과 문서 캐시 정리.

일정 좌표가 없는 도로 구간을 직선으로 대신 그리지 않는다. 데모는 장소·편집 체험이며 온라인 장소/도로/AI 요청을 하지 않는다. 실제 도로 기능은 Cloud에서 요청하며 공급자 실패를 화면에 표시한다.

## 서버와 인증 준비

이 앱과 같은 변경의 Next.js 서버가 필요하다. `/auth/mobile/config`, `/auth/mobile/session`(Community), `/api/mobile/trips`, `/api/mobile/places`, `/api/mobile/trips/:id/resources`가 추가되었다. 0.3.0은 `/api/mobile/trips/:id/documents`·`reservations`·`changes`와 문서 SHA-256 주소를 사용한다. 기존 여행·Codex API의 제한된 경로만 Bearer를 허용한다. 검증한 사용자 JWT를 그대로 RLS에 전달하며 잘못된 Bearer를 쿠키로 대체하지 않는다.

Cloud 운영 설정:

1. 새 서버 코드를 배포한다. `/auth/mobile/config`가 JSON 설정을 반환하는지 확인한다.
2. Supabase Authentication → URL Configuration의 Redirect URLs에 `com.heptivision.airo://auth/callback?**`를 추가한다. 기존 웹 callback을 유지한다. 앱은 `native_state`와 PKCE verifier를 모두 검증한다.
3. 이메일 템플릿이 Supabase의 `ConfirmationURL`을 사용하고 등록된 앱 redirect를 유지하는지 확인한다.
4. 실제 기기에서 Google·이메일 로그인, 취소, 재실행, 로그아웃을 확인한다. 자동 테스트의 Auth 서버는 가짜 제공자이므로 운영 Supabase/Google 설정 확인을 대신하지 않는다.

운영 설정 사전 검사는 저장소 루트에서 `npm run verify:mobile-auth`로 실행한다. 공개 설정·Google/이메일 활성화·앱 callback과 `native_state` 유지·기존 웹 callback·미등록 주소 차단·미인증 API를 확인한다. Google 인증 시작 요청은 즉시 취소하며 실제 사용자 로그인·이메일 발송·모델 호출은 하지 않는다. 결과는 `.backups/android-completion/mobile-auth-preflight.json`에 저장된다. 실제 계정 E2E 순서는 [Android E2E 점검](../docs/ops/ANDROID_E2E.md)을 따른다.

Community는 기존 `AIRO_OWNER_PASSWORD`, `AIRO_JWT_SECRET`, PostgREST 설정을 사용한다. 새로 별도 비밀번호 저장소를 만들지 않는다. 로그인 오류 횟수 제한과 웹 CSRF 검사를 유지한다.

## 비용 경계

별도 과금 호출은 사용자 명시적 승인 전 실행하지 않는다. Android에는 OpenAI API 키 입력·`/api/chat`·유료 fallback이 없다. 모바일 장소 검색과 모든 Codex 구독 bridge 도구 실행은 `allowGoogle: false`를 강제한다. 앱에서 시작한 작업을 웹에서 재개해도 동일하다. 환율은 직접 입력한다.

PC 플러그인은 `account.type === 'chatgpt'`인 Codex 구독 로그인을 확인해야 `ready`가 된다. `api_account` 장치는 서버와 앱 양쪽에서 작업을 받지 않는다. 테스트는 가짜 worker를 사용하며 실제 모델 호출·이메일 발송이 없다. PC 플러그인의 설치와 운영 계정 연결은 [CODEX_CONNECTION.md](../CODEX_CONNECTION.md)를 참고한다.

## 검사

```sh
./android/gradlew -p android :app:testDemoDebugUnitTest \
  :app:lintDemoDebug :app:lintCloudDebug
# 전용 에뮬레이터 또는 테스트 기기에만 실행: 앱 설치 데이터가 초기화됨
ANDROID_SERIAL=emulator-5556 ./android/gradlew -p android \
  :app:connectedDemoDebugAndroidTest
```

단위 테스트는 PKCE·갱신 경합·콜백 유실·데모 저장 실패·예산 충돌·원본 파일 보존·다운로드 제한·AI 재시도/중지, 날짜 선택·명시적 첨부 연결·예약 충돌·원본/연결 왕복 보존·예산 중복 방지를 다룬다. Demo UI 테스트는 실제 지도의 도로 픽셀, 소개의 날짜 변경, 여행 생성/삭제, 일정 수정/재생성, 예산·즐겨찾기와 Android 파일 선택기를 통한 내보내기/가져오기, PDF 직접 선택·2페이지/확대·복원·연결, 예약과 예산, 공유 후 로그인, 지도 제스처를 확인한다. 320dp와 150% 글자 크기를 포함한다.

서버 통합 검사는 Docker의 **독립된 임시 PostgreSQL/PostgREST**와 가짜 Auth 제공자를 사용한다. 개인 자료와 운영 계정을 사용하지 않으며 컨테이너/네트워크를 종료 후 정리한다. 포트 3154~3156이 비어 있어야 한다.

```sh
npm run test:mobile-api
# 위 검사에 Android Cloud/Community 로그인·실제 서버 저장까지 추가
ANDROID_SERIAL=emulator-5556 node scripts/test-mobile-api.mjs --native-ui
```

`--native-ui`는 `ANDROID_HOME`, `JAVA_HOME`과 실행 중인 전용 에뮬레이터가 필요하다. 가짜 이메일 로그인은 PKCE challenge/verifier를 검사한 뒤 실제 Android VIEW intent로 복귀한다. 실제 메일/Google 로그인이 아니다. 결과는 `.backups/android-completion/`, Android 리포트는 `app/build/reports/`에 생성한다.

## 릴리스

```sh
./android/gradlew -p android :app:assembleDemoRelease :app:assembleCloudRelease :app:bundleCloudRelease
```

R8 최적화된 unsigned APK와 AAB를 생성한다. 배포자는 보관 중인 릴리스 키로 Android Studio의 **Generate Signed App Bundle / APK**를 사용해 서명한다. 비밀 키를 Git·공개 다운로드에 넣지 않는다. 기존 앱 업데이트는 동일한 서명 키와 증가한 versionCode가 필요하다. 이 저장소는 소유자 릴리스 키를 임의 생성하거나 스토어에 게시하지 않는다.

출처는 [CREDITS.md](CREDITS.md), 실제 검사/배포 상태는 [ANDROID_COMPLETION.md](../docs/ops/ANDROID_COMPLETION.md)를 따른다.
