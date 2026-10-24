# Android 0.3.3 — Day 패널·Todo·외부 앱 연결

2026-09-18, versionCode 6. Kotlin/Compose 네이티브 앱. 웹 API와 DB 변경 없음.

## 반영한 동작

- Day 창 전체를 접고 ‘Day N · 펼치기’로 복원한다. 넓은 화면에서도 접으면 지도가 그 공간을 사용한다. 화면 재생성 후 접힌 상태를 유지한다.
- 장소 상세와 상세 일정에서 ‘전체 일정 보기’를 눌러 선택을 해제하고 여행 전체 지도와 일정으로 돌아간다.
- 장소명은 한 줄만 표시하며 복사 아이콘은 저장된 현지명/지도 검색어(`map_query`)를 복사한다. 없으면 표시 이름을 사용한다. 번역 API를 호출하지 않는다.
- Day 0·Day 1의 출국 전 Todo는 기존 Day 패널 내용을 전환해 표시한다. 체크·추가·저장과 전체 일정 복귀가 가능하다. 확대 버튼으로 큰 창, 축소 버튼으로 패널에 돌아오며 체크와 입력 초안을 유지한다. 작은 창의 돌아가기·확대 버튼은 스크롤해도 유지한다. 저장은 기존 revision 충돌 검사와 같은 서버 목록을 사용한다.
- 기존 일정 진행 기능 유지: 직접 체크, 시간, 위치, 위치 또는 시간. 수동 해제는 자동 체크보다 우선한다. 위치 자동 체크 시작에서만 권한을 요청하고 전경 여행 화면에서만 수집한다. 날짜·시간대·정확도·오래된 위치를 검사한다. 완료 개수와 완료 출처를 표시한다.
- Trip.com·Agoda·Booking.com·Airbnb·Expedia HTTPS 예약 링크를 해당 설치 앱에 먼저 전달한다. 처리할 앱이 없으면 같은 HTTPS 주소로 Android URL 열기를 사용한다. 예약 파라미터를 보존하며 Trip.com에는 웹처럼 `wkp=1`을 적용한다.
- Todo 확대 창과 여행 자료의 QR·이미지 영역에서 ‘삼성월렛 열기’를 제공한다. 설치된 `com.samsung.android.spay`의 실행 화면만 연다. 미설치 기기는 비활성화한다. 패스 발급·결제 SDK·제휴 API 호출은 없다.
- 장소 상세의 ‘캘린더에 추가’는 날짜·시간·장소가 채워진 기기 캘린더 작성 화면을 연다. 최종 저장은 사용자가 캘린더에서 한다. 시간은 여행 진행 설정의 시간대를 쓰고, 시간이 없는 일정은 종일 일정이다. 캘린더 읽기·쓰기 권한 없이 Android intent를 사용한다.
- ‘사진 연결’은 시스템 사진 선택기에서 직접 고른 사진만 연결한다. 최대 20장/장소, 한 번에 10장 선택. 선택 URI만 암호화해 서버·계정·여행·장소별로 이 기기에 보관한다. 재실행/업데이트 후 선택 접근 권한을 유지한다. 썸네일·원본 열기·연결 해제 제공. 연결 해제는 원본 사진을 삭제하지 않는다.

사진은 웹 업로드·여행 JSON 내보내기·다른 기기로 동기화되지 않는다. 촬영 날짜/GPS 전체 자동 탐색과 캘린더 일정 양방향 동기화는 제공하지 않는다. 위치 자동 체크는 앱이 닫힌 동안 실행하지 않는다.

## 검증 기록

증거 폴더: `.private/deployment/android-links-20260918/`.

- Cloud/Demo JVM 각 43건 통과: 예약 URL/위장 호스트, 일정 시간대·Day 0·종일 일정, 현지명 선택, 사진 계정·서버·여행·장소 격리/재로드/중복/한도, 시간·위치 완료 저장과 수동 해제 우선순위 포함.
- Cloud/Demo APK와 Android 테스트 APK 빌드. Lint 오류 0건, 경고 각 39건(의존성 버전·KTX 등).
- Android 16 전용 에뮬레이터: 390dp 10건, 320dp/글꼴 150% 3건, 1024dp 3건 통과. 자동 경로 렌더·Day 접기/재생성·현지명 실제 클립보드·전체 복귀·재생 중지·Todo 초안 확대/축소/저장/Day 1 재조회 포함.
- 실제 시스템 사진 선택기에서 합성 PNG 한 장 선택→픽셀 일치→영구 URI 읽기 권한→화면 재생성 후 썸네일 유지→다른 장소와 격리→연결 해제→원본 유지 확인. 전체 사진 라이브러리 권한 미요청.
- 기존 PDF 선택·공유·원본 미리보기·장소 연결·예약/예산 저장 회귀 검사 통과.
- 웹 기준 20개 소스 변경 검사 통과. 최종 화면 12장은 `final-screens/`, 시험 결과는 `ui-final-*.log`에 저장했다.

실제 삼성 기기에서 Trip.com·Agoda·삼성월렛 및 캘린더 앱으로 전환되는지, 실제 현장 GPS가 정확한지는 기기 E2E 대상이다. 의도한 패키지/URL 및 미설치 fallback은 Android intent 테스트로 검증한다. 별도 과금 API 호출 없음.

## 공식 근거

- [Trip.com Android App Links](https://kr.trip.com/.well-known/assetlinks.json), [Agoda Android App Links](https://www.agoda.com/.well-known/assetlinks.json), [Booking.com](https://www.booking.com/.well-known/assetlinks.json), [Airbnb](https://www.airbnb.com/.well-known/assetlinks.json), [Expedia](https://www.expedia.com/.well-known/assetlinks.json): 공식 앱 패키지 확인.
- [Samsung SDK integration](https://developer.samsung.com/pay/sdks-and-integration/android-sdk.html): Wallet 패키지 확인. 앱 실행은 PackageManager를 사용하며 SDK 의존성을 추가하지 않는다.
- [Android Calendar intents](https://developer.android.com/identity/providers/calendar-provider): 캘린더 작성 화면 열기.
- [Android Photo picker](https://developer.android.com/training/data-storage/shared/photo-picker): 선택 사진과 영구 URI 접근.

## 공개 배포

- 운영 웹 배포 경로와 build ID는 유지하고 다운로드 APK/업데이트 메타데이터만 반영했다. DB·서버 API 변경 없음.
- 공개 업데이트 manifest: versionCode 6. 기존 개발 인증서와 같은 서명, 16KB zip alignment 검사 통과.
- `airo-android-cloud-0.3.3.apk`: 70,914,334 bytes, SHA-256 `f605735af44b7b6c2be7e85a0b70d0f095250b09191ef0ec2ef5e372f3ef1c57`. 공개 HTTPS 전체 다운로드 결과 일치.
- `airo-android-demo-0.3.3.apk`: 70,892,055 bytes, SHA-256 `8dca1cec37f4b13ad961dcc61775c7b48eb940a7ea26e225b0a15fbe30a7c367`. 공개 HTTPS 전체 다운로드 결과 일치.
- 배포 후 웹 200, 비인증 모바일 여행 API 401 확인. `published.json`, `public-health.json`, `verification.json`에 기록했다.
