# GPT Image 에셋 기록

- 방식: 내장 image_gen 도구 (GPT Images 2).
- 제작: 기존 일러스트 7회 + 로고 작업 26회 = 총 33회. 제비·AIRO 가로형을 사이트 로고로 선택했다. 비교 아이콘 11개와 제비 글자 포함 로고 2종, 웹용 투명 마스터 2개를 보존한다. Higgsfield 사용 0회.
- 비용: 내장 도구가 비용 정보를 반환하지 않아 금액은 기록하지 않음.
- 원본은 assets/source/, 최종 웹 파일은 public/gen/에 저장.
- 정확한 최종 프롬프트 7개는 [imagegen-manifest.json](imagegen-manifest.json)에 보존.
- 검수: 수채화·과슈, 따뜻한 종이 질감, 크림/샌드/테라코타. 네온·사진·얼굴·불필요한 문자 없음.

| 번호 | 에셋 | 원본 | WebP | 용량 |
| --- | --- | --- | --- | --- |
| 1 | hero-bg | assets/source/hero-bg.png | public/gen/hero-bg.webp | 64 KB |
| 2 | day1-philosophers-path | assets/source/day1-philosophers-path.png | public/gen/day1-philosophers-path.webp | 146 KB |
| 3 | day2-cafe | assets/source/day2-cafe.png | public/gen/day2-cafe.webp | 137 KB |
| 4 | day3-arashiyama | assets/source/day3-arashiyama.png | public/gen/day3-arashiyama.webp | 161 KB |
| 5 | feature-prep | assets/source/feature-prep.png | public/gen/feature-prep.webp | 61 KB |
| 6 | cta-journey | assets/source/cta-journey.png | public/gen/cta-journey.webp | 106 KB |
| 7 | og-image | assets/source/og-image.png | public/gen/og-image.webp | 101 KB |

OG는 1200×630으로 크롭했으며, 소셜 크롤러 호환용 public/gen/og-image.jpg도 같은 원본에서 변환했다.
`pnpm images:prepare` 또는 `pnpm build`로 웹 파일을 다시 만들 수 있다. 재변환은 AI 이미지 생성이 아니며 생성 횟수·크레딧을 사용하지 않는다.

## 로고 교체 · 2026-09-08

- 사용자 요청에 따라 내장 GPT Image 도구로 새 심벌을 생성하고, 이어진 “경로는 실제 경로처럼” 요청을 반영했다. 최초 시안·경로 수정·투명 배경 정리 시도·최종 흑백 마스터 내보내기의 총 4회 호출이다.
- 출발점과 도착점을 도로처럼 꺾여 연결하는 경로가 담긴 두꺼운 A 모노그램이다. 최종 GPT Image 흑백 마스터를 luminance mask로 렌더링해 기존 피스타치오 색을 적용한다. 수작업으로 SVG 경로를 다시 그리지 않았다.
- 원본: `assets/source/airo-mark-route-gpt.png`; 배포·다운로드: `public/brand/airo-mark-route-gpt.png`; 웹: `public/brand/airo-mark-route-gpt.webp` (256×256).
- 생성 마스터를 보존하고 실제 생성된 실루엣에서 웹·브라우저·Apple 아이콘을 내보냈다. 색은 기존 테마 토큰으로 적용하며 손으로 그린 SVG 경로로 대체하지 않았다. 체크무늬 배경이 남은 중간 결과는 배포하지 않았다.
- 정확한 프롬프트와 출력 목록: [로고 제작 기록](brand/airo-route-logo-prompts.json).
- 배경과 팔레트·53개 여행지·레이아웃은 유지했다. 이전 로고 파일은 `assets/brand/previous/`에 보관했다.

## 로고 정제 · 2026-09-09

- 내장 GPT Image 1회 추가 생성. 기존 A·실제 도로 형태의 경로·두 끝점이라는 아이디어를 유지하면서 비례와 곡률, 경로 두께를 정제했다.
- 원본 `assets/source/airo-mark-refined-gpt.png` 보존. 웹 `public/brand/airo-mark-refined-gpt.webp`, 다운로드 PNG, 호환 SVG, favicon 및 Apple 아이콘을 같은 마스터에서 내보냈다.
- `scripts/export-refined-logo.mjs`는 생성한 흑백 마스터의 명도를 알파로 옮기고 기존 피스타치오 색을 적용하는 크기·형식 변환이다. 벡터 경로를 수작업으로 다시 그리지 않는다.
- 프롬프트·참고 자료: [제작 기록](brand/airo-refined-logo-prompts.json). 작은 크기 비교: `assets/validation/globe-impact/logo-sizes.png`.
- 비용은 내장 도구에서 노출되지 않았다.

## 아이콘 비교 시안 5종 · 2026-09-09

