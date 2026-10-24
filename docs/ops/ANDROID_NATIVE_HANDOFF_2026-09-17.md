# Android 네이티브 클라이언트 재개 메모

> 후속 지시로 앱 완성 작업을 재개했다. 최신 진행은 [ANDROID_COMPLETION.md](ANDROID_COMPLETION.md)에 기록하며, 아래 단위별 승인/작업 중단 규칙은 후속 지시로 대체되었다.

저장일: 2026-09-17 (Asia/Seoul)
저장소: `/Users/mini-mingeon/Travel/AIRO-app`
브랜치: `main`
작성 시 HEAD: `d061017 docs(ops): deploy pwa-20260917 to production`

## 최신 상태 — 16:32, 구현 보류 / 아이디어 논의

- 사용자가 설치 경고 조사는 일단 두라고 했고, 앱 화면 확인은 직접 맡았다. 에뮬레이터 확인을 시작하지 않는다.
- 사용자 보고: 지도가 보이지 않는 것으로 보임. 원인 미확인, 지도 표시 문제를 다음 구현 후보의 첫 순위로 기록했다.
- 사용자가 TODO 기록 후 웹의 기존 리소스를 활용한 앱 소개 경험에 대해 아이디어 회의를 요청했다. 새 앱 구현이나 테스트는 시작하지 않는다.
- **현재 진행 기준은 [ANDROID_NATIVE_TODO.md](ANDROID_NATIVE_TODO.md)** 이다. 완료/미완료/보류/제안 미승인 상태를 구분했다. 아래의 단계별 기록은 이 최신 지시를 우선하여 읽는다.

## 설치 경고 조사 대기 — 16:26

사용자가 APK 다운로드/설치 과정에서 ‘잠재적 위험 앱, 피싱 시도’ 문구를 보고했다고 알렸다. 경고가 브라우저/Play Protect/설치 후 실행 중 어느 단계인지와 정확한 원문을 비동기 질문했으며 아직 답이 없다. 개발용 앱이라 당연한 오탐이라고 단정하거나 보안 기능을 끄도록 안내하지 않는다.

읽기 전용으로 배포 APK를 재확인했다. 서명은 `CN=Android Debug` 개발용 인증서이며 APK 서명 검증은 통과한다. 이 사실은 악성/피싱 분류의 원인을 설명하거나 안전성을 보증하지 않는다. 병합된 APK 권한은 INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, 앱 내부 DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION이다. SMS/접근성/알림 읽기 권한은 이 출력에 없다. 앱은 현재 위치 기능을 구현하지 않았으므로 SDK에서 들어온 위치 권한은 다음 승인된 수정 단위에서 제거 검토가 필요하다.

아직 경고 원인은 확인하지 못했다. 정확한 경고 화면/문구를 받은 뒤 Chrome 다운로드 경고와 Play Protect 분류를 구분한다. 이번 조사에서는 재서명·앱 ID 변경·추가 배포·스캐너 업로드·보안 기능 우회·소스 수정은 하지 않았다. 필요한 수정 작업은 기존 단위별 승인 지침을 따른다.

공식 참고: https://developers.google.com/android/play-protect/warning-dev-guidance (미확인 앱의 검사 권고, 유해 앱 차단, 민감 권한 차단을 서로 다른 유형으로 설명함).

## 최신 사용자 지시와 데모 다운로드 — 16:22

