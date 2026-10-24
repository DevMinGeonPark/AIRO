# Android 앱 내부 업데이트

현재 배포: **0.3.8 / code 11**. [현재 위치 버튼 검증](CURRENT_LOCATION.md)을 우선 참고한다. [선택형 일정·경로·MCP](STOP_CHOICES.md)도 유지한다. [즉시 체크·시간/GPS·완료 경로 제외](ANDROID_PROGRESS_RESPONSE.md)도 유지한다. 아래 이전 버전 기록은 유지한다.

2026-09-18, **0.3.1 / versionCode 4**. 위치: **내 정보 → 설정 → 앱 업데이트**.

0.3.2 / versionCode 5부터 공개 업데이트 경로를 검증했다. 최신 버전은 위 현재 배포 표기를 따른다. 아래는 0.3.1에서 도입한 업데이트 기능의 설계·검증 이력이다. [0.3.2 변경 내용](ANDROID_WEB_PARITY.md).

## 사용자 흐름

1. **업데이트 확인**: 현재 버전과 최신 여부, 새 버전의 변경 내용·파일 크기를 표시한다. 자동 확인이나 자동 다운로드는 하지 않는다.
2. **업데이트 다운로드**: 진행률과 취소 버튼. 실패/취소 후 다시 시작할 수 있다. 완료된 설치 파일은 앱 재실행 후 복원한다. 중단된 일부 파일은 이어 받지 않고 정리한다.
3. **지금 설치**: 기기에 설치 권한이 없다면 설명 후 Android의 해당 앱 ‘이 출처 허용’ 설정을 연다. 돌아와 다시 지금 설치를 누르면 Android 패키지 설치 화면에서 사용자가 승인한다. 취소해도 파일을 유지한다.
4. 기존 앱 위에 같은 서명으로 설치하므로 로그인·로컬 여행을 유지한다. 업데이트 완료 후 현재 버전 표시가 바뀐다. 앱 자체가 백그라운드에서 조용히 설치하는 방식은 아니다.

