---
version: alpha
name: AIRO Air Blue
description: 최종 여행 잡지형 랜딩 시안과 승인된 블루 브랜드 색상
colors:
  primary: "#86A5FF"
  on-primary: "#0A0A0A"
  primary-hover: "#9BB5FF"
  primary-light: "#335CCC"
  on-primary-light: "#FFFFFF"
  primary-light-hover: "#244BAD"
  background: "#0A0A0A"
  surface: "#171717"
  text-primary: "#F3F1EA"
  text-secondary: "#A3A3A3"
typography:
  body:
    fontFamily: Geist, Arial, sans-serif
    fontSize: 16px
    lineHeight: 1.6
  navigation:
    fontFamily: Geist, Arial, sans-serif
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.5
rounded:
  card: 14px
  button: 999px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  logo:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-primary}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
  card-secondary-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.button}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  navigation:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.navigation}"
---

## Overview

2026-09-09 사용자가 블루 시안을 선택하고 사이트 전체 적용을 요청했다. 승인된 제비·AIRO 가로형의 형태를 사용한다. 검정 테마에서 기억할 수 있는 단일 블루를 로고와 주요 조작부에 연결한다. DESIGN.md와 BRAND.md가 운영 색상의 기준이다.

블루의 선택은 제비의 비행 이미지와 현재 지구본의 차가운 중립색을 보고 내린 디자인 판단이다. 특정 색이 신뢰·전환율을 보장한다는 의미는 아니다.

## Colors

- 브랜드: Air Blue `#86A5FF`. 제비·AIRO 워드마크 전체, 핵심 CTA, 현재 선택 표시.
- 기본 바탕: `#0A0A0A`. 카드: `#171717`.
- 제목·본문: `#F3F1EA`. 보조 글자·일반 메뉴: `#A3A3A3`.
- 밝은 블루 버튼 내부 글자: `#0A0A0A`.
- hover: 같은 계열의 `#9BB5FF`.

지정한 불투명 sRGB 색상 쌍의 WCAG 상대 명도 대비 계산: 블루/검정 8.33:1, 블루/카드 7.55:1. 블루 위 흰 글자는 2.38:1로 일반 글자 AA 기준에 미달하므로 버튼 글자는 검정이다. 계산값 표시는 소수 둘째 자리로 반올림했다. 로고 자체의 예외 규정과 별개로 작은 화면에서도 충분한 가독성을 목표로 한다. 전체 UI의 접근성 적합성을 보증하는 측정은 아니다.

대표 색은 하나로 유지하되 배경·글자·강조의 역할은 분리한다. 오류·성공, 여러 일정이나 이동 수단을 구분하는 기능적 색상은 별도 의미로 관리하고 번호·문구·선 모양을 함께 사용한다. 밝은 테마의 로고·버튼·육상 경로는 같은 블루 계열의 `#335CCC`, 버튼 글자는 `#FFFFFF`, hover는 `#244BAD`를 사용한다. 첫 지구본 화면은 테마 선택과 관계없이 검정/에어 블루 조합을 사용한다.

## Typography

상단 내비게이션의 승인된 GPT Image 제비·AIRO 로고는 유지한다. 메인 제목 첫 줄 ‘마음 가는 대로,’는 기존 한글 시스템 고딕의 보통 굵기다. 두 번째 줄은 기존 제비 심볼과 실제 Cormorant Garamond Italic 400의 ‘AIRO.’를 같은 블루로 연결한다. Bodoni Moda Italic과 브라우저에서 비교한 뒤 시안의 가는 획에 가까운 Cormorant를 선택했다. font-synthesis: none으로 가짜 이탤릭을 방지한다. 로마 소개 제목과 공용 도시 제목에는 Noto Serif KR 400을 사용한다. 영문 라벨은 작은 Geist Mono, 설명은 작은 고딕이다. 신규 서체는 실제 사용 글자만 포함한 로컬 WOFF2로 제공하고 미리 로드한다. 사진·서체의 출처와 라이선스는 assets/editorial/CREDITS.md에 기록한다.

## Layout