- 사용자가 앱 설치·화면 확인은 직접 하겠다고 했다. 제안했던 3단계 에뮬레이터 검증은 승인되지 않았으며 실행하지 않는다. 추가 구현은 단위별 승인을 기다린다.
- 사용자의 전체 다운로드 주소 요청으로 데모 APK를 `public/downloads/airo-demo-20260917.apk`에 복사하고 원본과 SHA-256 일치를 확인했다. `.git/info/exclude`에서 이 재생성 가능한 APK를 로컬 Git 제외했다.
- 같은 Wi-Fi/LAN에서 받을 전체 주소: `http://192.168.0.44:3002/downloads/airo-demo-20260917.apk`.
- 사용자 요청에 따라 Tailscale 다운로드 주소도 제공: `http://100.119.40.108:3002/downloads/airo-demo-20260917.apk`. 휴대폰의 Tailscale 연결과 이 Mac/개발 서버 실행이 필요하며 같은 Wi-Fi일 필요는 없다.
- 기존 개발 서버에서 HTTP 200, APK MIME type, Content-Length 70,011,051을 확인했다. 앱 화면 실행 검증은 하지 않았다.
- 새 서버를 띄우거나 운영 배포/터널 설정을 변경하지 않았다. 이 주소는 Mac과 기존 3002 서버가 켜져 있고 같은 네트워크에 연결된 동안 유효하다. 재부팅/이동 후 IP가 달라지면 주소를 다시 확인한다.

## 최신 재개 결과 — 16:18, 2단계 완료

사용자가 데모 APK 링크를 요청하면서 2단계 진행을 승인했다. 승인 범위는 Android Lint 정적 검사, 발견 오류 수정, 필요한 재빌드이며 최대 10분이었다. 16:16에 시작해 16:18에 완료했다.

첫 Lint에서 오류 4건·경고 25건을 발견했다. 다음 3개 파일만 수정했다.

- `android/app/src/main/res/values/styles.xml`: minSdk 26에서 사용할 수 없는 `android:windowLightNavigationBar` 항목 제거. Activity의 기존 `SystemBarStyle.dark`는 유지한다.
- `android/app/src/debug/res/xml/network_security_config.xml`: 개발 주소 3개의 `<domain>`에 `includeSubdomains="false"` 명시.
- `android/app/src/main/java/com/heptivision/airo/feature/itinerary/ItineraryScreen.kt`: `Configuration.screenHeightDp` 대신 `LocalWindowInfo`와 `LocalDensity`로 실제 창 높이를 계산하도록 Lint 권고 반영.

수정 후 `:app:lintDemoDebug :app:lintCloudDebug :app:assembleDemoDebug :app:assembleCloudDebug --console=plain --no-daemon`을 함께 실행했고 **BUILD SUCCESSFUL in 21s**, 99개 task, 종료 코드 0을 확인했다. 두 flavor 모두 **Lint 오류 0건, 경고 24건**이다. 남은 경고는 의존성 업데이트 안내, KTX 작성 방식, SharedPreferences 동기 저장, 리소스 디렉터리 qualifier 권고로 별도 검토 대상이다. 경고를 숨기는 baseline이나 검사 제외는 추가하지 않았다.

데모 APK 추가 확인: `apksigner verify --verbose` 통과 (v2 서명), `zipalign -c -P 16 4` 통과. 이는 APK 패키지 확인이며 실기기/16KB 기기 런타임 실행 검증을 대신하지 않는다.

최신 APK (16:18 확인):

- 데모: `android/app/build/outputs/apk/demo/debug/app-demo-debug.apk`, 70,011,051 bytes. SHA-256 `6fe8c43006df4bb144d8471fdee9836fa187ddaa0be6baee42559859bd2c3150`.
- Cloud: `android/app/build/outputs/apk/cloud/debug/app-cloud-debug.apk`, 70,011,023 bytes. SHA-256 `d47ba08bfa856d4b2c78a50d643a9f997ba20363fbe5c29ea4cdf9160000e1bd`.
- 사용자에게 데모 APK의 로컬 파일 다운로드 링크를 제공했다. 공개 웹/운영 서버에 APK를 업로드하거나 배포하지 않았다.
- 로그/리포트는 `.backups/android-unit2-2026-09-17-*`에 보존했다. `git diff --check` 통과.
- SDK/JDK 경로와 명령 앞의 환경변수는 1단계와 같다.

**2단계 종료. 다음 단위는 아직 승인받지 않았다.** 다음 제안은 에뮬레이터 준비와 데모 화면·기본 흐름 확인(최대 15분)이며, 실제 로그인/운영 서버 검증은 포함하지 않는다. 16:50 이후 새 단위를 시작하지 않는 지침은 계속 유효하다.

