# 사용 자료

- 제비 로고·AIRO 워드마크: 기존 승인 자산 `public/brand/airo-logo-swift-gpt.webp`, `airo-mark-swift-gpt.webp`를 변경 없이 사용.
- 로마 골목 사진: Tobias Tullius / [Unsplash](https://unsplash.com/photos/Jfm2JZ6XguM), [Unsplash License](https://unsplash.com/license). `public/travel/rome-alley.jpg`를 원본 그대로 재사용. 상위 출처 기록: `assets/editorial/CREDITS.md`.
- 번들 로마 지도: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. `public/maps/rome-detail.geojson`에서 파생. `python3 android/scripts/prepare-map-assets.py`로 재생성한다. 4점 미만의 퇴화 polygon만 제거하며 유효한 도로 좌표를 바꾸지 않는다.
- Cloud 지도: © OpenStreetMap contributors · [CARTO](https://carto.com/attributions). 네트워크 연결 필요.
- 지도 엔진: [MapLibre Native](https://github.com/maplibre/maplibre-native), BSD 2-Clause.
- 앱 소스: 저장소 [AGPL-3.0](../LICENSE). 별도 Enterprise 파일의 라이선스는 각 경로의 고지를 따른다.

시작 화면의 사진·지도 출처와 지도 하단 표기에서도 확인할 수 있다. 이번 Android 완성 작업에서 이미지 생성 API를 사용하지 않았다.
