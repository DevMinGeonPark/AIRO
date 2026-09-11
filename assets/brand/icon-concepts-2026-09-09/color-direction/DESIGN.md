---
version: alpha
name: AIRO Air Blue — proposal
description: 검정 테마의 단일 블루 브랜드 색상 추천 초안
colors:
  primary: "#86A5FF"
  on-primary: "#0A0A0A"
  primary-hover: "#9BB5FF"
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

2026-09-09 색상 추천 초안. 승인된 제비·AIRO 가로형의 형태를 사용한다. 검정 테마에서 기억할 수 있는 단일 블루를 로고와 주요 조작부에 연결하는 안이다. 운영 디자인의 현재 값은 프로젝트의 BRAND.md에 기록되어 있다.

블루의 선택은 제비의 비행 이미지와 현재 지구본의 차가운 중립색을 보고 내린 디자인 판단이다. 특정 색이 신뢰·전환율을 보장한다는 의미는 아니다.

## Colors

- 브랜드: Air Blue `#86A5FF`. 제비·AIRO 워드마크 전체, 핵심 CTA, 현재 선택 표시.
- 기본 바탕: `#0A0A0A`. 카드: `#171717`.
- 제목·본문: `#F3F1EA`. 보조 글자·일반 메뉴: `#A3A3A3`.
- 밝은 블루 버튼 내부 글자: `#0A0A0A`.
- hover: 같은 계열의 `#9BB5FF`.

지정한 불투명 sRGB 색상 쌍의 WCAG 상대 명도 대비 계산: 블루/검정 8.33:1, 블루/카드 7.55:1. 블루 위 흰 글자는 2.38:1로 일반 글자 AA 기준에 미달하므로 버튼 글자는 검정이다. 계산값 표시는 소수 둘째 자리로 반올림했다. 로고 자체의 예외 규정과 별개로 작은 화면에서도 충분한 가독성을 목표로 한다. 전체 UI의 접근성 적합성을 보증하는 측정은 아니다.

대표 색은 하나로 유지하되 배경·글자·강조의 역할은 분리한다. 오류·성공, 여러 일정이나 이동 수단을 구분하는 기능적 색상은 별도 의미로 관리하고 번호·문구·선 모양을 함께 사용한다. 밝은 테마는 별도의 전경/배경 쌍을 검증한 뒤 정한다.

## Typography

승인된 GPT Image AIRO 글자를 유지한다. 워드마크는 별도 폰트로 재조립하지 않는다. 본문·메뉴는 기존 Geist와 한글 시스템 폰트를 사용한다. 작은 글자를 브랜드 색으로 남발하지 않는다.

## Layout

기존 한 화면의 모바일 지구본 배치와 헤더 높이를 기준으로 한다. 이번 제안은 색상 역할을 위한 것으로, 비교 화면의 배치를 운영 레이아웃으로 대체하는 안이 아니다.

## Elevation & Depth

검정 바탕에 중립색 카드와 제한된 테두리를 사용한다. 색상의 차이는 조작 우선순위를 전달하는 데 사용한다.

## Shapes

승인된 제비의 실루엣과 AIRO 자형을 보존한다. 로고와 버튼에 추가 그라데이션을 사용하지 않는다.

## Components

헤더의 로고는 브랜드 블루, 일반 메뉴는 중립색이다. 주요 동작은 블루 바탕과 검정 글자다. 선택된 도시는 블루 핀/테두리와 이름·번호로 표시하고 비활성 도시는 중립색이다. 흰 제목으로 내용의 우선순위를 유지한다.

## Do's and Don'ts

색상은 역할별 토큰으로 연결한다. 브랜드 색을 여러 독립적인 초록·보라·아이보리 포인트로 분산하지 않는다. 모든 제목과 아이콘을 브랜드 색으로 칠하지 않는다. 버튼 내부 글자 대비와 지도 위 실제 인접색을 각각 검사한다. 새 색상 채택 시 모든 상태에서 키보드 포커스와 색 이외의 선택 단서를 확인한다.

근거: [Material 색상 역할](https://codelabs.developers.google.com/customizing-material-color), [WCAG 텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [비텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Google Labs DESIGN.md](https://github.com/google-labs-code/design.md).
