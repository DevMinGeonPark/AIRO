# 아이로 운영 배포

공개 주소: https://airo.dev-heptivision.com

프로젝트 경로: `/Users/mini-mingeon/Travel/AIRO-app`. 개인용 원본 경로: `/Users/mini-mingeon/Travel/AIRO`.

| 항목 | 현재 값 |
| --- | --- |
| 앱 리스너 | `127.0.0.1:3410` |
| 배포 경로 | `.private/releases/codex-bridge-20260910` |
| 배포 빌드 | `.next-codex-release` |
| 앱 서비스 | `com.heptivision.airo-app` |
| 터널 서비스 | `com.heptivision.airo-tunnel` |
| Cloudflare 터널 | `airo` |
| 터널 설정 | `~/.cloudflared/airo.yml` |
| 서비스 설정 | `~/Library/LaunchAgents/com.heptivision.airo-*.plist` |
| 로그 | `.private/logs/` |

2026-09-10 현재: Codex 플러그인으로 내 컴퓨터를 연결해 웹·모바일 여행 채팅을 처리하는 버전을 운영 3410·테일스케일 3016·보조 3402에 배포했다. 채팅에는 Codex/기기명/실제 연결 상태가 표시되며, 응답 중에는 배정된 기기 이름을 유지한다. API는 사용자가 직접 선택해야 호출한다. Google 로그인·계정 여행·기존 MCP·지도 및 예산 기능을 유지했다. 연결 구조와 설치 경로는 [CODEX_CONNECTION.md](CODEX_CONNECTION.md)에 있다.

공개 주소에서 플러그인 Git 설치·활성화와 Linux arm64 설치 스크립트의 다운로드 검증·네이티브 실행·로그인 필요 상태를 확인했다. 실제 Mac Codex 구독으로는 외부 MCP 도구 없이 가상 일정 변경과 답변을 확인했다. Chrome 1440/390 및 WebKit 320px에서 채팅 연결 상태·API 선택·대화 중지·연결 승인/해제·모바일 배치, 공개 로그인 복귀 경로와 연결 정보 유지, 기존 랜딩/Google/MCP 메타데이터를 확인했다. 사용자 컴퓨터의 연결 승인을 대신 실행하지 않았다. 기존 배포와 서비스 설정은 `.private/deployment/codex-bridge-20260910/previous-app.plist`에 보존했다.

이전 상용 전환: 실제 도로 경로 재생, 모바일 일정 시트, 주변 장소 검색·즐겨찾기, 새 여행의 예산 편집과 Google 로그인·MCP 안내를 적용했다. 기능과 검증 범위는 [COMMERCIAL_SERVICE.md](COMMERCIAL_SERVICE.md)에 정리했다.

운영 DB `0006`·`0007`·`0008`과 Supabase OAuth Server·`/app/connect`·Dynamic Client Registration·`airo_mcp_token_hook`을 적용했다. `MCP_OAUTH_ENABLED=true`, API 키 서명 설정은 미설정이다. 따라서 사용자에게 OAuth 로그인 연결을 제공하며 사용 불가능한 API 키를 발급하지 않는다. Google 로그인 제공자는 공개 설정에서 실제 활성화 상태를 확인한다.

이전 로그인 전용 릴리스 `.private/releases/login-20260910/.next-login-final`과 복구용 서비스 설정 `.private/deployment/commercial-20260910/launch-agent-before.plist`를 보존한다. 기존 `travel.dev-heptivision.com`은 원본 개인용 3401에 연결되어 있으며 새 AIRO의 별칭은 `airo-app.dev-heptivision.com`이다. 개인 자료 자동 가져오기는 하지 않았다. 아래는 과거 배포 기록이며 현재 값은 위 내용을 우선한다.

보조 주소 `https://airo-app.dev-heptivision.com`도 같은 AIRO 서비스로 연결한다. 기존 보조 DNS 레코드는 새 이름으로 변경했다. 프로젝트 폴더의 이전 이름을 가리키는 심볼릭 링크는 제거했다. 앱·터널 LaunchAgent, 미리보기 3016, 보조 리스너 3402, 개인용 3401, 개발 3001/3002가 모두 새 실제 경로에서 실행된다. 개인용 빌드는 `.next-airo-personal`, 개발 빌드는 각 프로젝트의 `.next-airo-dev`다. 실행 PID는 `.private/deployment/runtime-pids.json`에 기록한다.

