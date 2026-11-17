# 청향 시즌 출시 기획실 — 최종 화면 적용 사양

최종 수정: 2026-11-17  
담당: MEJ  
상태: 공개 화면 반영 및 브라우저 확인 완료

- [같은 주소에서 온라인 화면 열기](https://htmlpreview.github.io/?https://github.com/k-1026/AxO/blob/research/presentation/MEJ_출시순위_버튼시안_최신.html)
- [실제 화면 HTML](../presentation/MEJ_출시순위_버튼시안_최신.html)
- [기존 시연·기능 설명](../presentation/MEJ_출시순위_버튼시안_최신.md)

## 로고와 제품 이미지

상단 브랜드와 모든 제품 샘플에 청향 로고를 적용한다. 제품 사진 교체 후에도 기존 원료별 색감 디자인을 유지한다.

| 표시 영역 | 적용 방식 |
|---|---|
| 상단 브랜드 | 청향 워드마크 |
| 기본 라인 한눈에 보기 | 청향 로고가 들어간 원본 샘플 사진 |
| 봄·여름·가을·겨울 컬렉션 후보 카드 | 청향 사진에 각 후보 원료의 기존 팔레트를 적용 |
| 카드를 눌러 여는 상세화면 | 선택한 후보의 기존 팔레트를 적용 |
| 상세화면의 ‘샘플 그대로’ 비교 사진 | 원본 청향 샘플 사진 |
| 상세화면의 ‘색상 변경’ 비교 사진 | 선택한 후보의 기존 팔레트를 적용 |
| 사진 돋보기 | 해당 사진의 로고와 색상 적용 상태를 그대로 확대 |

후보 카드와 상세화면을 모두 동일한 핑크색 원본 샘플로 표시하지 않는다. 기본 표시 모드는 `tint`이며, 원료별 팔레트와 색상 변환 함수는 화면 HTML의 `DESIGN`, `renderPackageFilters`, `tileHtml`을 기준으로 한다.

## 기존 색감 유지 확인

봄 컬렉션의 후보 카드와 상세화면에서 다음 포인트색이 적용되는 것을 확인했다.

| 원료 | 기존 디자인 | 포인트색 |
|---|---|---|
| 감초(甘草) | 크림 아이보리 · 옅은 허니 베이지 | `#C8AD73` |
| 오미자(五味子) | 라이트 핑크 · 프레시 로즈 | `#EB80AF` |
| 작약(芍藥) | 클린 화이트 · 맑은 페일 핑크 | `#F0AECF` |

팔레트 값은 [화면 HTML의 DESIGN 정의](../presentation/MEJ_출시순위_버튼시안_최신.html)에 있는 UI 디자인 값이다. 다른 원료도 같은 정의의 기존 팔레트를 따른다.

## 사용 중인 청향 샘플

| 제품 | 이미지 |
|---|---|
| 토너 | [toner.png](../IMAGE/LOGO/cheonghyang-logo-02/application-examples/toner.png) |
| 세럼 | [serum.png](../IMAGE/LOGO/cheonghyang-logo-02/application-examples/serum.png) |
| 크림 | [cream.png](../IMAGE/LOGO/cheonghyang-logo-02/application-examples/cream.png) |
| 로션 펌프형 | [lotion-pump.png](../IMAGE/LOGO/cheonghyang-logo-02/application-examples/lotion-pump.png) |
| 미스트 | [mist.png](../IMAGE/LOGO/cheonghyang-logo-02/application-examples/mist.png) |

미스트는 사용자 첨부 사진의 영문 로고와 원형 테두리를 청향 로고로 교체했다. 투명 핑크 용기·빨간 분사 펌프·옆의 둥근 투명 캡·우측 확대 사진 구성을 유지했다.

튜브형 로션은 청향 이미지가 아직 없어 기본 샘플에 표시하지 않는다. 미생성 제품의 사진을 다른 제품 사진으로 대체하지 않는다.

⚠️ 이미지들은 AI 생성 디자인 검토용 시안이다. 사진의 작은 ‘오미자’ 표기는 제공된 샘플 디자인이며 다른 원료 후보의 최종 라벨 문구는 별도로 검토해야 한다.

- [이미지 출처·편집 지시문·해시 기록](../IMAGE/LOGO/cheonghyang-logo-02/application-examples/manifest.json)
- [미생성 항목](../IMAGE/LOGO/cheonghyang-logo-02/application-examples/pending-generation.json)

## 확인 내역

- 기본 라인에 청향 토너·세럼·크림·로션 펌프형·미스트 사진이 정상 로딩되는지 확인했다.
- 공개 주소를 새로고침한 뒤 후보 카드의 `data-palette="color-only"`와 원료별 포인트색을 확인했다.
- 상세화면에서 원본 샘플과 색상 변경 사진을 함께 확인했다.
- HTML의 JavaScript 구문과 이미지 연결 경로를 확인했다.

GitHub 원본 이미지·HTML은 캐시 때문에 이전 화면이 잠시 표시될 수 있다. 갱신 직후에는 페이지를 새로고침하고, 계속 이전 화면이면 잠시 후 다시 연다.
