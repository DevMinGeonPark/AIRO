# AIRO — 다크 지구본 랜딩

2026-09-08. 기존 홈의 히어로를 회전하는 지구본으로 확장했다. 교토 핀을 선택하면 3.2초 동안 확대하여 기존 3일 일정 미리보기로 도착한다. 지구본으로 돌아가 다시 둘러볼 수 있다. 기존 한국어 카피, 링크, 라우트와 기능 01/02/03 → MCP → CTA → 푸터 순서를 유지했다.

검증한 빌드를 기존 [Tailscale 미리보기](http://<tailscale-ip>:3016/)에 반영했다.

shadcn의 뉴트럴 다크 토큰을 기본값으로 적용하고 오렌지는 주요 버튼과 경로·핀에 남겼다. 저장된 라이트 모드 선택은 유지한다. 지구본은 기존 Mapcn의 MapLibre globe projection을 사용한다. 도착 후의 지도는 기존 SVG 인터랙션이며, 두 렌더러가 동일한 카메라 계산과 OSM 지형을 공유한다. 연결되는 일정은 교토 미리보기다.

## 변경 파일과 역할

- `src/app/globals.css`, `src/app/layout.tsx`, `src/components/app-shell.tsx`: 뉴트럴 다크 토큰, 서버 렌더 기본 테마, 저장된 테마 선택 처리.
- `src/app/page.tsx`, `src/app/landing-dark.css`, `src/app/landing-globe.css`: 기존 페이지에 테마와 지구본 화면 스타일 연결. 모바일 핀 라벨, 메뉴와 카드 대비 조정.
- `src/components/landing/globe-arrival.tsx`: 지구본 진입, 직접 일정 보기, 동작 줄이기·일시정지, 비행 상태와 그래픽 오류 대체 화면.
- `src/components/landing/globe-scene.tsx`: 실제 Mapcn 지구본, 회전·드래그·핀과 교토로 향하는 카메라.
- `src/components/landing/travel-preview.tsx`, `journey-scroll.tsx`: 기존 히어로 안의 지구본/일정 전환, 복귀 및 키보드 포커스.
- `src/components/landing/journey-map.tsx`, `src/lib/landing-map.ts`: 다크 지도와 공통 도착 좌표·배율 계산.
- `src/components/ui/map.tsx`, `scripts/prepare-map-worker.mjs`, `package.json`, `public/vendor/maplibre/6.6.0/`: 설치된 MapLibre 버전의 워커를 로컬 제공. 개발·빌드 시 준비.
- `scripts/prepare-landing-map.py`, `public/maps/kyoto-dark.svg`, `kyoto-detail.geojson`, `world-land.geojson`, `assets/maps/README.md`: 지리 데이터, 두 지도 테마, 출처와 재생성 방법.
- `scripts/test-landing.mjs`, `assets/validation/dark-globe/`: 기존 회귀 검사 확장, 화면 캡처와 Lighthouse 결과.
- `tsconfig.json`: 별도 검증 빌드 `.next-dark`의 Next 생성 타입 경로.

## 검증

- `NEXT_DIST_DIR=.next-dark pnpm build`: 성공.
- `LANDING_BASE_URL=http://localhost:3018 pnpm test:landing`: 24개 검사 통과, 브라우저 콘솔·런타임·로컬 리소스 오류 0.
- 375 / 768 / 1440 / 1920px: 가로 넘침 없음. 모바일 날짜 선택, 지도 이동, MCP 도구 전환 확인.
- 모바일 Lighthouse: **성능 90 / 접근성 100**, CLS 0. 문구를 hydration 후 다시 숨기지 않도록 수정해 초기 렌더 지연을 줄였다.
- 주요 구현 파일 ESLint 및 `git diff --check` 통과.
- Tailscale 실주소에서 핀 마우스 클릭, 지구본 복귀, Escape로 전환 완료, 모바일 메뉴·핀 라벨 확인. 런타임 오류와 외부 서버 요청 0 (`arrival-smoke.json`).

패키지 추가 설치 없음. 기존 `motion`, `gsap`, `@gsap/react`, `lenis`, `maplibre-gl`, `sharp`를 사용했다.

이번 수정의 이미지 생성 **0회**. 기존 GPT 이미지 7회 / Higgsfield 0회이며 `assets/higgsfield-log.md`와 생성 내역을 유지했다. 예비 생성 8~10회는 사용하지 않았다.

전체 애니메이션 off 스위치: `src/lib/animation-config.ts`의 **`ANIMATIONS_ENABLED = false`**. 사용자 동작 줄이기 설정에서도 지구본 자동 회전과 카메라 비행·스크롤 고정은 꺼지며, 일정 선택은 계속 사용할 수 있다.
