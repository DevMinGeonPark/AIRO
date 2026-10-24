# 선택형 일정과 경로

2026-09-19. 웹/서버 및 Android **0.3.6 / versionCode 9**. 배포 증거는 `.private/deployment/stop-choices-20260919/`에 기록한다.

## 사용자 동작

“숙소 → 12:00 점심 → 다음 일정”에서 점심을 한 번호로 두고 2~8개 식당을 후보로 저장한다. Day·시간·순서를 공유하며 첫 후보를 임의로 확정하지 않는다. 후보 핀은 같은 일정 번호를 사용한다. 일정 칸이나 후보 핀을 누르면 후보 목록과 점선 도로 경로를 표시한다. 후보를 선택하면 해당 장소로 실선 경로를 계산하며 다른 후보도 보관한다. 선택 변경 및 “선택 해제 · 다시 고르기”를 지원한다.

선택 전에는 그 칸을 통과하는 확정 경로·경로 재생·수동/시간/GPS 완료 처리를 막는다. 선택을 바꾸면 이전 장소의 완료 체크가 해제된다. 선택한 뒤에는 기존 완료 처리와 녹색 체크 핀, 완료 장소의 경로 제외가 그대로 적용된다. 기존 일반 장소는 이전 동작을 유지한다.

후보 생성·구성은 MCP를 사용한다. 웹/앱의 선택 카드에서 확정/해제하며, 기존 장소 편집에서는 Day·시간·순서를 바꿀 수 있다. 후보 이름·좌표 수정은 MCP `setStopChoices`로 수행한다.

## MCP와 HTTP

| 도구 | 입력과 동작 |
| --- | --- |
| `addChoiceStop` | `tripId`, `label`, `kind`, `day`, 선택적 `time`, 후보 배열, `afterStopId`/`beforeStopId`/`position`, 필수 `requestId`. 한 칸을 미정으로 생성. |
| `setStopChoices` | `tripId`, `stopId`, 최신 `revision`(일반 장소는 0), `label`, `kind`, 전체 후보 배열. 기존 선택/완료 해제. |
| `selectStopChoice` | `tripId`, `stopId`, 최신 `revision`, `candidateId`. `null`이면 선택 해제. |

`kind`: `meal`, `visit`, `stay`, `other`. 후보는 고유 `id`, `name`, `lng`, `lat`와 선택적 `map_query`, `note`, `mode`를 가진다. 좌표는 실제 장소 자료에서 확인한다. `getTrip`의 `stops[].choice`에 후보·선택·revision이 포함되며, JSON 내보내기/가져오기에서도 보존한다.

`POST /api/trips/{tripId}/choices`는 추가, `PATCH`는 `action=configure|select`다. `/api/mobile/` 경유 Android bearer 인증에도 같은 권한/계정 격리를 적용한다. 후보 도로 미리보기는 기존 routes API에 후보 ID를 함께 보내며 서버가 소유 여행의 후보 좌표로 해석한다. 임의 좌표를 경로 API로 전달하지 않는다.

SQL `0016_stop_choices.sql`은 검증 트리거와 트랜잭션 RPC를 추가한다. 일정 칸 ID·순서는 유지하고 후보 변경과 완료 해제를 같은 트랜잭션으로 처리한다. 전역 증가 revision으로 변경 이력 되돌리기나 가져오기 후에도 오래된 요청이 덮어쓰지 못한다. 이전 이력의 choice 없는 행도 되돌리기와 호환된다. 일반 장소 수정 API로 선택형 좌표를 우회 변경할 수 없다.

## 로컬 Hermes / Discord travel

프로필: `~/.hermes/profiles/travel`. 기존 AIRO OAuth와 `openai-codex` 구독 설정을 유지한다. 별도 유료 API·모델 호출은 사용하지 않는다. SOUL/README에 후보 생성·확정 도구와 미정 유지 규칙을 추가했다. 서버 배포 후 게이트웨이를 재시작하고 실제 Hermes dispatcher에서 읽기 도구로 연결을 검사한다.

예: “UNPLAN Fukuoka 다음 12시 점심을 간소나가하마야 또는 하카타 겐키 잇파이 중 선택할 수 있게 묶어줘.” 운영 여행에 이 예시를 자동 추가하지 않는다.

## 검증

- 격리 PostgreSQL/MCP: 후보 검증, 재시도 중복 방지, 권한 격리, 충돌, 선택 변경 시 완료 해제, 시간/GPS 미정 제외, 이력 되돌리기와 이전 이력 호환, 내보내기/가져오기.
- 실제 HTTP 통합: 웹 쿠키/앱 bearer, 비인증 401, 다른 계정 404, 외부 Origin 403, 오래된 revision 409, 잘못된 후보 400, 후보 공유 조회.
- 브라우저: Chromium 1440/390px, WebKit 320px에서 선택·저장 대기·충돌·변경·해제·경로 표시. 네트워크는 테스트 자료로 대체한다.
- Android: Cloud/Demo JVM 각 51건 통과, Lint 오류 0건(기존/스타일 등 경고 각 40건). 전용 에뮬레이터의 390dp·320dp/글자 150%·1024dp에서 실제 Compose·MapLibre와 로컬 저장소로 후보/확정/완료 해제/재선택 검증. 타일 경계에서 분리되거나 중복 반환되는 feature는 원본 ID로 구분한다. 기존 웹 동작 및 완료 처리 회귀 6건 통과.
- 운영 DB 적용 전후 기존 여행/방문지/자료/이력 개수·내용 해시가 일치한다. 별도 과금 호출, 실제 여행 수정, Discord 검증 메시지 발송은 없다.

기기의 실제 Google 로그인·현장 GPS·설치 승인은 기존 [운영 E2E](ANDROID_E2E.md) 항목을 따른다.

## 배포 결과

- 운영 release: `stop-choices-20260919`, build ID `LsOy0zOyekA_omiZUpqrl`. 직전 `mcp-saved-places-20260919` 기준으로 선택형 기능을 추가했고 저장 장소 MCP를 유지한다.
- 공개 로그인/인증 설정/MCP 문서 200, 비인증 앱 API/MCP 401, MCP 도구 29개 확인.
- `airo-android-cloud-0.3.6.apk`: 70,762,913 bytes, SHA-256 `29e95f0097f9029efd1aa2a23312c3a9030c6dd194a10f2c1ff048515fe39576`. 공개 전체 다운로드 일치.
- `airo-android-demo-0.3.6.apk`: 70,762,927 bytes, SHA-256 `64e7fa0ef64665d56ddc71ca148810eeddeff1bcba37d49fa764066a73286020`. 공개 전체 다운로드 일치.
- Hermes 실제 클라이언트의 29개 도구 발견 및 listTrips/getTrip 통과. Android 업데이트는 **내 정보 → 설정 → 앱 업데이트**에서 설치한다.