2026-09-09 경로 전환 검증: 두 프로젝트 production build, 여행 파일/PDF 보존, 새 개인용 경로에서의 동일한 내보내기 결과, 이전 즐겨찾기 병합과 저장 실패 보존, 새 DB의 전체 마이그레이션·계정 격리를 확인했다. 운영 DB의 테이블·컬럼·함수·정책에도 이전 브랜드 이름이 없다. 재생성 가능한 이전 빌드 44개를 정리했으며, 복구용 과거 스냅샷과 Git 이력은 원본 기록으로 보존한다.

Supabase URL과 Publishable key, 기존 OpenAI 설정은 `.env.production.local`에서 읽는다. 공개 주소는 `.env.production`에 있으며 빌드 때 반영된다. 환경 파일은 Git과 배포 추적에서 제외한다.

2026-09-09 제비 로고 적용: 운영 3410, 테일스케일 3016, 보조 3402를 `.next-airo-swift`로 전환했다. 헤더·로그인·푸터에는 승인된 제비와 AIRO 가로형, 대화창에는 제비 단독형을 사용한다. 브라우저와 Apple 아이콘도 제비로 교체했다. 새 빌드의 TypeScript, 변경 파일 ESLint, Chrome·WebKit의 320·390·1440px와 다크·라이트 테마, 로그인·요금제·문서 페이지를 확인했다. 검증 자료는 `assets/validation/swift-logo/`에 있다. 이전 `.next-airo-paths` 빌드와 서비스 설정 백업을 보존했다.

2026-09-09 웜 아이보리·지구본 안정화: 운영 3410, 테일스케일 3016, 보조 3402를 `.next-airo-ivory`로 전환했다. 검정 바탕과 제비·AIRO 로고를 유지하고 포인트를 아이보리로 바꿨다. 헤더 높이·메뉴 크기·작은 뷰포트 배치를 수정하고 요청 문구 두 곳을 제거했다. 지구본 마커의 소수점 위치, 프레임별 카드 보정, 라벨 방향 유지와 hover 재개 여유를 적용했다. Production build·TypeScript·ESLint, Chrome·WebKit 12개 프레임/배치 조합, 14개 모바일 조합, atlas/startup/discovery가 통과했다. 검증·서비스 전환·공개/테일스케일 증거는 `assets/validation/globe-stability/`에 있다. 이전 `.next-airo-swift`와 서비스 설정 백업을 보존했다.

2026-09-09 에어 블루 적용: 사용자가 승인한 블루 시안을 운영 3410, 테일스케일 3016, 보조 3402의 `.next-airo-blue` 빌드에 반영했다. 제비·AIRO 전체와 브라우저/Apple 아이콘, 주요 버튼·선택 상태·육상 경로를 `#86A5FF`로 통일했다. 밝은 테마에는 `#335CCC`와 흰 글자를 사용하고, 검정 배너·첫 지구본에는 에어 블루와 검정 버튼 글자를 사용한다. 로그인 배너·여행 카드와 공통 버튼/배지의 hover도 동일한 색상 역할을 따른다. 기준 문서는 `DESIGN.md`, 검증은 `assets/validation/blue/`다. Production build·TypeScript·ESLint, Chrome·WebKit의 메뉴·지도·페이지·14개 모바일 조합과 테마별 로고/버튼/hover 대비를 확인했다. 이전 `.next-airo-ivory`와 서비스 설정 백업을 보존했다.

2026-09-09 첫 화면 정렬: 운영 3410, 테일스케일 3016, 보조 3402를 `.next-airo-aligned`로 전환했다. 제목·설명·시작 버튼·하단 정보가 헤더 로고의 왼쪽 기준선을 공유한다. 320~2560px 및 모바일 가로 화면에 공통 여백을 적용하고, 모바일 도시 라벨도 같은 영역 안에 배치한다. 시작 버튼의 수평 포인터 이동을 제한했다. 검정·에어 블루와 기존 지구본 동작을 유지했다. Production build·TypeScript·변경 파일 ESLint, Chrome·WebKit 14개 정렬 조합, 12개 지구본 프레임 검사, 14개 모바일 동작 검사 및 버튼 hover를 확인했다. 검증 자료는 `assets/validation/alignment/`에 있으며, 이전 `.next-airo-blue`와 서비스 설정 백업을 보존했다.