## 이전 재개 결과 — 16:14, 1단계 완료

사용자가 16:10경 작업 재개를 요청했고, **단위를 분리해 각 단위 시작 전 허락받을 것**, 17:00에 나갈 예정이라고 지시했다. 16:50부터 새 단위를 시작하지 않고 정리하기로 했다.

승인된 1단위는 재개 메모/환경 확인 → 데모·Cloud Android 컴파일 → 컴파일 오류 수정, 최대 15분이었다. 16:12에 시작했고 16:14에 두 APK 생성을 확인했다. 실제 Gradle 실행은 **1분 33초**, 78개 task, 종료 코드 0이다. 컴파일 오류가 없어 Kotlin 소스나 빌드 설정을 수정할 필요가 없었다.

실행한 명령:

```sh
cd /Users/mini-mingeon/Travel/AIRO-app/android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/tmp/airo-android-toolchain/sdk \
./gradlew :app:assembleDemoDebug :app:assembleCloudDebug --console=plain --no-daemon
```

생성 확인:

- `android/app/build/outputs/apk/demo/debug/app-demo-debug.apk` — 약 66 MiB, `com.heptivision.airo.demo`.
- `android/app/build/outputs/apk/cloud/debug/app-cloud-debug.apk` — 약 66 MiB, `com.heptivision.airo`.
- 빌드 로그 원본: `/tmp/airo-android-toolchain/unit1-build.log`.
- 보존 로그: `.backups/android-unit1-2026-09-17-build.log`.
- AGP가 필요한 Build Tools 35.0.0도 자동 설치했다.
- `--no-daemon`의 일회성 Gradle 프로세스는 빌드 종료 후 종료된다.
- 사용 중단 예정 API 경고: `NativeMap.kt` 메모리 콜백, `StopEditorSheet.kt` DirectionsWalk 아이콘. 네이티브 라이브러리는 debug symbol stripping 없이 패키징됐으며 debug APK 생성에는 지장이 없었다.
- `git diff --check` 통과. 서버 실행, 화면 변경, 실제 로그인, 유료 API 호출, 커밋/배포는 하지 않았다.

**1단계는 여기서 종료. 다음 단위를 시작하기 전에 사용자 승인이 필요하다.** 제안할 다음 단위는 Android Lint 정적 검사와 발견 오류 수정(5~10분). 앱 실행/화면 확인과 서버 인증 검증은 여전히 미완료다.

## 중단 사유와 현재 상태

사용자가 Mac을 종료하고 옮길 예정이므로 **새 작업을 시작하지 말고 현재 상태를 저장**하라고 요청했다. 이 메모를 작성하는 시점에 구현 작업을 멈췄다. 다음 작업은 사용자가 재개를 요청한 뒤 진행한다.

변경 사항은 작업 디렉터리에 저장되어 있으나 **커밋·push·배포하지 않았다**. `android/`를 비롯한 신규 파일은 Git untracked 상태다. Git clone/pull만으로는 이번 작업이 옮겨지지 않는다. 저장소 전체를 복사하거나 아래 체크포인트를 함께 옮겨야 한다.

**16:18 기준 데모·Cloud debug APK 컴파일과 Lint는 통과했다. 에뮬레이터 실행·화면·실제 로그인은 아직 검증하지 않았다. 완성 앱 또는 실행 검증 완료 상태로 설명하면 안 된다.** 아래 초기 중단 기록은 위 최신 재개 결과와 함께 읽는다.

## 사용자 요구사항

