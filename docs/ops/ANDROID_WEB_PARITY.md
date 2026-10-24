# Android 0.3.2 — 최신 웹 지도·일정 동작 반영

현재 배포: **0.3.8 / code 11**. [현재 위치 버튼 검증](CURRENT_LOCATION.md)을 우선 참고한다. [선택형 일정·경로·MCP](STOP_CHOICES.md)도 유지한다. [즉시 체크·시간/GPS·완료 경로 제외](ANDROID_PROGRESS_RESPONSE.md)도 유지한다. 아래 이전 버전 기록은 유지한다.

2026-09-18, versionCode 5. 기준은 운영 `itinerary-progress-20260918`와 Aside에 열린 실제 여행 화면이다. Kotlin/Compose와 MapLibre Android로 구현했다.

## 바뀐 동작

| 웹 기준 | Android 0.3.2 |
| --- | --- |
| 장소 간 도로 경로 자동 표시 | 여행 진입·날짜 변경 즉시 저장 경로를 사용하고 없는 구간만 기존 무료 Valhalla 서버 경로로 조회. 구간별 실패·재시도, 날짜별 캐시, 취소된 응답 차단. |
| 항공 구간 | 지도에 점선 곡선 표시. 날짜변경선은 짧은 방향으로 연결. 일차마다 장소 번호 재시작. |
| 왼쪽 Day 패널 | 모바일은 전체 지도 위 패널, 넓은 화면은 왼쪽 열. 접기·펼치기, 이전/다음, 카드 영역 스와이프, 날짜 선택과 전체 일정. |
| 장소 선택 | 지도 위 왼쪽 아래 카드, 선택한 핀에 초점. 날짜·선택·카메라 상태 복원. 장소명/검색어 복사, 국내 네이버·카카오, 해외 구글지도·길찾기, 연결된 PDF·예약. |
| 경로 따라가기 | 준비된 실제 도로/항공 경로에서 이동 마커 재생. 중지·날짜 변경·앱 백그라운드에서 취소. Android 애니메이션 비활성 설정 존중. |
| 일정 진행 | 직접 체크, 시간/위치/둘 중 하나의 자동 체크, 시간대·도착 범위, 수동 해제 후 자동 체크 일시정지. 같은 서버 revision/RLS 사용. |
| 위치 권한 | ‘위치 자동 체크 시작’에서만 요청. 전경 여행 화면에서만 수집, 일시중지 시 해제. 정확도·위치 시각·여행 날짜를 확인하고 이동 이력은 저장하지 않음. |
| 출국 전날 Todo | Day 0/Day 1에서 진입. 분류·추가·체크·삭제, 저장 충돌 시 초안 유지, 미저장 닫기 확인. |
| QR·이미지 자료 | Todo와 자료 화면에서 기존 저장 PNG/JPEG 조회·네이티브 확대·이동·원본 사이트 연결. JSON 가져오기/내보내기도 원본 보존. 웹과 마찬가지로 이 목록에는 직접 이미지 업로드 버튼이 없음. |

PDF 추가·미리보기, 예약·예산 연결, 외부 공유와 설정의 앱 업데이트는 기존 기능을 유지한다. APK는 이전 버전과 같은 개발 인증서로 서명한다. 정식 스토어 배포본은 아니다.

## 검증

- Cloud/Demo JVM 테스트 각 39건, Android Lint 오류 0건, 양쪽 APK 빌드.
- 전용 Android 16 에뮬레이터의 390dp, 320dp/글꼴 150%, 1024dp 화면 검사.
- MapLibre의 실제 렌더된 `airo-route-line`/`airo-moving-pin` feature로 자동 경로와 재생을 검사. Day 패널·선택 카드·지도 이동·회전/재생성·직접 완료·Todo 저장, 네이티브 이미지 디코딩/확대 확인.
- 기존 Android 파일 선택→PDF 미리보기→장소 연결→예약/예산, 공유 수신, 여행 JSON 내보내기/가져오기 회귀 검사.
- 격리된 PostgreSQL/PostgREST/Auth 통합에서 routes/progress/predeparture/images의 JWT 계정 격리, 비인증 차단, revision 충돌, CSRF, 이미지 원본/해시 확인. 모델 호출·메일 발송·별도 과금 호출 0건.
- 실제 운영 계정으로는 Aside의 화면과 읽기 API를 확인한다. 실제 Android Google 로그인, 사용자의 PC 구독 작업, 현장 GPS 자동 체크는 휴대폰 E2E 확인 대상이다.

증거: `.private/deployment/android-web-map-20260918/`. 이전 점검 문서는 당시 상태를 설명하는 이력이며 현재 완료 여부는 이 문서를 기준으로 한다.

## 웹 업데이트를 놓치지 않기

`node scripts/check-android-web-parity.mjs`로 배포 전 웹 기준 변경을 확인한다. `android/web-ui-reference.json`의 33개 화면·동작 소스가 바뀌면 실패하며, 네이티브 반영과 화면 검증 후에만 기준 해시를 갱신한다. 해시 통과가 모든 기능의 1:1 동등성을 보장하지는 않는다.

범위 밖에 남는 차이: 웹의 데스크톱 3열 동시 채팅, 저장 장소 사진의 인라인 표시 등은 앱과 화면 구성이 다르다. 웹 서버는 앱의 인증·저장·API도 담당하므로 이 릴리스가 서버 코드 삭제의 근거는 아니다. 실제 로그인/구독 연결과 현장 위치 동작은 [운영 E2E](ANDROID_E2E.md)로 확인한다.

## 출처

로마 데모의 5개 구간은 무료 Valhalla/OSM 실제 도로 geometry를 2026-09-18 조회해 번들로 저장했다. 데모 실행 중 경로 API를 호출하지 않는다. 한국 지도 제공자 선택은 웹의 Natural Earth public-domain 경계와 같은 좌표·연안 여유·섬 판정을 사용한다. `south-korea-rings.json`은 `src/lib/south-korea-boundary.ts`에서 변환했으며 출처는 https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/ 이다.

## 배포 결과

- 운영 배포본: `android-web-map-20260918`, 웹 build ID `ZxaV4nhB8iGG6roKfQDcJ`. 직전 최신 웹에서 모바일 API 3개 파일만 추가·수정했다. DB migration 추가 없음.
- Cloud 0.3.2: 70,582,056 bytes, SHA-256 `883cc5ecc4283e665bc852ce99f04db7b4f0b1aa8777c02cfa95ebe948acf703`.
- Demo 0.3.2: 70,756,695 bytes, SHA-256 `001b39dfc9e837eeda0608e949ba2ffe6c6bf41ceab8e0e877fe26cf2d9e5605`.
- 공개 HTTPS에서 두 APK 전체 다운로드·해시 일치, manifest versionCode 5, 비인증 401과 로그인된 운영 읽기 API 200을 확인했다.
- 최종 화면 회귀: 390dp 11건, 320dp/글꼴 150% 4건, 1024dp 3건 통과. JVM Cloud/Demo 각 39건 통과. Lint 오류 0, 기존 의존성·코드 스타일 등 경고 각 36건.

공개 Demo 0.3.1에서 설정의 업데이트 확인→공개 APK 다운로드/검증→프로세스 종료 후 설치 파일 복원→Android 설치 권한/설치 승인→0.3.2 실행을 실제 에뮬레이터에서 완료했다. 로그인과 직접 만든 여행이 유지됐으며 재확인 결과 최신 버전으로 표시됐다. 기록: `upgrade-e2e.json`.