2026-09-09 여행지 카드 정리: `.next-airo-card-clean`을 운영 3410·테일스케일 3016·보조 3402에 반영했다. 카드 상단의 작은 영문 국가명과 제목 위 불필요한 여백을 제거했다. Production build·TypeScript·변경 파일 ESLint와 Chrome·WebKit의 1920·390·320px 카드 표시·클릭을 확인했다. 검증 자료는 `assets/validation/card-clean/`에 있다.

2026-09-09 줌인 후 대화 데모: `.next-airo-conversation`을 운영 3410·테일스케일 3016·보조 3402에 반영했다. 기존 3일 코스 재생 대신 목적지 요청 → 목적지 핀 → 식당 후보 3곳 → 다음 채팅으로 식당 추가 → 경유 경로 수정 흐름을 보여준다. 자동 재생·직접 후보 선택·메시지 전송·다른 식당으로 교체·다시 보기를 지원한다. 모바일 대화창·키보드·로고 기준선과 검정/블루 테마를 유지했다. 53개 도시의 식당 159곳과 도보 경로 212개는 OpenStreetMap/Valhalla 응답을 기록한 `public/maps/dining-scenarios.json`을 사용한다. 외부 AI나 경로 API를 방문자 브라우저에서 호출하지 않는 예시 대화다. Production build·TypeScript·ESLint, Chrome·WebKit 12개 대화 화면 조합, 53개 도시의 경로 수정, 자동 리마 대화, 14개 모바일 조합과 초기 지구본 로딩을 확인했다. 검증 자료는 `assets/validation/conversation/`, 명령은 `npm run test:dining`이다. 이전 `.next-airo-card-clean`과 서비스 설정 백업을 보존했다.

다음 배포는 실행 중인 빌드 폴더를 덮어쓰지 말고 새 `NEXT_DIST_DIR`에서 빌드·검증한 뒤 앱 LaunchAgent의 `NEXT_DIST_DIR`을 변경하고 재시작한다. 터널 리스너 포트는 계속 3410을 사용한다. 개인용 이전 서비스는 자료 이식 검증까지 유지한다.

Supabase Auth의 Site URL은 `https://airo.dev-heptivision.com`, Redirect URL은 `https://airo.dev-heptivision.com/auth/callback`이다. 로컬 개발에는 `http://localhost:3002/auth/callback`을 추가한다. 2026-09-08 사용자가 대시보드에서 설정 저장을 확인했다. 현재 OAuth 연결에 Auth 설정 조회 권한이 없어 API 재조회는 하지 못했으며, 실제 이메일 로그인 검증은 대기 중이다.

Google 제공자를 연결한 경우에만 `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`로 빌드한다. 실제 사용자 로그인과 개인 자료 이식 진행 상황은 `UNIFICATION.md`에 기록한다.

2026-09-08 브랜드 정리 배포: 공개 주소(3410)와 Tailscale 미리보기 `http://<tailscale-ip>:3016/`는 모두 `.next-mobile-ready` 빌드를 사용한다. 검정 기반·GPT Image 경로 로고·53개 도시가 동일하다. DB `0005_airo_archive_format.sql`도 적용했다. 이전 파일은 가져오기 때 변환하며 새 출력과 키 발급은 AIRO 형식이다.

초기 지구본 표시 수정: 임시 구체를 제거하고, 실제 지구본을 최초 위치에서 렌더링한 뒤 표시한다. `npm run test:globe-startup`은 지연 로딩·새로고침·모바일·로딩 중 일정 진입을 확인한다.

모바일 개선 배포: `.next-mobile-ready`. 모바일 검색 dialog, 하단 작업 탭, VisualViewport·안전 영역·입력 확대 방지, 터치 영역과 지도 스크롤을 반영했다. Chrome·WebKit 14개 화면 조합과 기존 atlas/startup/integration 검증을 통과했다. 검증 자료는 `assets/validation/mobile/`에 있다.