1. 기존 Next.js·React 웹 시스템을 공유하는 Android **네이티브 Kotlin 클라이언트** 개발.
2. 기본 사용자 여정은 로그인 → 내 여행. Mobile Native UI/UX가 중요하다.
3. Mapcn 같은 깔끔한 다크 UI/UX: 차콜·얇은 테두리·절제된 블루, 네이티브 지도와 일정 바텀시트.
4. 처음에는 랜딩을 제외하라고 했으나, 이후 **로고를 참고해 랜딩페이지도 만들고 코드를 반드시 잘 분리**하라고 변경했다.
5. 랜딩이 앱 시작 화면인지 별도 웹페이지인지 비동기 질문했으나 답은 아직 없다. 작업 중 사용자에게 **우선 Android 앱의 시작 화면으로 구현**한다고 알렸다. 현재 구현은 앱 랜딩이며 별도 웹 랜딩은 만들지 않았다.
6. 로그인한 사용자는 앱을 다시 열면 바로 내 여행으로 들어간다.
7. 모든 별도 과금 API·유료 크레딧은 실행 전 명시적 허가 필요. 키·기존 코드·일반 작업 지시는 과금 허가가 아니다. 이번 작업에서 AI 생성·유료 API 호출·운영 데이터 변경·실제 이메일 발송은 하지 않았다. subagent도 사용하지 않았다.

## 완료한 일 — 소스 작성 기준

### Android 프로젝트

`android/`를 독립 Gradle 프로젝트로 추가했다. 웹 클라이언트를 감싸는 WebView 방식이 아니다.

- Kotlin 2.2.21, Jetpack Compose BOM 2025.10.01, Material 3.
- AGP 8.13.2, Gradle Wrapper 8.13 (배포 ZIP SHA-256 고정).
- compile/target SDK 36, min SDK 26, JVM target 17.
- Navigation Compose 2.9.5, Lifecycle 2.9.4, OkHttp 4.12.0, MapLibre Native 13.6.1.
- `cloud` / `demo` product flavor 분리. 앱 ID는 `com.heptivision.airo` / `com.heptivision.airo.demo`.
- release는 HTTPS. debug만 `10.0.2.2`, `127.0.0.1`, `localhost` HTTP 허용.
- 승인된 제비 로고와 워드마크를 원본 WEBP 그대로 복사했다. 로마 GeoJSON은 기존 `public/maps/rome-detail.geojson`을 복사했다.
- Keystore AES-GCM 암호화 세션 저장, 백업 제외, PKCE 로그인 초안.
- 랜딩, Google Custom Tabs/이메일 로그인, 내 여행 목록·검색·필터·새 여행 시트, 내 정보·로그아웃 화면 작성.
- 여행 상세 지도·날짜 칩·일정 바텀시트, 장소 검색·추가·수정·삭제, 시간 선택, 메모, 여행 정보 수정·삭제 작성.
- 네이티브 지도 번호 핀, 지도 길게 누르기→장소 추가, 외부 지도 앱 열기 작성.
- 도로 동선은 기존 서버의 실제 road route를 요청하며 실패한 구간을 직선으로 만들지 않는다.
- 데모는 로마 샘플 여행을 기기 저장소에서 편집하며 계정 API를 호출하지 않는다. 데모/랜딩 지도는 로컬 GeoJSON 사용.

### 기존 서버 연동

- 제한된 여행 API에서 Supabase access token의 `Authorization: Bearer ...` 인증을 허용하도록 추가했다.
- `auth.getUser(token)`으로 실제 토큰을 검증하고, 기존 `actorStore`를 통해 **원래 사용자 JWT**를 저장소로 전달한다. service role을 사용하지 않으며 RLS를 유지한다.
- 유효하지 않은 모바일 토큰은 쿠키나 데모 계정으로 fallback하지 않도록 했다.
- Proxy는 지정된 API만 토큰 검증을 핸들러에 위임한다. 기존 브라우저 CSRF 검사는 유지한다.
- `/auth/mobile/config`: 공개 Supabase URL/anon key와 앱 callback 주소만 제공한다. Cloud 에디션 전용.
- `/api/mobile/trips`: 여행 요약과 플랜 반환.
- `/api/mobile/places`: `allowGoogle: false`로 무료 OSM 계열 검색만 사용. 버튼을 누를 때 검색하며 자동완성 호출은 없다.
- 기존 `searchPlaces`의 기본 동작은 유지하고, OSM 전용 결과의 캐시 키를 분리했다.

## 코드 분리와 변경 파일

### 기존 파일 수정 (3개)

