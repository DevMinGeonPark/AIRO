# 아이로 AIRO — 종이 지도 위의 대화

기존 홈 `/`을 화면 전체에 펼쳐지는 교토 지도와 대화로 재구성했다. 원래 한국어 카피·섹션 순서·라우트·링크를 유지했다. 새 페이지나 여행 데이터 쓰기는 없다.

미리보기: [Tailscale](http://<tailscale-ip>:3016/)

## 화면과 동작

- 히어로 전체가 따뜻한 종이색 지도다. 문장 → 아이로 답변 → 장소 핀 → 연결 경로가 같은 장면에서 이어진다.
- 데스크톱 스크롤은 Day 1(교토 동쪽) → Day 2(중심가) → Day 3(아라시야마) → 사흘 전체 보기로 연결된다. 같은 카메라가 실제 지리 좌표 사이를 이동한다. 날짜 탭도 같은 스크롤 단계로 이동한다.
- 지도 조작을 켜면 확대·축소, 드래그, 장소 선택, 임시 핀 추가가 가능하다. 방향키와 Enter도 지원한다. 조작 중에는 스크롤에 의한 날짜 전환을 멈춘다.
- 기능 01은 대화와 결과 지도, 02는 전폭 지도와 일정, 03은 여행 엽서 세 장이다. MCP 도구 선택은 요청에서 일정의 카페 행 추가까지 보여주는 로컬 미리보기다.
- 모바일은 스크롤 고정을 해제한다. 375×812에서 헤드라인·CTA·날짜·핀 세 개·대화 답변이 보이고, 아래로 조금 스크롤하면 출처와 일시정지가 보인다.
- 모션 감소·전체 끄기에서는 첫날의 완성된 지도를 정적으로 표시한다. 날짜 선택과 지도 조작은 즉시 반영된다. 헤드라인과 링크는 서버 HTML로 제공된다.

## 실제 Fable 협업과 참고 조사

로컬 Claude Code의 **claude-fable-5-1**을 사용했다. 모델 사용 기록과 원문 응답을 `assets/fable-review/`에 보존했다.

1. [첫 비평·아트 디렉션](fable-review/review-01.md): 기존 큰 장식 핀, 작은 UI, 분리된 탐색 화면의 문제를 분석했다.
2. [Fable 직접 구현](fable-review/implementation-02.md): `scroll-scenes.tsx`와 `landing.css`의 기능·MCP·CTA를 수정했다. 히어로·지도 엔진은 Codex가 구현했다.
3. [실제 화면 2차 리뷰](fable-review/review-03.md): 핀 기준점, 모바일 잘림, 모션 감소 시 가림, 엽서 라벨, 지도 하단 간격을 지적했다.
4. [수정 확인](fable-review/review-04.md): 히어로·반응형·핀 위치·모션 감소·엽서 통과. 마지막 모바일 지도 하단 간격까지 후속 수정했다.
5. [최종 확인](fable-review/review-05.md): 다시 그리기 버튼을 좌상단으로 옮기는 조건까지 적용해 1~6 항목을 마무리했다.

[KYRO](https://kyro.team/)의 연속된 제품 동작, [Linear](https://linear.app/)의 읽을 수 있는 제품 UI, [Superlist](https://www.superlist.com/)의 구도 변화, [Chartogne-Taillet의 지도 디자인](https://www.awwwards.com/sites/chartogne-taillet)을 조사했다. 참고 화면을 직접 스크롤해 캡처하고 관찰 근거와 적용점을 [조사 기록](fable-review/research.md)에 정리했다. 참고 사이트의 이미지나 디자인을 제품 에셋으로 복제하지 않았다.

## 검증

검증은 `.next-paper` 프로덕션 빌드에서 수행했다. 최종 수치는 `validation/lighthouse-paper-mobile.report.json`, 브라우저 결과는 `validation/landing-checks.json`에 있다.

| 항목 | 결과 |
| --- | --- |
| next build / TypeScript | 통과 |
| 변경 코드 ESLint / git diff --check | 통과 |
| 브라우저 기능 검사 | 20개 통과 |
| 최종 모바일 간격·핀 가림·좌표 스모크 | 통과 |
| Tailscale 실제 접속·Day 2·수동 지도 조작 | 통과 |
| 콘솔·런타임 오류 | 0 |
| Lighthouse 모바일 성능 | **89/100** |
| Lighthouse 모바일 접근성 | **100/100** |
| FCP / LCP | 1.1 s / 3.8 s |
| TBT / CLS | 10 ms / 0 |
| 핀 꼭짓점과 경로 좌표 오차 | 0.011px 미만 |

375/768/1440/1920px, 날짜·키보드·지도 조작·MCP·모션 감소·JavaScript 비활성화를 검증했다. 마지막 CSS 버튼 위치 변경은 별도의 최종 스모크로 확인했다. Lighthouse 13.4.1 모바일 측정은 실제 미리보기 프로덕션 서버(3016)에서 수행했다.
[통합 결과](validation/paper-summary.json) · [브라우저 검사](validation/landing-checks.json) · [최종 스모크](validation/final-smoke.json) · [Tailscale 확인](validation/tailscale-paper.json)

```sh
NEXT_DIST_DIR=.next-paper pnpm build
NEXT_DIST_DIR=.next-paper pnpm exec next start -p 3018
LANDING_BASE_URL=http://localhost:3018 pnpm test:landing
pnpm exec eslint src/app/page.tsx src/components/landing src/lib/landing-map.ts
pnpm dlx lighthouse http://localhost:3016/ --only-categories=performance,accessibility --form-factor=mobile --chrome-flags="--headless --no-sandbox" --output=json --output=html --output-path=assets/validation/lighthouse-paper-mobile --quiet
```

[수정 후 스크린샷](fable-review/paper-final/) · [핀 위치 오차 측정](fable-review/paper-final/evidence.json) · [Lighthouse HTML](validation/lighthouse-paper-mobile.report.html)

## 변경 파일과 역할

| 파일 | 역할 |
| --- | --- |
| `src/app/page.tsx` | 기존 카피를 서버 렌더링하며 전체 화면 히어로와 기존 섹션 연결 |
| `src/app/landing-map.css` | 지도·히어로의 크기, 타이포, 탭·카드·좌표·조작 UI와 반응형 |
| `src/app/landing.css` | Fable의 기능별 구도, MCP 두 창, CTA 엽서, 대비·간격 보정 |
| `src/components/landing/travel-preview.tsx` | 글자 리빌, 날짜별 대화 타이핑, 스크롤 단계와 날짜 선택 |
| `src/components/landing/journey-map.tsx` | 실제 좌표 투영, 연속 카메라, 경로·핀 애니메이션, 입력·정리 함수 |
| `src/components/landing/journey-scroll.tsx` | 날짜·수동 조작 상태, 프레임별 재렌더 없는 스크롤 진행 전달 |
| `src/components/landing/scroll-scenes.tsx` | Fable 구현: 대화 스레드, 지도 밴드, 엽서, 도구별 일정 추가 미리보기, CTA |
| `src/lib/landing-map.ts` | 9개 장소의 지리 좌표, 투영·역투영, 도시 라벨, 전체 경로 경계 |
| `scripts/prepare-landing-map.py` / `public/maps/kyoto-base.svg` | 기록된 OSM 데이터로 따뜻한 색의 로컬 지도 SVG 생성 |
| `scripts/test-landing.mjs` | 원문·링크·카메라·핀·날짜·MCP·반응형·모션 설정·오류 검증 |
| `scripts/test-landing-map.mjs` / `scripts/test-landing-fullscreen.mjs` | 통합된 랜딩 검증으로 연결하는 호환 진입점 |
| `assets/fable-review/*` | 협업 원문, 조사 출처, 화면, 수정·검수 근거 |
| `assets/validation/*` | 프로덕션 빌드·브라우저·Lighthouse 결과 |
| `assets/maps/README.md` | 지도 데이터와 예시 경로, 장식 지형의 출처·범위 |

기존 리디자인에서 설치한 모션 제공자·Nav·Footer·OG 메타데이터와 7개 이미지의 변환 파이프라인은 함께 사용한다. 애플리케이션·인증·여행 API의 동작을 이번 수정에서 변경하지 않았다.

## 패키지와 전체 모션 스위치

이번 수정의 추가 패키지는 없다. 리디자인에 사용한 패키지 설치 명령:

```sh
pnpm add motion gsap @gsap/react lenis sharp
```

전체 모션 스위치: [`src/lib/animation-config.ts:2`](../src/lib/animation-config.ts).

```ts
export const ANIMATIONS_ENABLED = false;
```

GSAP/ScrollTrigger, Lenis 스무스 스크롤, 타이핑, Motion, CSS 반복 효과, 마그네틱 버튼을 함께 끈다. 헤드라인과 수동 조작은 사용할 수 있다. 화면의 일시정지도 제공한다.

## 이미지·지도 예산과 범위

- GPT Images 2 누적 **7회**, 이번 수정 **0회**, 재생성·영상 **0회**. 예비 8~10회차 **미사용**.
- Higgsfield 생성 **0회**, 사용 크레딧 **0**. 사용자 지시로 Higgsfield 사용을 중단했다.
- 기존 7개 WebP와 OG JPEG는 sharp 변환·1920px 제한을 유지했다. 프롬프트·원본·저장 경로는 [imagegen-manifest.json](imagegen-manifest.json)에 있다.
- 지도는 자체 호스팅 OSM SVG와 코드로 구성한다. 외부 타일·위치 권한·키는 사용하지 않는다. 연결 경로는 예시 동선이며 길찾기 결과가 아니다. 임시 핀과 MCP 미리보기는 여행 데이터를 저장하지 않는다.

## Higgsfield 로그 전체

# Higgsfield 생성 로그

- 확인일: 2026-09-08
- 초기 확인: CLI 1.1.24, 로그인 유효, Free 플랜 10 credits.
- 사용자 지시에 따라 Higgsfield 사용을 취소하고 내장 GPT Images 2로 전환.
- Higgsfield 생성: 0/10회. 남은 횟수: 10회 (예비 3회 포함).
- Higgsfield 사용 크레딧: 0. 영상 생성: 0회.
- 실제 생성 기록 없음. 초기 견적은 higgsfield-budget.json에 보존.
- 대체 이미지 7개의 프롬프트·원본·저장 경로: imagegen-manifest.json.

| 번호 | 용도 | 모델 | 프롬프트 | cost 결과 | result URL | 저장 경로 |
| --- | --- | --- | --- | --- | --- | --- |
