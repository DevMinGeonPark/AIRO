# Android 최신 AIRO 반영 작업

2026-09-18 시작. 기준: [UI/UX 점검](ANDROID_UIUX_ALIGNMENT_2026-09-18.md). 사용자 지시: 위 구현 개발을 진행한다.

## 완료 조건

- [x] 전체 지도·날짜 카드·오늘/가까운 날짜 선택·카드 스와이프·조작부 표시 전환.
- [x] 장소별 PDF/예약 링크·상태와 명시적 날짜/장소 연결, 긴 메모 접기.
- [x] PDF 직접 선택·미리보기·첨부·연결 수정·중복/크기 제한·재시도.
- [x] 앱 내부 PDF 페이지/확대 보기, 다른 PDF 앱 없이 동작.
- [x] 자료의 날짜/장소 검색·예약/문서/저장 장소 구분과 저장 장소 부가 정보.
- [x] 예약 작성/수정과 revision 충돌 처리, 예산 등록/기존 항목 연결.
- [x] 변경 이력·상세·검토 후 되돌리기와 충돌 처리.
- [x] AI에 날짜/장소/선택 자료 전달, 처리 뒤 관련 화면으로 복귀.
- [x] 외부 PDF·예약 링크 공유 받기와 여행 선택, 로그인 후 이어가기.
- [x] 원본과 연결 정보의 내보내기/가져오기 보존, 계정 격리와 로그아웃 정리.
- [x] 서버 통합·의미 있는 단위 검사·320/390dp 및 큰 글자 UI·재실행/뒤로 가기 검증.
- [x] 새 APK·운영 서버 적용·다운로드 검증·완료/E2E 문서 갱신.

사진/스캔 업로드·OCR·자동 정보 추출과 실제 알림 발송은 원래 점검의 후속 확장 범위다. 이번에는 PDF·예약 링크와 이미 구현된 서버 도구를 사용한다. 별도 과금 API·유료 fallback을 호출하거나 활성화하지 않는다.

## 진행 기록

- 기존 작업 디렉터리와 최신 운영 반영분을 확인했다. 다른 변경은 보존한다.
- Next.js 로컬 Route Handler 문서를 읽었다. 신규 DB 구조보다 기존 자료 저장 함수와 소유자 RLS를 재사용한다.

### 구현·검증 진행

- 0.3.0 / versionCode 3으로 구현 중. 모바일 자료 관리 API, 해시 기반 원본 다운로드, 예약 revision 충돌, 변경 이력과 복원을 연결했다.
- 전체 지도 위 날짜 카드·일정 모달, 앱 내부 PdfRenderer 페이지/확대, 직접 PDF 선택과 장소 연결, 예약 편집, 예약과 기존/새 지출 연결, AI 범위 전달, Android 공유 수신을 구현했다.
- 예약과 지출의 연결은 `reservationId`로 보존한다. 기존 지출 ID·금액을 유지하며, 한 예약의 중복 지출 연결을 서버와 앱에서 거부한다. 웹 예산 편집에서도 연결 필드를 유지한다.
- 모바일 API 통합 통과: 원본/해시·업로드 중복·장소 연결·타 계정 거부·예약/예산 충돌·변경 이력/되돌리기·AI 선택 검증. 실제 모델/메일 발송 0회.
- Demo/Cloud Kotlin 단위 테스트 각 25건과 debug APK 빌드 통과. 390dp에서 기기 검사 8건 통과. PDF 원본 보기·2페이지/확대·Activity 복원·예약·예산 중복 방지·공유 후 로그인·지도 스와이프를 포함한다.
- 320dp 큰 글자, Cloud 실제 임시 DB를 사용하는 앱 검사, 최종 패키지·배포 검증은 진행 중이다.
- 배포 준비는 현재 운영 `domestic-maps-predeparture-20260918`를 부모로 사용한다. 이번 서버 파일만 덮어쓴 격리 릴리스로 국내 지도·Day 0 Todo 등 다른 최신 작업을 보존한다.

### 완료 (2026-09-18)

- 모든 완료 조건의 구현과 해당 자동 검사를 마쳤다. 실제 사용자 계정·휴대폰·PC 구독 기기의 E2E 순서는 [운영 E2E](ANDROID_E2E.md)에 있다.
- Kotlin: Demo/Cloud 각 25건, 총 50건 통과. Android Lint 오류 0건(각 28개 경고), debug/release APK·Cloud AAB 빌드 통과.
- Demo UI: 기존 여행 4개, 자료/공유/지도 조작 4개, 실제 지도 렌더 1개 시나리오를 검증했다. 390dp 기본 글자와 320dp·150% 글자에서 관련 기능을 확인했다. 가로·세로 스크롤이 겹친 예약 상태 선택은 줄바꿈 배치로 수정한 후 실제 `confirmed` 저장까지 재검사했다.
- 실제 Android DocumentsUI 선택, PDF 2페이지·확대·재생성, PDF 공유 수신·여행 선택·원본 미리보기, 링크 공유 후 로그인·초안 복원, 로그아웃 캐시 정리, 예약과 지출의 중복 방지 통과.
- Cloud 앱: 가짜 이메일 제공자의 PKCE 복귀·재생성, 실제 임시 PostgreSQL API의 여행 CRUD·PDF 다운로드/표시·예약 저장·이력 검토/되돌리기·로그아웃 통과. Community 비밀번호 로그인·CRUD·로그아웃도 통과.
- 서버 통합: 저장소의 SQL migration 0001–0012, 계정/RLS, PDF 원본·연결, 예약/예산 revision, 이력 복원, AI 선택 범위와 구독 bridge 검증 통과. 구버전 앱의 예산 저장 시 누락된 `reservationId`는 기존 값을 보존한다.
- TypeScript, ESLint, MCP 로컬 회귀, production build 통과. Chrome 1440/390·WebKit 320에서 기존 공개 웹·로그인·Codex 안내 검증 통과.
- 운영 릴리스 `native-uiux-20260918`, 빌드 `hymNFF4Jiwt9YXqm7O-cj`, 포트 3410에 반영했다. 이전 릴리스의 국내 지도·Day 0 Todo 등 웹 기능을 유지했다. 이번 작업은 운영 DB migration·사용자 자료·SMTP·터널 설정을 변경하지 않았다.
- 공개 경로 9개와 Demo/Cloud APK 전체 다운로드의 크기·SHA-256 일치 확인. 운영 인증 사전 검사 7개도 재통과했다.
- 0.3.0은 0.2.0과 같은 개발 인증서를 사용하고 versionCode를 2→3으로 올렸다. APK 서명과 16KB ZIP 정렬을 확인했다. 정식 스토어 출시는 별도다.

## 증거·설치

- 운영 검증·패키지·이전 서비스 설정: `.private/deployment/native-uiux-20260918/`
- 320/390dp 합성 자료 화면: `.private/reviews/android-uiux-20260918/native/airo-uiux/`
- 테스트 로그: `.private/deployment/native-uiux-20260918/validation/`
- [Cloud APK](https://airo.dev-heptivision.com/downloads/airo-android-cloud-0.3.0.apk), [Demo APK](https://airo.dev-heptivision.com/downloads/airo-android-demo-0.3.0.apk), [체크섬](https://airo.dev-heptivision.com/downloads/airo-android-0.3.0.json)

실제 모델 호출·유료 API 호출·메일 발송은 검증에서 실행하지 않았다. 이미지/스캔/OCR·자동 정보 추출·실제 알림 전달은 이 문서 첫머리의 후속 범위다. 운영 계정 PDF와 예약 내용을 검증용 화면이나 공개 산출물로 복사하지 않았다.