- `src/lib/api.ts`: 모바일 인증, actor context, 오류 응답 no-store.
- `src/lib/places.ts`: `allowGoogle` 옵션과 분리된 캐시 키.
- `src/proxy.ts`: 제한된 모바일 토큰 API 통과.

### 서버 신규 파일 (5개)

- `src/lib/mobile-api-path.ts`
- `src/lib/mobile-auth.ts`
- `src/app/auth/mobile/config/route.ts`
- `src/app/api/mobile/trips/route.ts`
- `src/app/api/mobile/places/route.ts`

### Android 빌드·리소스

- `android/.gitignore`
- `android/settings.gradle.kts`
- `android/build.gradle.kts`
- `android/gradle.properties`
- `android/gradlew`, `android/gradlew.bat`
- `android/gradle/wrapper/gradle-wrapper.properties`, `gradle-wrapper.jar`
- `android/app/build.gradle.kts`, `android/app/proguard-rules.pro`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/debug/AndroidManifest.xml`
- `android/app/src/debug/res/xml/network_security_config.xml`
- `android/app/src/main/res/xml/data_extraction_rules.xml`
- `android/app/src/main/res/values/styles.xml`, `colors.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/drawable/ic_launcher_foreground.xml`
- `android/app/src/main/res/drawable-nodpi/airo_logo.webp`, `airo_mark.webp`
- `android/app/src/main/assets/rome.geojson`

### Kotlin 소스

기준 디렉터리: `android/app/src/main/java/com/heptivision/airo/`

- 진입·의존성 조립: `AiroApplication.kt`, `MainActivity.kt`
- 탐색: `navigation/AiroApp.kt`
- 공통 모델: `core/model/Models.kt`
- 통신: `core/network/HttpTransport.kt`
- 암호화: `core/security/SessionVault.kt`
- 디자인: `core/design/AiroTheme.kt`, `Components.kt`, `DateField.kt`, `NativeMap.kt`
- 인증 저장소: `data/auth/AuthRepository.kt`
- 여행 저장소: `data/trips/TripRepository.kt`, `DemoTripRepository.kt`
- 앱 랜딩: `feature/welcome/WelcomeScreen.kt`
- 로그인: `feature/auth/AuthViewModel.kt`, `LoginScreen.kt`
- 내 여행: `feature/trips/TripsViewModel.kt`, `TripsScreen.kt`, `TripFormSheet.kt`
- 여행 상세: `feature/itinerary/ItineraryViewModel.kt`, `ItineraryScreen.kt`, `StopEditorSheet.kt`
- 내 정보: `feature/profile/ProfileScreen.kt`

## 검증한 것 / 아직 안 한 것

완료한 확인:

- `git diff --check` 통과.
- `./gradlew help --console=plain` **BUILD SUCCESSFUL in 34s**.
- Gradle 설정 평가·플러그인 다운로드까지 확인했다. 이 명령은 앱 Kotlin 컴파일이나 앱 의존성 전체 검증을 하지 않는다.
- SDK platform 36, build-tools 36.0.0, platform-tools 설치 작업 종료 코드 0.
- SDK 설치/Gradle 준비 명령의 백그라운드 세션 모두 정상 종료됨.
- 16:14 추가 확인: `assembleDemoDebug` / `assembleCloudDebug` 통과, 두 APK 생성 확인 (위 최신 결과 참고).
- 16:18 추가 확인: 양쪽 Lint 오류 0건, 재빌드 통과. 데모 APK 서명·ZIP 정렬 검증 통과.

미실행:

- Kotlin/JVM 테스트, Compose UI 테스트.
- Next.js 타입 검사·빌드·모바일 API 통합 테스트.
- 에뮬레이터·실기기 화면, 회전·키보드·작은 화면·접근성·바텀시트 조작 검증.
- 실제 Supabase Google/이메일 로그인, 딥링크 복귀, 운영 여행 조회·편집.
- 이번 서버 코드는 운영에 배포하지 않았다. 기본 Cloud APK가 운영 URL을 사용하더라도 신규 경로는 배포 전 동작하지 않는다.

## 재개 후 남은 일

1. **Android 컴파일과 Lint는 통과했다.** MapLibre 13.6.1·Compose·직렬화 소스의 컴파일 호환성을 확인했다. 다음은 사용자 승인 후 앱 실행 검증이다.
2. `kotlinOptions.jvmTarget`의 Gradle 경고를 `compilerOptions` DSL로 정리한다.
3. 내비게이션 중첩 Scaffold의 시스템 바 여백, 지도 영역과 bottom sheet 높이, 랜딩에서 CTA가 작은 화면에서 잘 보이는지 확인한다.
4. 요청 취소/동시 refresh에 따른 상태 경쟁, 로그아웃/세션 만료 시 ViewModel·여행 자료 제거, 회전과 프로세스 재시작 시 세션/PKCE/draft 복구를 검증한다. Auth callback이 busy 상태에서 무시될 가능성도 검토한다.
5. 기존 API와 새 모바일 Bearer 경로를 **로컬 fixture Auth/PostgREST**로 검증한다. 정상·만료·잘못된 토큰, 다른 사용자 격리, 헤더/쿠키 충돌, CSRF, summary envelope 등을 확인한다. 운영 자료로 테스트하지 않는다.
6. NativeMap lifecycle·핀 선택·지도의 위치 재설정·메모리 해제·실패 UI·출처 표시와 지도 라이선스 안내를 검토한다. Cloud 지도는 웹과 같은 CARTO Dark Matter keyless URL을 사용한다. 별도 유료 지도 서비스로 전환하지 않는다.
7. Supabase redirect allowlist를 설정해야 실제 앱 인증을 할 수 있다. 현재 callback은 `com.heptivision.airo://auth/callback?native_state=<random>` 형태이므로 경로와 query를 허용하는 항목이 필요하다. 예: `com.heptivision.airo://auth/callback?**`. 프로젝트의 실제 allowlist 매칭 규칙과 이메일 템플릿을 확인한다. 관리 콘솔 변경/이메일 전송/운영 로그인은 아직 하지 않았다.
8. 사용자에게 랜딩 범위가 앱 시작 화면인지 별도 웹페이지인지 필요 시 확인한다. 현재는 앱 시작 화면만 작성했다.
9. Android README, 검증 결과, 설치 가능한 데모 APK와 스크린샷을 준비한다. 구현/검증 후 커밋·리뷰·배포 범위를 판단한다.