2026-09-09 배포: 공개 주소(3410)와 미리보기(3016)를 모두 `.next-road-mobile-release`로 전환했다. 휴대폰 첫 화면과 일정 화면의 한 화면 배치, 지구본의 5초 무작위 도시 선택, 도시 핀·선택 카드, GPT Image 로고 정제와 랜딩 문구 제거를 포함한다. 53개 도시의 159개 예시 경로는 실제 도로·보행로를 사용하며, 개인 여행도 인증된 도로 경로 API를 사용한다. 바탕지도와 경로의 좌표 기준을 맞추고 우회로까지 지도 범위를 넓혔다. 모바일 검색 창을 닫은 뒤 키보드 포커스도 복원한다.

검증: production build·TypeScript·변경 파일 ESLint, 159개 경로의 원본/연결/바탕지도 일치, 모든 도시의 하강·재생·복귀, 실제 이동 점과 도로의 일치, Chrome·WebKit 14개 모바일 화면 조합, atlas/startup/discovery, 전용 테스트 DB의 도로 API 인증·계정 격리·오류/재시도를 확인했다. 검증 자료는 `assets/validation/roads/`, `assets/validation/globe-impact/`에 있다. 공개 주소와 미리보기의 실제 배포 검증은 `scripts/verify-road-release.mjs`와 `assets/validation/roads/release-checks.json`에 기록한다. 테스트용 DB·PostgREST 컨테이너는 제거했다.

2026-09-09 연속 스크롤 대화: `.next-airo-outings`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 줌인 이후 같은 지도 위에서 소개가 스크롤에 따라 사라지고 목적지 요청 → 장소 후보 → 채팅 추가 → 경로 수정이 이어진다. 식당·카페·술집·디저트 각 3곳을 제공하며, 종류를 탐색하는 동안 기존 저장 경로를 유지한다. 53개 도시의 장소 636곳과 도보 경로 689개는 `public/maps/outing-scenarios.json`을 사용한다. 새로운 장소의 원본 OSM 태그·좌표·도보 경로와 기존 데이터 보존을 검사했다. Chrome·WebKit 34개 화면/스크롤 검사, 212개 도시·종류별 채팅 저장, 모바일 14개 조합, 초기 로딩 및 지도 영역 축소·복원 검사를 통과했다. 반복 재진입과 현재 종류 재선택 시 스크롤 위치, 분리된 지도 영역에 대한 잘못된 카메라 갱신도 수정했다. 검증 자료는 `assets/validation/outing/`, 데이터 검증은 `assets/maps/outings-audit.json`, 명령은 `npm run test:outings`다. 이전 `.next-airo-conversation` 빌드와 서비스 설정 백업을 보존했다.

2026-09-09 줌인 연속성 수정: `.next-airo-continuous`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 비행 후 MapLibre 지도를 제거하고 SVG 기본 지도로 교체하던 동작을 없앴다. 비행 도착 위치를 대화 영역에 맞춰 미리 계산하고, 같은 캔버스·카메라 위에 대화창을 자동으로 표시한다. 소개 문구는 비행 중 사라진 상태를 유지한다. CSS sticky로 지도 DOM을 옮기지 않고 스크롤 대화를 이어가며, 기기 회전과 명시적 로딩 재시도도 동일 지도 안에서 처리한다. 검정 지도와 블루 대비는 밝은 테마에서도 유지한다. 실제 Chrome·WebKit 비행 6회/1,737프레임, 모바일 회전 2회, 34개 대화 검사, 212개 도시·종류 저장, 모바일 14개 조합, 초기 로딩과 재시도 검증을 통과했다. 근거는 `assets/validation/camera-handoff/`와 `assets/validation/continuous/`, 명령은 `npm run test:camera-handoff`와 `npm run test:outings`다. 이전 `.next-airo-outings` 빌드와 서비스 설정 백업을 보존했다.

2026-09-09 첫 화면 소개와 선택 모션: `.next-airo-invitation`을 운영 3410·테일스케일 3016·보조 3402에 반영했다. 문구를 ‘가고 싶은 곳부터, 여행이 이어집니다.’로 바꾸고 선택한 도시의 메시지·장소·카페·동선 그래픽을 배치했다. 모바일 높이에 따라 그래픽을 축약한다. 핀 hover가 자동 회전뿐 아니라 선택 카메라 모션까지 끄던 버그를 수정하고 회전·비행에 부드러운 가속·감속을 적용했다. 기존 운영본에서 중간 카메라 프레임 0개인 급이동을 재현한 뒤 Chrome·WebKit의 데스크톱·모바일 4개 조합에서 57~64개 중간 프레임을 확인했다. Production build·TypeScript·변경 파일 ESLint, 모바일 14개 조합, 실제 지도 비행 6회와 화면 회전 2회, 지구본 초기 로딩 검증이 통과했다. 검증은 `assets/validation/invitation/`에 있으며 이전 `.next-airo-continuous`와 서비스 설정 백업을 보존했다.

