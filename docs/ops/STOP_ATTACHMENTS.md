# 장소 상세의 PDF·예약 연결

2026-09-18 운영 반영. 장소를 일정·지도에서 누르면 구글지도·길찾기와 함께 연결된 PDF 및 예약 링크가 표시된다. 이름이 같다는 이유만으로 자료를 추측해 연결하지 않는다. 연결된 자료가 없는 장소는 기존 지도 동작을 유지한다.

PDF 버튼의 기본 동작은 모달 미리보기다. 장소 카드와 자료 목록에서 같은 컴포넌트를 사용한다. 모달 안에서 페이지 이동·크게 보기/작게 보기·새 탭·다운로드를 선택하며, 닫으면 원래 화면과 버튼 포커스로 돌아온다. 브라우저 내장 PDF 플러그인 대신 [PDF.js](https://mozilla.github.io/pdf.js/examples/)로 페이지를 그려 모바일에서도 모달에 표시한다. `pdfjs-dist` 6.3.289를 고정했고 `prepare-pdf-viewer.mjs`가 worker·CJK 문자 매핑·기본 글꼴·WASM을 앱의 `/vendor/pdfjs/`에 준비한다. 모달을 열기 전에는 PDF 원본을 요청하지 않으며 외부 렌더링 API를 호출하지 않는다. Chrome/WebKit에서 실제 2페이지 PDF의 표시·이동·확대·닫기·포커스 복귀·불러오기 실패 후 재시도를 검증했다.

MCP 도구는 25개를 유지하면서 다음 필드를 확장했다.

- `attachDocument.stopIds`: PDF를 표시할 장소 ID 목록. 연박 장소 여러 개를 지정할 수 있다. 동일 PDF를 다시 첨부할 때 생략하면 기존 연결을 보존하고, 명시하면 연결 목록을 교체한다. `[]`는 연결 해제다.
- `setReservation.reservation.bookingUrl`: 실제 예약 상세 또는 플랫폼 공유 HTTPS 주소.
- `setReservation.reservation.documentSha256s`: `listDocuments`에서 확인한 PDF SHA-256 목록.
- `setReservation.reservation.stopIds`: 기존 `stopId` 외에 같은 예약을 표시할 추가 장소. 상태·예약번호는 기존 필드를 사용한다.

메모에 저장된 기존 예약 플랫폼 URL도 버튼으로 표시한다. Trip.com이라는 플랫폼만 확인되고 주소가 없으면 공식 예약 목록으로 연결한다. 예약 상세 주소를 예약번호로 추측해서 만들지 않는다. Trip.com HTTPS 링크에 공식 iOS 연결 설정의 `wkp=1`을 사용하며, 앱이 처리하지 않으면 해당 웹 주소로 열린다. 지원 근거: [Apple 앱 연결 설정](https://kr.trip.com/.well-known/apple-app-site-association), [Android 앱 연결 설정](https://kr.trip.com/.well-known/assetlinks.json). 실제 앱 실행은 설치 여부·OS·사용자 링크 설정에 따라 달라지며 물리 기기에서의 앱 전환은 미검증이다.

`0011_stop_attachments.sql`은 PDF·예약 연결 입력을 검증하고 `get_trip_attachments`로 PDF 원본을 제외한 메타데이터만 반환한다. `/api/trips/{tripId}`의 갱신 응답과 ETag에 이 메타데이터를 포함한다. Cloudflare가 압축 과정에서 약한 ETag를 반환해도 동일 데이터에 304로 응답한다. 초기 서버 렌더링과 이후 5초·앱 복귀 갱신 모두 자료를 표시한다.

PDF는 `/api/trips/{tripId}/documents/{sha256}?view=1`에서 `application/pdf`, `inline`, `private, no-store`로 제공한다. 기존 숫자 인덱스와 다운로드 동작도 유지한다. 소유자 인증이 필요하고 다른 계정의 PDF는 RLS로 차단한다. 내보내기는 장소의 `source_id`를 보존해 다시 가져와도 연결이 유지된다.

기존 여행의 명시된 숙소명·숙박 날짜·편명과 PDF 파일명을 대조해 예약 PDF 12개를 관련 장소에 연결했다. UNPLAN의 첫 1박과 이후 4박은 서로 다른 PDF로 연결했다. 나머지 여행 전체 PDF는 자료 화면에 유지한다. 원본 PDF·장소 메모·예약/결제 상태는 변경하지 않았다. 연결 변경은 변경 이력으로 남는다.

검증: MCP SDK 계약 및 PGlite `0001–0011`, 링크 변경의 이력/복원·소유자 격리·잘못된 장소/문서/URL 거부, Chrome 1440/390 및 WebKit 320의 자료 버튼·자료만 수정한 갱신·기존 스와이프, TypeScript·ESLint·production build. 운영 인증 세션에서 UNPLAN PDF 응답의 SHA-256과 첨부 원본 일치, inline 헤더, 비인증 401을 확인했다. 근거는 `.private/deployment/stop-attachments-20260918/`와 `stop-attachments-20260918-final/`에 있다.
