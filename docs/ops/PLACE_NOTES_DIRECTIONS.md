# 길찾기와 장소 메모 읽기 개선

2026-09-21. 웹과 Android 소스에 반영한 변경이며 공개 배포·앱 업데이트 게시 전이다.

- 해외 길찾기는 목적지와 `dir_action=navigate`만 전달한다. AIRO의 지도 중심, 마지막 GPS 좌표, 일정의 이전 장소를 출발지로 보내지 않는다. Android는 `com.google.android.apps.maps`를 먼저 열고 미설치 시 동일한 HTTPS 링크를 시스템에 전달한다. 국내 지도 링크는 기존 방식이다.
- 기존 코드도 출발지 좌표를 지정하지는 않았다. 이번 수정은 일반 URL 실행에서 구글 지도 앱 우선 실행으로 바꾸고 현재 위치 탐색 옵션을 추가한 것이다. 실제 기기에서 사용자가 겪은 출발지 오류의 원인까지 재현한 것은 아니다.
- 장소 카드의 아래에 묻혔던 메모를 위로 옮겼다. 첫 세 줄과 명시적으로 적은 PIN을 미리 보여주고, 펼치기를 누르면 오른쪽 전체 높이 패널을 연다. 숙소 정보와 예약 메모에도 적용한다.
- `PIN: 0012#`, `출입 비밀번호: *7890#`, `Door code: AB-123` 등의 표기만 코드로 강조한다. 앞자리 0과 키패드 기호를 유지하며, 예약번호·객실번호·날짜에서 PIN을 추측하지 않는다. 여러 코드가 있으면 패널에 각각 표시한다. PIN 복사, 원문 선택, 긴 메모 전체 읽기, 고정 닫기 버튼, 시스템 뒤로가기/Escape, 웹 열기 버튼으로의 포커스 복귀를 지원한다.
- 글 입력란과 본문의 여백·줄간격을 늘렸다. 원문과 저장 형식은 유지한다. 미리보기는 원문의 앞부분이며 AI 요약이 아니다. 모델 호출, 별도 과금 API, 서버 데이터 변경은 없다.

## 검증

- Cloud/Demo 단위 검사 각 53건 통과. PIN 인식·오인식 방지·앞자리 0·문자 기호·문서 끝 PIN, 길찾기 목적지 인코딩과 출발지 미전달을 포함한다.
- Cloud/Demo APK 빌드, Android Lint 오류 0건(경고 각 40건).
- 전용 읽기 전용 에뮬레이터에서 390dp 및 320dp, 글자 크기 150%로 PIN 복사·메모 마지막 문단·닫기·뒤로가기·구글 앱 지정과 미설치 fallback 검사 통과. 실행한 Maps intent는 가짜 Context에서 수집하며 외부 지도/경로 API를 호출하지 않는다.
- 웹 Chromium 1440/390px, WebKit 320px에서 PIN 강조·복사·본문 끝 스크롤·고정 닫기·Escape·포커스 복귀·숙소 패널 안에서 메모 열기/복귀·입력란 높이·가로 넘침 검사 통과. 네트워크는 로컬 fixture 외에 차단했다.
- TypeScript와 변경 웹 파일 ESLint 통과. 증거: `.private/validation/place-note/`.

실제 휴대폰에서 구글 지도가 가져오는 GPS 위치와 위치 권한 상태는 확인하지 않았다. 위치를 사용할 수 없으면 구글 지도에서 출발지 입력 또는 경로 미리보기가 표시될 수 있다.

공식 동작 근거: [Google Maps URL referral](https://developers.google.com/maps/architecture/maps-url), [Android Google Maps intents](https://developer.android.com/guide/components/google-maps-intents).

재검사: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-place-note-ui.mjs`, Android `PlaceNoteTest` 및 `PlaceNotePanelTest`.