- 사용자 요청 “여러 시안, 최소 5개”에 따라 내장 GPT Image 도구를 각각 1회씩, 총 5회 호출했다.
- 열린 경로 A, 웨이포인트 O, 접힌 지도, 노스 루트, 트래블 페어의 다섯 방향을 생성했다. 기존 검정·피스타치오 색상 방향을 유지했다.
- 모든 PNG는 생성 원본을 변경 없이 복사했다. 형식 변환, 벡터 재제작, 기존 서비스 로고 교체는 하지 않았다.
- 비교 페이지: [아이콘 시안 5종](brand/icon-concepts-2026-09-09/index.html). 생성 시안에는 가장자리 빛 번짐이 일부 포함되어 있어 형태 검토용으로 보존했다.
- 정확한 프롬프트: [prompts.json](brand/icon-concepts-2026-09-09/prompts.json). 생성 원본 경로와 파일 목록: [outputs.json](brand/icon-concepts-2026-09-09/outputs.json).
- 비용은 내장 도구에서 노출되지 않았다.

## 새로운 아이콘 시안 6종 · 두 번째 탐색 · 2026-09-09

- 첫 다섯 시안을 모두 거절한 사용자의 요청으로 인터넷에서 Navan, Globe-Trotter, Tripadvisor, Assembly의 제작사 사례를 조사했다. [참고 자료와 해석](brand/icon-concepts-2026-09-09/round-2/research.md).
- 포털·리본·제비·ai 글자·지형·여우의 여섯 방향을 내장 GPT Image로 별도 생성했다. 최초 생성 6회, 빛 번짐과 가장자리를 정리하는 편집 6회로 이번 작업은 총 12회다.
- [비교 페이지](brand/icon-concepts-2026-09-09/round-2/index.html)에 여섯 최종 PNG, AIRO 이름과의 배치, 24·32px 보기, 확대 창을 넣었다. 320·390·1440px에서 가로 넘침이 없고 여섯 확대 창과 이미지 로딩을 확인했다.
- 생성 원본은 `round-2/originals/`, 정리한 결과는 `round-2/01-portal.png`부터 `round-2/06-scout.png`까지 보존한다. 모든 PNG는 도구 결과를 수정 없이 복사했다.
- 정확한 프롬프트: [최초 생성](brand/icon-concepts-2026-09-09/round-2/prompts.json), [정리 편집](brand/icon-concepts-2026-09-09/round-2/refinement-prompts.json). 원본 경로: [outputs.json](brand/icon-concepts-2026-09-09/round-2/outputs.json).
- 테일스케일 비교 주소: `http://<tailscale-ip>:3017/round-2/`. 현재 서비스에 적용된 로고 선택은 유지한다.
- 비용은 내장 도구에서 노출되지 않았다.

## 3번 제비 심벌 + AIRO 글자 · 2026-09-09

- 사용자가 두 번째 탐색의 3번 제비 심벌에 글자를 포함한 버전을 요청했다. 해당 심벌 PNG를 참고 이미지로 넣어 내장 GPT Image로 가로형·세로형을 각 1회씩 생성했다.
- 검정·아이보리와 제비의 비행 방향을 유지하고 AIRO 네 글자를 조합했다. A의 가로획과 R의 끝선에 곡선을 넣어 심벌과 어울리게 했다.
- 생성 결과 두 PNG를 변경 없이 `brand/icon-concepts-2026-09-09/round-2/swift-logo/`에 복사했다. [정확한 프롬프트](brand/icon-concepts-2026-09-09/round-2/swift-logo/prompts.json), [원본과 파일 목록](brand/icon-concepts-2026-09-09/round-2/swift-logo/outputs.json).
- [비교 페이지](brand/icon-concepts-2026-09-09/round-2/swift-logo/index.html)는 320·390·1440px에서 이미지 로딩과 가로 넘침을 확인했다. 테일스케일: `http://<tailscale-ip>:3017/round-2/swift-logo/`.
- 비용은 내장 도구에서 노출되지 않았다.

## 제비 로고 사이트 적용 · 2026-09-09

- 사용자의 사이트 적용 요청에 따라 가로형 조합과 단독 제비를 웹용으로 준비했다. GPT Image의 배경 제거 편집 2회로 투명 PNG를 만들고 생성된 알파 채널을 보존했다.
- [웹용 프롬프트](brand/airo-swift-web-prompts.json), [생성 원본과 내보내기 목록](brand/airo-swift-web-outputs.json). 원본은 `assets/source/airo-swift-*-transparent-gpt.png`에 있다.
- `scripts/export-swift-logo.mjs`는 투명 바깥 여백 정리, 크기·형식 변환만 한다. 심벌이나 글자를 재제작하지 않는다. 이전 브라우저·Apple 아이콘은 `assets/brand/previous/before-swift/`에 보존한다.
- `Logo`는 가로형 전체를 표시하고, `LogoMark`는 제비 심벌을 표시한다. 다크·라이트 색상은 CSS 마스크로 적용한다. favicon과 Apple 아이콘은 검정 바탕 제비를 내보낸다.
- `.next-airo-swift` 빌드를 운영 3410·미리보기 3016·보조 3402에 적용했다. Chrome·WebKit, 320·390·1440px와 다크·라이트 화면을 확인했다. 운영 HTTPS와 테일스케일에서 로고·심벌·favicon·SVG·Apple 아이콘 5개 파일이 로컬 결과와 일치함을 검증했다. 결과: `assets/validation/swift-logo/release-checks.json`.
- 비용은 내장 도구에서 노출되지 않았다.