공개 사이트 Chrome 1920px·WebKit 390px와 테일스케일 Chrome 320px에서 새 문구·그래픽, 기존 로고·블루 대비, 동일 지도·카메라 유지, 장소 후보·저장 경로 변경 및 로그인·요금제·문서 화면을 배포 후 확인했다. 결과는 `assets/validation/invitation/release/checks.json`이다.

2026-09-09 목적지 선택형 대화: `.next-airo-choice`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 도착 직후 아이로의 ‘어디를 가시겠어요?’와 실제 명소 두 곳을 표시한다. 목적지 선택 후 핀 등장·도로 경로 그리기·이동하는 빛을 약 2.5초 동안 보여주고, 완료 후 식당·카페·술집·디저트를 고르게 한다. 장소를 다음 채팅으로 추가하면 경유 경로를 다시 그린다. 스크롤이 선택을 대신하지 않으며 목적지 변경·재생·지구본 복귀 때 이전 애니메이션을 취소한다. 채팅 내부 스크롤을 레이아웃 단계에서 맞춰 작은 화면의 페이지 이동을 방지했다. 추가한 53개 도시의 두 번째 목적지와 689개 경로는 기존 보행 도로 구간으로 검증했다. 제주 기존 차량 구간은 별도 보행 경로를 받아 사용했다. Production build·TypeScript·변경 파일 ESLint, 대화 흐름 8개 조합/64개 종류별 저장, 모바일 14개 조합, 동일 지도 비행 6회·화면 회전 2회, 초기 로딩·목적지 데이터 재시도 검사를 통과했다. 근거는 `assets/validation/choice/`와 `assets/maps/target-routes-verification.json`이며 이전 `.next-airo-invitation`과 서비스 설정 백업을 보존했다.

배포 후 공개 Chrome 1920px·WebKit 390px와 테일스케일 Chrome 320px에서 첫 질문·목적지 선택·경로 표시·종류별 후보와 경유 저장을 확인했다. 승인된 로고·블루 대비와 같은 지도 카메라도 유지되며, 결과는 `assets/validation/choice/release/checks.json`에 있다.


2026-09-09 최종 여행 잡지형 랜딩 시안: `.next-airo-editorial`을 운영 3410·테일스케일 3016·보조 3402에 반영했다. ‘마음 가는 대로, / [제비] AIRO.’와 실제 Cormorant Garamond Italic, 원형 화살표 CTA, 로마 골목 소개, 사진이 있는 로마 선택 카드를 구현했다. 상단 로고를 유지하고 처음 선택된 도시를 로마로 맞췄다. 도시 카드 스타일은 공용이며 사진·영문 라벨·두 줄 문구는 로마에만 적용한다. 서체와 사진은 로컬 파일로 제공하며 출처·라이선스는 `assets/editorial/CREDITS.md`에 기록했다. 모바일과 높이가 낮은 화면에서 카드·도시 선택·대륙 필터의 겹침을 보정하고, 가장 작은 화면의 로마 소개는 지구본 바로 아래에 표시한다.

Production build·TypeScript·변경 파일 ESLint, Chrome·WebKit 16개 서체/배치 검사, 모바일 메뉴·검색·키보드·공개 화면 14개 조합, 선택 회전 4개 조합, 실제 비행 6회·화면 회전 2회와 초기 로딩 검사를 통과했다. 로마 소개·대륙 필터·도시별 사진 분리·카드에서 여행 진입·명소 선택·식당 추가·실제 경유 도로 변경을 두 브라우저에서 확인했다. 검증 자료는 `assets/validation/editorial/`, 전용 명령은 `npm run test:editorial`이다. 이전 `.next-airo-choice`와 서비스 설정 백업을 보존했다.

