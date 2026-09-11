# 실제 기능 개발 — MCP 우선

요청: 승인된 랜딩을 커밋한 뒤 실제 동작을 개발한다. 가장 중요한 기능은 MCP다. 실제 API 연결 테스트는 사용자가 마지막에 실행한다.

랜딩 기준 커밋: `794fe2b` (`feat: checkpoint approved AIRO landing and travel app foundation`).
승인된 랜딩 디자인과 기존 운영 빌드는 유지한다. 환경 파일, 개인 자료, 로컬 검증 출력은 커밋하지 않는다.

## 구현 완료 기준

- [x] 랜딩과 기존 앱 기반의 Git 체크포인트 생성
- [x] 공식 SDK 기반 MCP Streamable HTTP, 요청 검증, 오류/권한 구분, 도구·리소스·프롬프트
- [x] 여행 조회/생성/설정, 장소 검색, 실제 경로 조회, 경로 주변 후보 검색, 경유지 추가/수정/삭제/재정렬의 공통 계약
- [x] 특정 장소 앞/뒤 삽입과 순서 변경의 원자적 저장, 재시도 중복 방지, 계정 격리
- [x] API 키 연결과 Supabase OAuth Server 기반 발견·승인·PKCE·토큰 만료/갱신·연결 해제 구현 (운영 설정·실제 검증 별도)
- [x] 연결 설정 화면, 도구별 설정 복사, 권한/연결 목록, 사용자용 가이드
- [x] 외부 MCP 변경을 앱의 일정·지도에 반영하고 편집 중인 내용을 보존
- [x] 외부 호출 없는 로컬 로직/계약 검증, 타입 검사, 빌드 및 가정 응답 기반 화면 확인
- [x] 사용자에게 최종 API 테스트 순서·필요 환경 값·미적용 DB 마이그레이션·검증 범위를 전달

## 해결한 기존 결함

- `searchPlaces`의 필수 여행 ID를 도구 계약에 반영했다.
- `addStop`의 앞/뒤 삽입과 기존 순번 이동을 트랜잭션으로 처리한다.
- 업무 실패와 입력 오류를 MCP 도구 오류로 구분한다.
- 외부 AI 변경 후 앱의 제목·일정·지도 경로를 갱신한다.
- API 키의 권한·만료와 Supabase OAuth 발견·승인·해제 흐름을 추가했다.
- 직접 작성한 JSON-RPC 처리기를 공식 MCP SDK로 교체했다.

## 기준 자료

- [MCP 전송 규격](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP 도구 규격](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP 인증 규격](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [공식 TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)

실제 Supabase·메일·AI·지도 공급자 및 외부 MCP 클라이언트를 호출하는 검증은 이 작업에서 실행하지 않는다. 운영 DB 마이그레이션도 자동 실행하지 않는다. 테스트용 가정 응답을 실제 성공 결과로 표시하지 않는다.

## 완료한 검증과 인계

- `npm run test:mcp:local`: 네트워크 차단 상태에서 도구 계약·메모리 MCP·메모리 PostgreSQL 검증 통과.
- Chrome 1440/390px, WebKit 320px에서 실제 컴포넌트 + 가정 응답으로 설정·동의 요청·권한 변경·편집 보존·자동 갱신 확인.
- TypeScript 및 변경 파일 ESLint, `.next-airo-mcp` 프로덕션 빌드 통과.
- 최종 설정과 사용자 API 검증: [MCP_SETUP.md](MCP_SETUP.md). 새 마이그레이션은 운영 DB에 적용하지 않았고 기존 배포 빌드를 전환하지 않았다.