**0.3.0 이하는 이 기능이 없으므로 [Cloud 0.3.1 APK](https://airo.dev-heptivision.com/downloads/airo-android-cloud-0.3.1.apk)를 한 번 직접 설치해야 한다.** 앱을 삭제할 필요가 없다. 지금 배포본은 기존과 같은 개발 인증서이며 스토어 배포본이 아니다.

## 배포와 검증 경계

- 고정 주소: `https://airo.dev-heptivision.com/downloads/airo-android-latest.json`. 계정 토큰을 보내지 않으며 Community 서버 설정과 독립적이다. HTTP/HTTPS 리다이렉트를 따르지 않는다.
- 메타데이터는 64KiB, APK는 200MiB 이하. 현재 앱 ID·flavor·Android 최소 버전·증가한 versionCode를 확인한다. 파일명은 `airo-android-{cloud|demo}-{숫자.숫자.숫자}.apk`만 허용한다.
- APK는 전용 private cache로 스트리밍한다. 크기·SHA-256·실제 APK 패키지/버전/최소 SDK·현재 설치 인증서와의 일치를 확인한다. 설치 직전 및 완료 파일 복원 시 다시 검증한다. FileProvider는 `updates/packages/`만 읽기 공유한다.
- 설치 허용은 Android의 사용자 설정과 설치 확인 화면을 따른다. 권한 취소, 화면 종료, 파일 유실 시 재시도가 가능하다.
- 별도 과금 API, AI 모델 호출, 메일 전송은 사용하지 않는다. 사용자 요청으로 공개 배포 파일만 내려받는다.

## 다음 버전 준비

1. `android/app/build.gradle.kts`에서 versionName과 versionCode를 올리고 Cloud/Demo를 함께 빌드·검증한다. 이전 앱과 같은 서명 인증서를 유지한다.
2. 배포 문구를 JSON 문자열 배열로 저장한다. 예: `["예약 편집 개선", "지도 오류 수정"]`.
3. 저장소 루트에서 아래 명령으로 APK·버전별 메타데이터·고정 최신 메타데이터를 함께 준비한다.

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
./android/gradlew -p android :app:assembleCloudDebug :app:assembleDemoDebug
node scripts/prepare-android-update.mjs --notes /path/to/release-notes.json
```

스크립트는 APK의 실제 버전/앱 ID, 기존 개발 인증서, APK 서명과 16KiB zip 정렬을 확인한다. 버전 역행·같은 versionCode의 다른 파일·이미 준비한 APK 덮어쓰기를 거부한다. APK를 먼저 쓰고 `airo-android-latest.json`을 마지막에 원자적으로 교체한다. `--output PATH`로 별도 배포 준비 디렉터리를 지정할 수 있다. 현재 스크립트는 **개발 인증서 배포 채널 전용**이다.

4. 현재 운영 LaunchAgent의 WorkingDirectory를 재확인하고, 검증한 신규 APK 두 개·버전별 JSON·최신 JSON을 해당 release의 `public/downloads/`에 같은 순서로 반영한다. 동시 진행 중인 웹 릴리스를 이전 경로로 되돌리지 않는다. Next.js가 새 public 경로를 발견하지 못하면 현재 설정 그대로 프로세스를 재시작하고 health를 확인한다.
5. 공개 최신 JSON과 두 APK를 다시 읽어 크기·SHA-256을 확인한다. 새 버전 앱에서는 최신 상태, 이전 updater 지원 앱에서는 다운로드/설치 흐름을 확인한다.

## 검증 기록

진행 증거: `.private/deployment/android-updater-20260918/`. 테스트는 전용 `airo-updater-api36` 에뮬레이터와 가짜 계정을 사용한다. 실제 계정·휴대폰 확인은 [E2E 목록](ANDROID_E2E.md)의 14번을 따른다.

- Cloud/Demo 단위 테스트 각 31개 통과: 버전/flavor/경로 제한, 용량/해시/검증 실패, 리다이렉트 거부, 취소와 재시도, 완료 파일 복원·변조 감지, 설치 요청 상태.
- Cloud/Demo Android Lint 오류 0건. 경고 각 30건(기존 28건과 저장 공간 API/KTX 스타일 권고 2건).
- 390dp에서 업데이트 화면 1건, 320dp·글자 150%에서 업데이트 화면과 기존 프로필/로그아웃 동선 2건 통과. 최신 상태·연결 오류·재시도·취소·설치 권한 안내/거부 후 복귀를 포함한다.
- 공개 APK를 사용하는 설치 E2E 통과. 현재 updater 소스를 별도 디렉터리에 복사해 versionCode 3으로 만든 비공개 시험 앱에서, 공식 최신 메타데이터 확인 → 공개 Demo 0.3.1 다운로드/서명 검증 → 강제 종료 후 완료 파일 복원 → Android 설치 권한 설정 → 패키지 설치 승인 → versionCode 4 확인 → 앱 열기/재실행 → 기존 데모 로그인과 직접 만든 `Updater persistence E2E` 여행 보존 → 최신 버전 표시까지 확인했다. 0.3.0 배포본에 업데이트 기능이 있었다는 뜻은 아니다. 설치 완료 화면의 `Open`을 눌러 나오는 단계는 검사 스크립트에 반영했다.
- 운영은 당시 최신 웹 release `visit-japan-qr-20260918`의 다운로드 파일만 추가했다. 빌드 ID `sC6cyiEerbwqgmJGwcSGp`와 기존 서비스 설정을 유지하고 public 경로 인식을 위해 현재 프로세스만 재시작했다. 로컬 인증 설정 health 200, 공개 manifest 200/Cloudflare DYNAMIC, 두 APK 전체 다운로드 크기·해시 일치를 확인했다.

| 배포본 | 크기 | SHA-256 |
| --- | ---: | --- |
| Cloud 0.3.1 | 70,305,359 bytes | `1a5b92925e625bedee3c0f53881496a6e624f622ebf60f54667786be94d4bf77` |
| Demo 0.3.1 | 70,305,379 bytes | `2023b001e21772206822c910fee76ab8e9e286fa6c95c817f5b2140243c4090d` |

주요 증거: `build-unit-lint.log`, `ui-390.log`, `ui-320.log`, `upgrade-e2e.json`, `upgrade-e2e-resume.log`, `public-checks.json`, `update-ready.png`, `update-current.png`. 전용 에뮬레이터 외의 실기기·계정은 사용하지 않았다.

- Android 설치 API 근거: [설치 권한 확인](https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls()), [앱 서명 정보](https://developer.android.com/reference/android/content/pm/SigningInfo).

## 0.3.2 후속 설치 검증

공개 Demo 0.3.1/code 4 → 공개 Demo 0.3.2/code 5를 앱 설정에서 다운로드하고 실제 Android 설치 화면으로 업데이트했다. 다운로드 검증·강제 종료 후 복원·설치 권한·사용자 승인·로그인 및 사용자 생성 여행 유지·설치 후 최신 버전 확인을 통과했다. `.private/deployment/android-web-map-20260918/upgrade-e2e.json`.