배포 후 공개 Chrome 1920px·WebKit 390px와 테일스케일 Chrome 320px에서 새 타이포그래피·기존 로고와 블루 대비·사진/서체 파일 일치·도시별 카드·같은 지도 카메라·목적지 선택과 종류별 경유 저장을 확인했다. 결과는 `assets/validation/editorial/release/checks.json`에 있다.


2026-09-09 전체 도시 소개·누적 경유: `.next-airo-city-stories`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 53개 도시에 서로 다른 실사진과 소개 문구를 등록하고 핀 선택·도시 검색·자동 선택 시 지구본 카드와 왼쪽 아래 사진/도시명/제목/설명이 같은 상태로 바뀐다. 기존 로마 사진은 유지하고 나머지 52개 도시의 사진을 Wikimedia Commons에서 개별 사용 조건에 맞춰 확보했다. 원본·저작자·라이선스는 `/credits/photos`와 `assets/editorial/cities/photo-manifest.json`에서 확인한다. 상단 내비게이션의 시작하기를 제거하고 여행지 선택 영역을 조금 올렸으며 긴 도시명과 좁은 화면을 보정했다.

여정은 출발 → 추가한 식당 → 카페 → 디저트 → 목적지 순서로 누적한다. 기존 경유 구간과 저장된 장소를 유지하고 새 구간의 이동하는 빛은 마지막 경유지에서 이어진다. 목적지 변경·취소는 기존 경유지를 보존하며 ‘다시 보기’와 지구본 복귀만 전체 초기화한다. 중복 등록을 막고 현재 방문 순서를 대화창 상단에 표시한다. ‘카페도 추가해줘’ 같은 요청은 식당을 유지한 채 다음 장소 후보를 연다. 누적 길은 기존 OSM/Valhalla 보행 도로 구간의 그래프를 연결하며 새 직선 구간을 만들지 않는다.

검증: Production build·TypeScript·변경 파일 ESLint, 전체 도시 212개 브라우저 선택 검사(Chrome 1570/320, WebKit 390/768), 16개 배치 검사, 14개 모바일 메뉴/검색/페이지 검사, 자동 사진·소개 동기화 2개 브라우저, 누적 경유·목적지 변경/취소·재시작·같은 지도/카메라 유지 3개 화면을 확인했다. 53개 도시·두 목적지·다섯 경유지에 대해 89,825개 구간의 원본 도로 일치·연결·기존 구간 보존을 검사했다. 검증 자료는 `assets/validation/city-stories/`, 전용 명령은 `npm run test:city-stories`와 `npm run test:cumulative-journey`다. 이전 `.next-airo-editorial`과 서비스 설정 백업을 보존했다.

배포 후 공개 Chrome 1920px·WebKit 390px와 테일스케일 Chrome 320px에서 상단 버튼 제거·도시별 사진/소개·서체/사진 파일 일치·네 종류 누적 저장·기존 식당 유지·동일 지도 카메라 및 로그인/요금제/MCP 문서 화면을 확인했다. 공개 검증 결과는 `assets/validation/city-stories/release/checks.json`이다.


2026-09-09 하단 최종 시안: `.next-airo-lower`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 기존 히어로·로고·도시 선택과 누적 경유 대화는 유지했다. 하단은 대화→일정, 지도와 날짜별 일정, 여행 노트, AI 도구 연동 예시, 넓은 거리 사진 CTA와 푸터로 구현했다. 확정된 한글 문구와 제목의 고딕/세리프 대비를 적용하고 폐기된 문구와 첫 구간 영문 라벨은 제거했다. 하단 전용 Noto Serif KR 서브셋을 따로 제공한다.

선택된 53개 도시의 사진·소개·일정·노트·마지막 사진이 같은 도시 상태로 바뀐다. 로마는 9개 명소와 카페의 개별 실사진을 추가하고 출처·라이선스를 `/credits/photos`에 함께 공개했다. 지도는 기존 Mapcn/MapLibre와 로컬 OSM 도로 스냅샷을 사용하며 날짜·번호 핀·일정 선택·사진 카드가 서로 연결된다. 외부 지도 타일의 API 키 워터마크를 시각 검토에서 발견해 외부 타일 의존을 제거했고, 최종 지도는 로컬 자료만으로 표시한다.

