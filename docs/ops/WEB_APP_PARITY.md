# Android 0.3.5 기능의 웹·PWA 대응

2026-09-18. 기준: `ANDROID_NATIVE_LINKS.md`, `ANDROID_WEB_PARITY.md`, `ANDROID_PROGRESS_RESPONSE.md`의 앱 기능. 기존 웹의 지도, 날짜 스와이프, 진행 체크, PDF·QR 모달을 유지하며 다음 동작을 연결했다.

| 앱 동작 | 웹·PWA 대응 |
| --- | --- |
| Day 패널 전체 접기 | 휴대폰 카드와 데스크톱 일정 열 모두 접고 복원. 계정·여행별 접힘 상태를 브라우저에 저장한다. 데스크톱 지도는 빈 공간을 사용한다. |
| 전체 일정 복귀 | 장소 상세의 `전체 일정 보기`, Todo 헤더의 돌아가기 버튼. 장소 선택과 날짜 필터를 해제한다. |
| 현지명 복사 | 장소명은 한 줄로 표시. 복사는 저장된 `map_query`가 있으면 그 값을, 없으면 표시 이름을 사용한다. 번역 호출 없음. |
| Todo 패널·확대 | Day 0·Day 1 Todo가 현재 Day 패널 내용을 바꾼다. 크게 보기/작게 보기에서 체크·분류·입력 초안을 유지하고, 미저장 닫기·저장 충돌·최신 목록 교체를 처리한다. 확대 창 안의 PDF/QR 뷰어는 별도 모달이다. |
| 예약 앱 연결 | Android의 사용자 클릭에서 허용된 Trip.com·Agoda·Booking.com·Airbnb·Expedia 패키지로 HTTPS intent를 전달하고 동일 예약 주소를 fallback으로 유지한다. 기타 기기는 기존 HTTPS 링크를 사용한다. Trip.com `wkp=1` 유지. 해시(fragment)가 있는 URL은 원래 HTTPS 링크를 사용한다. |
| 삼성월렛 | QR·이미지 영역에서 공식 안내·설치 링크를 제공한다. 웹에서 설치 탐지, 일반 앱 실행, 패스 등록을 구현했다고 표시하지 않는다. |
| 캘린더 추가 | 장소명·현지명·위치·Day 날짜가 담긴 `.ics` 파일. 설정 시간대의 시간을 UTC로 변환하고, 시간이 없으면 종일 일정이다. 기기 캘린더에서 최종 저장한다. 시작일 미정은 비활성화한다. |
| 장소 사진 연결 | 사용자가 선택한 JPEG/PNG/WebP 원본 바이트를 IndexedDB에 보관. 계정·여행·장소 분리, SHA-256 중복 방지, 한 번에 10장/장소당 20장, 파일당 20 MiB. 썸네일·확대·원본 저장·연결 해제를 지원한다. 사진은 이 브라우저에만 남으며 서버 업로드·앱/다른 기기 동기화·JSON 내보내기를 하지 않는다. 사이트 데이터 삭제나 브라우저 정리로 제거될 수 있다. |
| PDF 첨부·장소 연결 | 자료 페이지와 장소 상세에서 `PDF 추가·예약 관리`로 진입. 로컬 원본 미리보기 후 2 MiB 이하 PDF를 첨부하고 여러 장소에 연결한다. 기존 원본 재업로드 없이 연결을 수정한다. |
| 예약 편집·예산 | 예약 상태와 결제 상태, 실제 HTTPS 주소·예약 번호·메모·장소·PDF 연결. 충돌 시 초안을 유지하고 명시적인 최신 예약 교체 후 저장한다. `예산에 연결`은 기존 연결 항목을 편집하거나 입력 폼을 채운다. 금액·환율은 사용자가 입력하며 중복 연결을 차단한다. |
| 진행 체크 즉시 반영 | 연속 체크/취소를 서버 응답 전에 숫자·목록·핀에 반영. 한 번에 한 요청만 저장하며 미전송 항목의 마지막 의도를 유지한다. 409는 최신 상태 위에 다시 적용하고 최대 2회 재시도. 저장 후 응답 유실은 서버 재조회로 확인하고 실패한 변경만 복원한다. |
| 남은 경로 | 완료 핀은 초록 체크로 남기고 도로/항공/재생 경유지에서는 제외. 중간 장소 완료 시 남은 앞뒤 장소를 연결하고, 취소 시 기존 캐시를 재사용한다. 완료한 도착지를 건너뛰어도 항공 이동을 육상 경로로 바꾸지 않는다. 남은 장소가 2개 미만이면 재생을 끈다. |
| Day 전체 체크 방법 | 표시한 일정 전체에 직접/시간/위치/위치 또는 시간을 적용한다. 시간이 없으면 ‘위치 또는 시간’은 위치만, ‘시간’은 해당 장소를 제외한다. 시간 조건은 전경에서 매초 검사하며 GPS 신선도·오차·실제 여행 날짜·수동 해제 우선순위를 유지한다. |
| 변경 이력 | 목록·페이지 이동·변경 전후·장소/PDF 이름 표시·확인 후 되돌리기. 검토 당시 최신 변경 ID와 서버의 충돌 검사를 사용한다. |