사용자가 제공한 최종 시안의 검정 바탕·차콜 지구본·부드러운 페리윙클 블루를 따른다. 왼쪽에 ‘마음 가는 대로, / [제비] AIRO.’, ‘계획은 가볍게, 여행은 깊게.’, 텍스트와 가는 원형 화살표로 구성한 ‘여행 시작하기’를 놓는다. 시작하기는 기존 /app 동작을 따른다. 그 아래 가는 구분선과 로마 골목 사진, ‘01 / ROME’, ‘로마의 오후’, ‘느리게 걷고, 오래 머물기.’를 배경 위에 배치한다. 소개 버튼은 현재 선택된 도시를 지구본에서 중심에 맞춘다. 왼쪽 아래 사진·영문 도시 라벨·제목·설명은 핀 클릭·검색·자동 선택과 같은 도시 상태를 사용한다. 53개 도시에 각각 다른 실제 사진과 소개 문구를 등록한다.

최초 선택 도시는 로마이며, 첫 지구본 방향은 시안처럼 아메리카와 대서양을 보면서 로마 핀이 오른쪽에 보이도록 맞춘다. 모든 도시 선택 카드에 해당 도시의 실제 사진·영문 도시/국가·두 줄 설명을 제공한다. 공용 CityPreviewCard는 실제 도시 데이터를 사용하고 기존 마커의 위치·충돌 보정과 여정 시작 동작을 유지한다. 데스크톱 카드 너비는 218px, 사진 높이는 134px이며 얇은 블루 테두리·차콜 배경·15px 모서리를 사용한다. 사진은 로컬 에셋으로 제공한다. 높이가 낮은 화면에서는 카드와 사진을 줄이고, 선택창·대륙 필터의 실제 경계를 이용해 배치한다.

모바일은 제목·워드마크·설명과 CTA·작은 로마 소개·여행지 선택·지구본 순서다. 도시 카드도 작은 사진과 제목·여행 정보·링크로 줄인다. 높이 700px 이하의 작은 휴대폰과 가로 화면에서는 로마 소개를 첫 지구본 바로 아래로 내려 콘텐츠와 조작부의 겹침을 피한다. 가장 작은 화면의 지도 카드는 제목과 여정 링크를 우선한다.

지구본 핀을 선택하면 현재 방향에서 새 도시까지 부드럽게 가속·감속하며 회전한다. hover로 멈추는 자동 회전과 사용자가 요청한 카메라 이동을 분리한다. 초기 렌더는 최종 위치에서 표시하고, 모션 끄기·움직임 줄이기 설정은 존중한다.

첫 화면의 제목·설명·시작 버튼·하단 정보는 헤더 로고의 왼쪽 끝에 맞춘다. 헤더의 1240px 최대 너비와 공통 좌우 여백 변수를 기준으로 계산하고, 화면별 개별 비율로 왼쪽 위치를 지정하지 않는다. 기본 여백은 48px, 1200px 이하에서는 36px, 767px 이하에서는 20px이며 기기의 안전 영역을 존중한다. 모바일 가로 화면도 같은 기준을 따르며, 첫 화면의 핵심 문구·지구본·여행 시작 조작부가 한 화면에 들어가도록 조정한다.