데모 입력은 실제 전송 입력창 대신 예시 일정을 느긋하게 바꾸는 버튼이다. 북마크·자료 종류 선택·예시 PDF 내려받기를 연결하고 예산은 샘플임을 표시했다. Claude/Cursor/Codex/ChatGPT는 기존과 같은 연동 예시이며 실제 AI 연결 상태로 표시하지 않는다. 탭 선택 시 카페 추가 행과 답변이 짧게 전환되고, 동작 줄이기·일시정지에서는 결과가 즉시 보인다. 약관·개인정보처리방침은 준비 중 표시를 유지했다.

검증: Production build·TypeScript·변경 파일 ESLint·git diff --check, Chrome/WebKit 9개 하단 화면과 106개 도시 상태 확인, 27개 날짜 경로·81개 핀/일정 선택, 북마크/예시 PDF/4종 MCP 탭, 실제 모션·일시정지·시작 및 문서 링크 2개 브라우저를 확인했다. 기존 히어로 16개 배치, 모바일 14개 메뉴/검색/페이지 검사, 누적 경유·목적지 변경/취소·동일 지도 유지 3개 화면과 53개 도시의 89,825개 보행 도로 구간 검사도 통과했다. 최종 시안과 데스크톱·모바일 스크린샷을 비교해 카드 비율·서체·간격을 조정했다. 검증 자료는 `assets/validation/lower/`, 하단 전용 명령은 `npm run test:lower`와 `node scripts/test-lower-motion.mjs`다.

배포 후 공개 Chrome 1920px·WebKit 390px 및 테일스케일 Chrome 320px에서 새 글꼴/사진/예시 PDF의 해시, 날짜별 지도와 사진 카드, AI 탭, 기존 로고·블루 대비·동일 지도/카메라·4종 누적 경유와 로그인/요금제/문서 화면을 확인했다. 결과는 `assets/validation/lower/release/checks.json`, 전체 요구사항 완료 점검은 `assets/validation/lower/COMPLETION.md`에 있다.

2026-09-10 하단 세부 동작: `.next-airo-lower-details`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 페이지별 작업을 세 컴포넌트로 분리했다. 2페이지 대화·배너 제목·사진·예시 일정은 6초 간격으로 함께 바뀌며, 날짜 및 여유롭게 바꾸기 버튼은 유지한다. 로마는 세 가지 여행 이야기, 다른 도시는 선택 도시의 일정과 장면을 사용한다. 읽기/조작·화면 밖·숨겨진 탭·일시정지·동작 줄이기에서는 자동 넘김을 멈춘다. 2페이지의 원형 순번을 제거하고 시간 중심으로 정리했다. 3페이지 번호는 장소명의 첫 줄 가운데에 정렬하고 긴 이름 및 태블릿 날짜 탭도 보정했다. 모든 도시의 장면 제목을 포함한 하단 전용 Noto Serif KR 서브셋을 제공한다.

연동 영역은 “쓰던 AI에 말하면, 여행은 아이로에.”로 바꿨다. OpenAI·Anthropic·Cursor 공식 문서를 확인해 ChatGPT 데스크톱, Claude Code, Cursor, Codex CLI·IDE를 표시하고 각 도구의 공식 문서 및 MCP 가이드 위치로 연결했다. 안내 문서의 환경 변수 설정을 클라이언트별로 구분했으며 ChatGPT 웹의 현재 API 키 연결 제한도 안내한다. 대화는 예시이며 실제 외부 AI 계정 연결은 실행하지 않았다. 근거: `assets/validation/lower-details/tool-research.md`.

검증: production build·TypeScript·변경 파일 ESLint, Chrome/WebKit 9개 화면 크기, 53개 도시×2엔진, 실제 6초 자동 전환·정지·재생·수동 조작·동작 줄이기, 108개 번호/장소명 정렬 측정, 네 가지 도구 전환과 가이드 앵커를 확인했다. 새 폰트 및 세 사진 전환 완료 화면을 별도로 확인했다. 검증 자료: `assets/validation/lower-details/`. 이전 `.next-airo-lower`와 서비스 설정 백업을 보존한다.

