# AIRO — Personal AI Roadmap Orchestrator

**아이로(AIRO)** 는 *AI Roadmap Orchestrator* 의 줄임말입니다. 여행이라는 개인의 로드맵을 여러 AI 도구가 함께 편집하도록 조율(orchestrate)하는 서비스입니다.

> 어디로든, AI와 함께.

떠오른 생각을 대화로 던지면 일정이 되고, 그 일정은 지도 위 실제 도로를 따라 그려지고, 저장한 장소·예약 자료·예산이 일정 곁에 모입니다. 그리고 이 여행은 웹뿐 아니라 Claude, Cursor, Codex, ChatGPT 어디에서든 같은 데이터를 보고 수정할 수 있습니다.

운영 주소: https://airo.dev-heptivision.com

## 컨셉

"Personal AI Roadmap Orchestrator"는 세 가지 뜻을 담습니다.

| 키워드 | 의미 | 구현 |
| --- | --- | --- |
| **Personal** | 여행은 계정 단위의 개인 자산이다. 데모나 공용 파일이 아니라 로그인한 사용자에게 귀속된다. | Supabase Auth + 테이블 전체 RLS(Row Level Security). 원본 자료(PDF·예산·즐겨찾기)를 해시로 보존하며 임의 수정하지 않는다. |
| **Roadmap** | 일정은 목록이 아니라 시간과 공간 위의 경로다. | 일차·시간·장소를 가진 stop 모델, OSM 실제 도로 geometry, 도로를 따라 움직이는 이동 재생. |
| **Orchestrator** | 하나의 여행을 여러 AI 도구가 같은 규약으로 편집한다. AIRO는 도구 사이의 조율자다. | 단일 도구 계약(`tool-contracts.ts`)을 웹 채팅·MCP 서버·Codex 브리지가 공유. 어느 도구에서 바꿔도 같은 여행에 반영된다. |

## 무엇을 할 수 있나

- **대화가 일정이 된다** — "로마에서 느긋하게 걷고, 카페에도 들르고 싶어" 같은 요청이 시간별 일정으로 만들어지고, 같은 대화에서 순서·시간·장소를 다시 고칠 수 있다.
- **지도와 동선** — 날짜별 경로와 번호 핀, 장소 사진 카드, 실제 도로를 따르는 이동 재생. 지도 주변의 맛집·카페·숙소를 검색해 바로 일정에 넣거나 즐겨찾기로 저장한다.
- **여행 자료 보관** — 저장한 장소, 예약 PDF, 예산(숙소·식비·교통)을 여행 단위로 정리한다. 가져온 원본은 SHA-256으로 보존한다.
- **AI 도구 연동** — MCP(Model Context Protocol) 서버로 Claude·Cursor·ChatGPT 등 외부 클라이언트가 계정 여행을 읽고 편집한다. Codex 사용자는 자기 컴퓨터를 브리지로 연결해 웹·모바일 채팅을 자기 Codex 구독으로 처리한다.
- **모바일 우선** — 접기·반 펼치기·펼치기가 되는 일정 시트, 320px부터 검증된 레이아웃.

## 아키텍처

```
                 ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐
  사용자 접점     │ 웹/모바일 채팅 │  │ MCP 클라이언트 │  │ Codex (사용자 PC)   │
                 │ /api/chat    │  │ /api/mcp     │  │ /api/bridge + 플러그인│
                 └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘
                        │ OpenAI 함수호출   │ API 키 / OAuth      │ device·job 큐
                        └────────────┬─────┴─────────────────────┘
                                     ▼
  도구 계층          tool-contracts ─▶ tool-runtime ─▶ tools
                    (이름·스키마·권한 SSOT)   (의존성 주입 러너)   (store·places·roads 바인딩)
                                     ▼
  데이터 계층        store.ts ─▶ Supabase (RLS)  |  .demo-db.json (개발 전용)
                                 places (Google Places / OSM)  ·  road-routing (Valhalla/OSM)
```

**도구 12개**가 모든 접점에 동일하게 노출됩니다: `listTrips` `getTrip` `createTrip` `updateTrip` `deleteTrip` `searchPlaces` `addStop` `moveStop` `removeStop` `reorderDay` `getDayRoute` `searchAlongRoute`. 트립 채팅에서는 `tripId`를 서버가 고정하고, MCP에서는 `trips:read` / `trips:write` 권한으로 노출 범위를 나눕니다.

**인증 경계**

- 웹: Supabase SSR 세션. 로그인 후 복귀 경로는 HttpOnly 쿠키, 외부 Origin 거부.
- MCP: `airo_` 접두사 API 키(사용자 JWT로 재서명, `service_role` 미사용) 또는 Supabase OAuth Server + AIRO 승인 화면.
- Codex 브리지: 기기 비밀은 로컬 파일, DB에는 SHA-256만. AIRO 서버는 OpenAI 토큰을 받지 않는다.

## 기술 스택

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, RLS) · MapLibre GL · OpenAI API · `@modelcontextprotocol/sdk` · GSAP/Motion/Lenis · Playwright

## 시작하기

```sh
npm ci
npm run dev        # http://localhost:3002
```

Supabase 설정이 없으면 개발 서버는 `.demo-db.json` 파일 저장소로 동작합니다(운영에서는 닫힘). 실제 계정 기능은 `.env.local.example`을 참고해 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`을 넣고 `supabase/migrations/0001~0009`를 순서대로 적용합니다.

| 목적 | 명령 |
| --- | --- |
| 빌드 / 린트 | `npm run build` · `npm run lint` |
| 운영 빌드와 분리해 검증 | `NEXT_DIST_DIR=.next-check npm run build` |
| 도구 계약·DB·API 통합 | `npm run test:database` · `npm run test:integration` (전용 테스트 DB 필요) |
| MCP | `npm run test:mcp:local` |
| Codex 브리지 | `npm run test:codex` · `npm run plugin:build` · `npm run plugin:package` |
| 랜딩·모바일 | `npm run test:landing` · `npm run test:mobile` |

테스트는 프레임워크 없이 `scripts/test-*.mjs` 단일 스크립트입니다. 전제 조건과 전체 목록은 [OPERATIONS.md](OPERATIONS.md)에 있습니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [OPERATIONS.md](OPERATIONS.md) | 개발·운영 연결·개인 자료 이식·검증 절차 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 운영 배포 기록과 현재 값 |
| [AUTH_SETUP.md](AUTH_SETUP.md) | Supabase Auth·Google 로그인 설정 |
| [MCP_SETUP.md](MCP_SETUP.md) · [MCP_IMPLEMENTATION.md](MCP_IMPLEMENTATION.md) | MCP 서버 설정과 구현 |
| [CODEX_CONNECTION.md](CODEX_CONNECTION.md) | Codex 브리지 구조와 계정 경계 |
| [BRAND.md](BRAND.md) · [DESIGN.md](DESIGN.md) | 로고·색상·화면 기준 |
| [UNIFICATION.md](UNIFICATION.md) · [COMMERCIAL_SERVICE.md](COMMERCIAL_SERVICE.md) | 개인 서비스에서 계정형 서비스로의 전환 기록 |

## 상태

결제와 공개 공유는 아직 제공하지 않습니다. 무료 플랜은 여행 3개입니다. Codex 플러그인의 공식 디렉터리 등록은 진행 중이며, 현재는 Git 마켓플레이스 설치를 제공합니다.
