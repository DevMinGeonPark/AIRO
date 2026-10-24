# MCP 자료 관리와 PWA 일차 이동

MCP 도구가 12개에서 25개로 확장됐다. 2026-09-18 운영 Supabase에 `supabase/migrations/0010_trip_management.sql`을 적용하고 `.private/releases/mcp-management-20260918`(빌드 `KKVitL-mw_awO8H_1EZRz`)을 배포했다. 공개 `https://airo.dev-heptivision.com/api/mcp`에서 OAuth PKCE 인증 후 실제 `tools/list` 25개를 확인했다. 다른 Cloud/Community 환경도 기존 마이그레이션 다음에 `0010`을 적용해야 한다. 데모 저장소에서는 새 자료 관리 도구가 DB 연결 필요 오류를 반환한다.

같은 날 추가한 장소 상세 자료 연결은 `0011_stop_attachments.sql`도 필요하다. PDF의 `stopIds`, 예약의 `bookingUrl`·`documentSha256s`·`stopIds`를 지정하면 사용자 화면에서 PDF 보기·예약 열기를 제공한다. [장소 자료 연결과 운영 검증](STOP_ATTACHMENTS.md)에 필드와 동작을 정리했다.

| 기능 | 도구 | 저장 위치 |
| --- | --- | --- |
| PDF 첨부·원본 조회 | listDocuments, attachDocument, getDocument | trip_archives.data.documents |
| 예약·결제 상태 | getReservations, setReservation | trip_archives.data.reservations |
| 예산 항목 등록·수정 | getBudget, addBudgetEntry, updateBudgetEntry | 기존 expenseBudget |
| 변경 이력·복원 | listChanges, getChange, revertChange | trip_changes |
| 알림 설정 | getNotificationSettings, updateNotificationSettings | trip_archives.data.notificationSettings |

PDF는 SHA-256으로 식별하며 동일 파일 재첨부를 중복 저장하지 않는다. 첨부 한도는 파일당 2 MiB, 여행당 20개, 전체 보관 자료 8 MiB다. MCP JSON 요청은 base64를 포함할 수 있도록 3 MiB까지 받는다. getDocument는 MCP의 PDF blob 리소스로 원본을 반환하며 `airo://trips/{tripId}/documents/{sha256}`으로도 조회할 수 있다. PDF 내용 추출·OCR·URL 다운로드는 실행하지 않는다.

예약은 bookingStatus와 paymentStatus를 별도로 관리한다. setReservation은 같은 ID를 수정하거나 새 UUID로 등록한다. 예산 항목 도구도 UUID와 전체 항목을 받으며 다른 항목·예비비를 보존한다. 예산·예약·알림의 revision은 낙관적 잠금에 사용하고 복원 시에도 증가시켜 과거 편집 화면이 자료를 덮어쓰지 못하게 한다.

이력은 여행 제목·시작일, 전체 방문 순서, PDF, 예산, 예약, 알림의 변경을 트랜잭션 단위로 기록한다. 앱의 기존 편집 경로도 DB 트리거로 기록한다. 기존 자료의 소급 이력, 채팅, 여행 전체 삭제 복구는 포함하지 않는다. 클라이언트는 이력을 직접 수정·삭제할 수 없다. 복원은 최신 이력 ID와 변경 이후 값이 현재 값과 일치할 때만 수행하며, 복원도 새 이력이 된다. 이력 조회는 PDF base64를 제외한다.

알림은 설정만 저장한다. `delivery: "not_configured"`를 반환하며 푸시·메일·문자 발송, 백그라운드 유료 호출은 추가하지 않는다. 모든 새 도구는 기존 trips:read/trips:write와 소유자 RLS를 따른다.

PWA의 일정 목록·날짜 이동 영역·지도 위 날짜 카드에서 왼쪽 스와이프는 다음 날, 오른쪽 스와이프는 이전 날이다. 처음과 마지막에서는 멈춘다. 실제 지도 캔버스, 날짜 칩의 가로 스크롤, 세로 스크롤, 여러 손가락 동작, 편집 폼은 일차 이동 대상으로 삼지 않는다. 버튼으로도 동일하게 이동할 수 있다.

날짜는 저장된 여행 시작일을 기준으로 표시하고, 시작일이 없으면 기기의 오늘 날짜를 1일차로 표시한다(시작일을 자동 저장하지 않음). 오늘 표시와 최초 선택 일차는 기기의 현지 날짜를 사용한다. 자정과 앱 복귀 시 갱신하며 사용자가 이미 선택한 일차는 유지한다. 날짜 계산은 날짜 전용 UTC 연산으로 DST 오차를 피한다.

검증: `npm run test:mcp:local`, `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-workspace-data.mjs`, `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-trip-calendar.mjs`, `node scripts/test-workspace-ui.mjs`, TypeScript·변경 파일 ESLint. DB는 PGlite, 브라우저 API는 모의 응답으로 검증하며 유료 API를 호출하지 않는다.