관리 페이지는 `/app/[tripId]/manage`, 장소 지정은 `?stopId=...`, 이력은 `?tab=history`다. 이미 운영 중인 `/api/mobile/trips/[tripId]/{resources,documents,reservations,changes}`를 브라우저 쿠키 인증으로 함께 사용한다. 앱 bearer 인증·RLS·CSRF·revision 및 기존 DB 구조를 유지한다. 새 유료 API, 모델 호출, 캘린더 계정 연결은 추가하지 않았다. 운영 확인에서 이력 목록이 첨부 원본이 포함된 큰 audit JSON을 매번 읽어 시간 제한에 걸리는 문제를 확인해 `0015_history_summary.sql`을 적용했다. 변경 항목명만 저장한 generated column으로 목록을 읽으며 기존 원본 이력·RLS·되돌리기 데이터는 보존한다. Android 자체 APK 설치·시스템 공유 수신은 웹 화면 기능과 별도다.

사진은 브라우저의 Blob/File 저장 호환성 차이를 피하기 위해 원본 ArrayBuffer와 MIME을 보관하고 읽을 때 Blob으로 복원한다. 원본 내용을 재인코딩하지 않는다. 캘린더는 RFC 5545의 UTC/종일 표현, DST 중복·누락 시각, UTF-8 75바이트 줄 접기와 제어문자 이스케이프를 검사한다.

검증 경로: `scripts/test-progress-queue.mjs`, `scripts/test-web-app-parity.mjs`, `scripts/test-workspace-ui.mjs` 및 `check-web-management-ui.mjs`, `scripts/test-mobile-api.mjs`, `test-workspace-data.mjs`, `test-mcp-local.mjs`. 브라우저는 합성 PDF·사진·모의 GPS와 차단된 외부 네트워크를 사용한다. HTTP 통합 테스트는 로컬 PostgreSQL·PostgREST·가짜 인증 서버로 웹 쿠키 저장/앱 조회, 계정 격리, CSRF·충돌·원본·이력 복원을 검사한다. 운영 계정에서는 읽기와 화면 탐색만 확인한다.

기존 `android/web-ui-reference.json` 해시는 이 웹 작업에서 갱신하지 않았다. Android 세션이 독립적으로 검토·기록한 기준은 보존한다. APK·업데이트 manifest는 최신 운영 릴리스의 파일을 그대로 보존한다.

근거: [Chrome Android intents](https://developer.chrome.com/docs/android/intents), [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [브라우저 저장 한도와 삭제](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [삼성월렛 공식 안내](https://www.samsung.com/sec/apps/samsung-wallet/).

운영 배포: 2026-09-18, `.private/releases/web-app-parity-20260918`, build `tZePJTDKKjfVcg3x44h2M`. Android 0.3.5/code 8 다운로드 파일 34개를 유지했다. 배포·DB 검증 및 롤백 자료는 `.private/deployment/web-app-parity-20260918/`에 있다.