지구본에서 내려오는 MapLibre 캔버스를 도착 후에도 유지한다. 비행 도착 지점은 대화창 영역을 고려해 미리 계산하며, 도착할 때 카메라 위치·배율·기본 지도를 다시 설정하지 않는다. 소개 문구는 비행 중 사라지고, 도착한 지도 위에 대화창이 자동으로 나타난다. 페이지 스크롤이나 소개 화면으로 돌아가는 추가 전환을 만들지 않는다. 같은 스크롤 장면에서 아이로가 먼저 ‘어디를 가시겠어요?’라고 묻는다. 목적지를 선택하기 전에는 사용자 요청문·확정 경로·식당 후보를 표시하지 않는다. 두 명소 중 하나를 고르면 핀이 나타나고 실제 도로를 따라 빛과 경로가 약 2.5초 동안 이어진다. 완료 후 식당·카페·술집·디저트 선택지를 열고, 선택한 장소를 다음 채팅으로 추가하면 경유 경로를 다시 그린다. 페이지 스크롤이 사용자의 선택을 대신하지 않으며, 다시 보기·지구본 복귀는 대화를 초기화하고 진행 중인 경로 모션을 취소한다. 식당·카페·술집·디저트를 탐색하는 동안 저장한 경로는 유지하며, 다음 메시지로 새 장소를 순서대로 누적한다. 출발 → 식당 → 카페 → 디저트 → 목적지처럼 앞서 고른 장소를 유지하고, 새 장소는 마지막 경유지 다음에 추가한다. 이전 경유 구간은 그대로 보존하고 이동하는 빛은 마지막 경유지에서 새 구간으로 이어진다. 목적지 변경은 현재 들를 곳을 유지하고 마지막 도착지만 바꾸며, 변경 취소는 기존 경로를 유지한다. 처음부터 비우는 동작은 ‘다시 보기’와 지구본 복귀로 구분한다. 대화창 상단에 현재 방문 순서를 계속 표시하고 중복 장소의 재등록을 막는다. 핀과 경로는 유지 중인 실제 지도 카메라로 좌표를 투영한다. 모바일의 지도 위·대화 아래 배치와 키보드 입력을 지원하고, 기기 회전 시 같은 지도 안에서 표시 범위를 맞춘다. 검정 지도 장면과 Air Blue 대비는 밝은 테마에서도 유지한다.

## Elevation & Depth

검정 바탕에 중립색 카드와 제한된 테두리를 사용한다. 색상의 차이는 조작 우선순위를 전달하는 데 사용한다.

## Shapes

승인된 제비의 실루엣과 AIRO 자형을 보존한다. 로고와 버튼에 추가 그라데이션을 사용하지 않는다.

## Components

헤더의 로고는 브랜드 블루, 일반 메뉴는 중립색이다. 주요 동작은 블루 바탕과 검정 글자다. 선택된 도시는 블루 핀/테두리와 이름·번호로 표시하고 비활성 도시는 중립색이다. 흰 제목으로 내용의 우선순위를 유지한다.

## Do's and Don'ts

색상은 역할별 토큰으로 연결한다. 브랜드 색을 여러 독립적인 초록·보라·아이보리 포인트로 분산하지 않는다. 모든 제목과 아이콘을 브랜드 색으로 칠하지 않는다. 버튼 내부 글자 대비와 지도 위 실제 인접색을 각각 검사한다. 모든 상태에서 키보드 포커스와 색 이외의 선택 단서를 확인한다.

근거: [Material 색상 역할](https://codelabs.developers.google.com/customizing-material-color), [WCAG 텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [비텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Google Labs DESIGN.md](https://github.com/google-labs-code/design.md).

추가 목적지의 경로는 기존 OpenStreetMap/Valhalla 보행 경로에 포함된 도로 구간만 연결해 계산한다. 경유 장소의 실제 좌표와 기존 출처를 유지하고, 연결되지 않은 경로를 직선으로 대체하지 않는다. 추가 경로의 도보 시간은 시속 4.5km 기준 추정치다. `scripts/verify-landing-targets.py`가 53개 도시·106개 목적지와 689개 추가 경로의 모든 도로 구간·출발/도착·장소 경유 좌표를 검증한다.

상단 내비게이션의 별도 ‘시작하기’ 버튼은 제거한다. ‘다음 여행은 어디로?’ 선택 영역은 데스크톱 16px, 일반 모바일 8px, 작은 모바일·가로 화면 6px 위로 옮기고 실제 소개 영역과의 간격을 검증한다. 누적 경유 경로는 기존 두 목적지의 검증된 보행 도로 좌표를 그래프로 연결해 최단 경로를 계산한다. 새 직선 구간은 만들지 않으며 기존 순서·경유 구간을 보존한다. `scripts/test-cumulative-roads.mjs`가 53개 도시·두 목적지·다섯 경유지 순서와 도로 구간 일치를 검증한다.