배포 후 공개 사이트 Chrome 1920px·WebKit 390px 및 테일스케일 Chrome 320px에서 새 빌드 에셋·하단 탭·지도 선택을 확인했다. 기존 히어로 로고·도시 이동·네 번의 누적 경유 추가·지도 카메라 유지와 로그인/요금제/MCP 문서 이동도 통과했다. `assets/validation/lower-details/release/checks.json`에 빌드 ID와 결과를 기록했다. 검증 전용 3018 리스너는 종료했다.

2026-09-10 경로 애니메이션·로고 축소: `.next-airo-route-motion`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 2페이지 시간과 장소명 첫 줄을 CSS Grid 첫 기준선으로 맞추고 일정 전환에서는 수직 이동을 제거했다. 3페이지는 작은 제목과 세 장소의 점/선 시각화를 연결하고, 실제 지도가 보인 후 6초 동안 핀이 차례로 강조되고 기존 도로 좌표를 따라 경로와 이동점이 그려진다. 날짜 변경·다시보기로 재생하며 장소 선택 시 완성 경로로 전환한다. 화면 밖·숨겨진 탭·전체 일시정지에서 진행을 멈추고 동작 줄이기·애니메이션 비활성에서는 완성 경로를 보여준다. 모바일에서 지도보다 먼저 보이는 제목 영역에도 점과 선 미리보기가 재생된다.

헤더 로고는 데스크톱 148→116px, 모바일 116→92px로 줄였다. 하단 CTA의 새도 줄이고 footer는 30px(모바일 27px) 새 단독 서브 로고로 바꿨다. 헤더 기준선·기존 메인 워드마크·44px 링크 터치 영역은 유지한다. 범위는 홈페이지이며 로그인 등 앱 로고에는 적용하지 않는다.

검증: production build·TypeScript·변경 파일 ESLint, Chrome/WebKit 9개 화면 크기와 53개 도시×2, 실제 도로 그리기·이동점·일시정지·다시보기·장소 선택·모션 감소, 시간/장소 기준선과 축소 로고를 확인했다. 긴 장소명이 있는 도쿄/리우/오클랜드의 3일×4개 화면에서 제목 시각화와 다시보기 버튼도 확인했다. 자료: `assets/validation/route-motion/`. 이전 `.next-airo-lower-details` 및 서비스 설정 백업을 보존한다.

배포 후 공개 사이트 1920px Chrome·390px WebKit와 테일스케일 320px Chrome에서 축소 로고·footer 서브마크·경로 시각화 및 기존 히어로/누적 경유/카메라/페이지 이동을 확인했다. 결과와 빌드 ID는 `assets/validation/route-motion/release/checks.json`. 검증용 3018은 종료했다.

2026-09-10 푸터 정리·기존 지도 동작: `.next-airo-footer`를 운영 3410·테일스케일 3016·보조 3402에 반영했다. 푸터는 작은 새 서브 로고와 두 줄의 한글 세리프 문구, 여행/도움말 두 메뉴 그룹으로 정리했다. 서비스 준비 중 안내를 하단에 모으고 실제 지도 출처인 OpenStreetMap 링크를 제공한다. “맨 위로” 버튼은 기존 Lenis 스크롤 및 모션 설정에 연결했다. 모바일 메뉴는 44px 높이이며 검정·블루 톤과 축소 로고를 유지한다.

3페이지는 제목 옆 별도 경로 시각화와 전용 컴포넌트/CSS를 제거하고 원래 제목·설명 배치를 복원했다. 애니메이션은 기존 아래 지도에서만 실제 도로 좌표를 따라 재생되며 “경로 다시 보기”는 지도 위로 옮겼다. 날짜/핀 선택, 재생/정지, 모션 감소와 2페이지 시간 정렬을 유지한다.

검증: production build·TypeScript·ESLint, Chrome/WebKit 320/390/768/1440 화면에서 푸터 정렬·링크·맨 위로 이동·지도 드로잉/이동점/재생/정지/장소 선택과 정적 완성 경로를 확인했다. 자료: `assets/validation/footer/`. 이전 `.next-airo-route-motion`와 서비스 설정 백업을 보존한다.

배포 후 공개 사이트 Chrome 1920px·WebKit 390px 및 테일스케일 Chrome 320px에서 기존 지도/누적 경유/카메라 유지와 새 푸터 빌드를 확인했다. 빌드 ID·결과: `assets/validation/footer/release/checks.json`. 검증용 3018 리스너는 종료했다.
