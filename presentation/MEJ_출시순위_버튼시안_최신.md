# CHAHAR 시즌 출시 기획실 — 발표용 최신 시안

최종 갱신: 2026-11-13

- [발표용 HTML 열기](MEJ_출시순위_버튼시안_최신.html)
- [온라인 미리보기](https://htmlpreview.github.io/?https://github.com/k-1026/AxO/blob/research/presentation/MEJ_출시순위_버튼시안_최신.html)
- 원본 작업 파일: [idea/MEJ_출시순위_버튼시안.html](../idea/MEJ_출시순위_버튼시안.html)

## 시연 순서

1. 봄·여름·가을·겨울 탭을 바꿔 기후와 피부 고민을 보여 줍니다.
2. **실시간 뷰티 트렌드는?**에서 근거 기사와 기획 참고점을 확인합니다.
3. 기준 버튼을 눌러 출시 순위 변화를 보여 줍니다.
4. 제품 카드를 눌러 출시 구성과 점수 근거를 확인합니다.

제품 사진은 IMAGE/수정1의 형태·재질을 유지한 색상 시안입니다. No. 배지를 사진과 분리하고, 인테리어 없는 아이보리 탁자 표면색을 사용하고, 원본 제품 사진의 윤곽과 그림자를 유지했습니다. 출처 링크는 ‘근거 보기’를 펼쳐 확인합니다.

트렌드는 올리브영 공식 콘텐츠와 장업신문 기사를 매시간 확인하는 Codex 자동 작업이 데이터 파일을 갱신하며, 화면은 5분마다 최신 수집본을 읽습니다. 기사 날짜와 마지막 확인 시각을 구분합니다. 올리브영 판매랭킹은 직접 확인되지 않아 현재 판단에서 제외되어 있습니다. 발표 때 원문 링크·최신 수집본 갱신에는 인터넷 연결이 필요합니다.

### 트렌드 말풍선 작성 기준

- 기획자가 바로 판단할 수 있도록 **추천 기획 방향 → 먼저 비교할 제형·사용감·라인 구성** 순서로 짧게 제안합니다.
- 매체명이나 기사 소개를 본문의 중심으로 두지 않고, 출처·게시일은 접힌 근거 보기에서 확인합니다.
- 수집 근거에서 얻은 해석을 기획 제안으로 표현하며, 확인되지 않은 대중 선호·판매 증가나 완제품 효능으로 단정하지 않습니다.

### 제품 사진 돋보기

- 제품 사진 위에 마우스를 올리면 커서를 따라 움직이는 지름 230px의 원형 돋보기로 2.6배 확대합니다. 후보 카드를 클릭해 열린 제품 상세 화면의 사진과 원본/색상 변경 비교 사진에만 적용합니다. 메인 후보 카드에는 적용하지 않습니다.
- 사진에서 벗어나거나 스크롤·계절 변경·상세 닫기를 하면 돋보기가 닫힙니다. 터치에서는 기존 카드 선택 동작을 유지합니다.

### 발표 화면의 비율 표시

- 화면에서 가중치 비중(%)과 근거 확보율(%)은 표시하지 않습니다. 점수·추천 이유·확인 필요 항목은 유지합니다.
- 가중치 계산과 기존 순위 판정은 유지합니다.

### 글로벌 트렌드 수집 근거

- 출처 설정: `idea/trend/sources.json`. 모든 출처를 매시간 신규·변경 여부 확인 대상으로 등록합니다. 등록 자체가 최신 내용 수집 완료를 뜻하지는 않습니다.
- 검색 관심·소셜 관심·구매 데이터·시장 전망·신제품 사례·리뷰 랭킹을 구분하고, 국가·기간·조사 범위를 확인합니다. 유료·로그인 자료는 공개 범위만 사용합니다.
- 최근 신호는 90일, 연간 보고서 등 기획 배경 자료는 400일 이내를 사용하고 배경 자료임을 표시합니다. 오래된 전망을 실시간 인기·판매 증가로 바꾸어 말하지 않습니다.

| 출처 | 기획에서 참고할 내용 |
|---|---|
| [올리브영](https://corp.oliveyoung.com/ko/newsroom/press) | 공식 제품·큐레이션 사례. 판매랭킹은 직접 확인된 경우에만 사용 |
| [장업신문](https://www.jangup.com/) | 신제품·원료·제형·계절 케어 사례 |
| [Google Trends](https://trends.google.com/trends/explore) | 국가·기간별 제형·피부 고민 키워드의 상대 검색 관심. 검색량·판매량으로 해석하지 않음 |
| [Spate](https://www.spate.nyc/resources/reports) | 성분·고민·제형의 관심 신호. 각 보고서의 국가·플랫폼·조사기간을 확인 |
| [Mintel · GNPD](https://www.mintel.com/insights/beauty-and-personal-care/) | 소비자 변화·신제품·성분·제품 표현. 공개 요약과 접근 가능한 자료만 사용 |
| [NielsenIQ](https://nielseniq.com/global/en/insights/report/2026/niq-state-of-global-beauty-2026/) | 조사 대상 국가·채널·카테고리·기간이 확인된 구매 흐름 |
| [McKinsey — State of Beauty](https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/state-of-beauty) | 타깃 국가·가격대·채널을 정하는 배경 근거 |
| [Cosmetics Business](https://www.cosmeticsbusiness.com/cosmetics-business-reveals-the-top-5-skin-care-2) | 스킨케어 트렌드·신제품·브랜드 움직임. 기업 홍보와 시장 조사를 구분 |
| [Cosmoprof × BEAUTYSTREAMS — CosmoTrends](https://lp.cosmoprof.com/hubfs/BEAUTYSTREAMS_CosmoProfWorldwideBologna_CosmoTrends_2026_compressed.pdf) | 제형·패키지·콘셉트 발굴. 전시 선정은 판매 성공의 증거가 아님 |
| [Pinterest Predicts](https://business.pinterest.com/en-gb/pinterest-predicts/) | 색감·패키지·비주얼 방향. 플랫폼의 지역·언어·분석기간을 확인 |
| [@cosme 랭킹](https://s.cosme.net/ranking) | 일본 시장의 제품 평가 참고. 리뷰·인기·판매 순위의 산정 기준을 확인 |

- 메인 화면에서는 샘플 그대로 버튼을 제거했습니다. 원본 샘플은 제품 상세 화면의 비교 영역에서 확인합니다.