이번 초기 범위에 아직 없는 웹 기능: AI/Codex 채팅, 예산 화면, 예약 문서·즐겨찾기 자료 화면, 가져오기/내보내기, Community Edition 로그인. 원래 요청은 로그인→내 여행 중심이며 이 기능들까지 완성했다고 말하지 않는다. 특히 AI 기능을 확장해도 유료 API fallback을 추가하면 안 된다.

## 서버 실행 명령

웹 개발 서버 (기본 3002):

```sh
cd /Users/mini-mingeon/Travel/AIRO-app
npm ci                     # 다른 Mac에서 node_modules가 없을 때
npm run dev
```

접속: `http://localhost:3002`. Android 에뮬레이터에서 Mac 서버는 `http://10.0.2.2:3002`로 접근한다. 다른 기기 접속이 필요하면 기존 서버를 종료한 뒤 아래처럼 호스트를 지정할 수 있다.

```sh
npm run dev -- --hostname 0.0.0.0
```

주의: `npm run dev`는 실제 `.env.local`이 있으면 그 계정 저장소를 사용한다. 단순 서버 실행은 AI 호출이 아니지만, API 테스트는 로컬 fixture를 별도로 구성하고 유료 API 키를 명시적으로 비워야 한다. 자격증명 내용을 메모·터미널 출력·Git에 복사하지 않는다.

기존 운영 빌드 실행 (재배포 명령 아님):

```sh
npm run start              # 이미 준비된 .next 빌드가 있을 때, 포트 3002
```

웹 dev/start는 동시에 같은 포트를 사용할 수 없다. 운영 프로세스나 다른 프로젝트의 서버를 임의 종료하지 않는다.

## Android 실행·검증 명령 (재개 후 실행)

이번 Mac에서 사용한 JDK/SDK:

- JDK: `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
- SDK: `/tmp/airo-android-toolchain/sdk`
- Gradle 캐시: `~/.gradle/`
- 로그: `/tmp/airo-android-toolchain/gradle-init.log`, `sdk-install.log`

**SDK와 로그는 `/tmp`라 재부팅/다른 Mac 이전 후 없어질 수 있다.** Android Studio에서 SDK 36·Build Tools를 설치하고 실제 경로로 `ANDROID_HOME` 또는 `android/local.properties`의 `sdk.dir`를 지정한다. `local.properties`는 Git 제외다. 이 Mac에는 Android Studio가 없어서 임시 SDK를 다운로드했다.

```sh
cd /Users/mini-mingeon/Travel/AIRO-app/android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/tmp/airo-android-toolchain/sdk
./gradlew :app:assembleDemoDebug :app:assembleCloudDebug --console=plain
./gradlew :app:lintDemoDebug :app:lintCloudDebug --console=plain
```

로컬 서버를 사용하는 Cloud APK:

```sh
./gradlew :app:assembleCloudDebug -PairoBaseUrl=http://10.0.2.2:3002 --console=plain
```

APK 경로 (16:14 생성 확인):

- `android/app/build/outputs/apk/demo/debug/app-demo-debug.apk`
- `android/app/build/outputs/apk/cloud/debug/app-cloud-debug.apk`

데모는 웹 서버 없이 로그인 화면의 ‘샘플 여행 둘러보기’로 진입한다. Cloud 빌드는 실제 서버와 Supabase redirect 설정이 필요하다. 운영 서버 호출 전에 배포 여부와 과금 규칙을 다시 확인한다.

## 종료 정리와 체크포인트

- 이번 세션에서 웹/운영 서버를 시작하지 않았다.
- 이미 실행 중이던 AIRO-app 개발 서버 PID 28609 (포트 3002)와 다른 Next.js 서버는 사용자의 기존 프로세스이므로 건드리지 않았다.
- 이번 Gradle 준비로 생성된 유휴 daemon PID 24458에 종료 신호를 보냈다.
- SDK 다운로드/설치와 Gradle 준비 세션은 종료되어 진행 중인 빌드는 없다.
- `.backups/android-native-2026-09-17.tar.gz`에 변경 파일의 현재 내용과 이 메모를 묶는다. 비밀 환경 파일, 사용자 데이터, node_modules, Gradle/build 캐시는 포함하지 않는다.
- `.backups/android-native-2026-09-17.patch`는 기존 추적 파일 3개의 diff다. 신규 파일은 위 tar.gz에 들어 있다.
- `.backups/android-native-2026-09-17.sha256`으로 아카이브 무결성을 확인할 수 있다.
- `.backups/` 자체도 Git 제외이므로 다른 Mac으로 옮길 때 명시적으로 복사해야 한다. 아카이브를 기존 작업 위에 무조건 풀지 말고 변경 상태를 비교한다.

재개용 한 문장:

> `docs/ops/ANDROID_NATIVE_HANDOFF_2026-09-17.md`의 최신 재개 결과를 읽어라. Kotlin·Compose·MapLibre로 Mapcn 같은 다크 UI를 만드는 중이며 데모·Cloud APK 컴파일과 Lint까지 통과했다. 다음은 앱 실행 검증이지만, 사용자가 단위별 승인을 요구했으므로 허락 없이 다음 단위를 시작하지 마라. 17:00 외출 예정으로 16:50부터는 새 단위를 시작하지 않는다. 별도 유료 API도 허가 없이 사용하지 마라.

## 참고한 1차 자료

- 저장소 `AGENTS.md`, `BRAND.md`, `DESIGN.md`, `node_modules/next/dist/docs/`의 Route Handlers/Proxy 가이드.
- [Android AGP 8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [Compose BOM](https://developer.android.com/develop/ui/compose/bom)
- [Mapcn API](https://www.mapcn.dev/docs/api-reference)
- [MapLibre Native MapView](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.maps/-map-view/index.html)
- [Supabase native deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
