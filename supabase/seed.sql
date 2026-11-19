-- 자동 생성 파일이에요 (npm run seed:sql). 직접 고치지 말고 src/data/fallback.js 를 고친 뒤 다시 만드세요.
-- schema.sql 을 먼저 실행한 뒤 실행하세요. 기존 기본 데이터를 지우고 다시 넣어요 (트렌드 수집본은 기존 행을 남겨요).
begin;

delete from public.season_issues;
delete from public.seasons;
delete from public.herb_designs;
delete from public.herbs;
delete from public.trend_sources;
delete from public.trend_tiers;

insert into public.seasons (name, eng, icon, sort_order) values
  ('봄', 'Spring', '🌸', 0),
  ('여름', 'Summer', '🌊', 1),
  ('가을', 'Autumn', '🍂', 2),
  ('겨울', 'Winter', '❄️', 3);

insert into public.season_issues (season, title, stat, concern, purposes, sort_order) values
  ('봄', '건조한 공기', '최소습도 30% 미만 41.9일', '당김 · 속건조', array['보습', '민감·장벽']::text[], 0),
  ('봄', '황사·미세먼지', '황사 5.4일 · PM10 나쁨 7.0일', '외부 자극으로 예민함', array['진정', '민감·장벽']::text[], 1),
  ('봄', '큰 일교차', '일교차 평균 12.1℃', '환절기 예민함', array['진정', '민감·장벽']::text[], 2),
  ('봄', '자외선 증가', '자외선지수 3월 4.3 → 5월 6.7', '칙칙한 톤', array['미백(톤)']::text[], 3),
  ('여름', '폭염·열대야', '폭염 10.6일 (대구 25.4일)', '열감 · 땀', array['쿨링', '진정']::text[], 0),
  ('여름', '장마·고습', '평균습도 76.7%', '번들거림 · 피지 · 모공', array['모공·피지']::text[], 1),
  ('여름', '강한 자외선', '자외선지수 여름 평균 7.5', '햇볕 노출 · 톤 고민', array['미백(톤)']::text[], 2),
  ('가을', '습도 하락', '최소습도 30% 미만 4.3 → 16.1일', '건조 시작 · 당김', array['보습']::text[], 0),
  ('가을', '일교차', '일교차 평균 10.9℃', '환절기 예민함', array['진정', '민감·장벽']::text[], 1),
  ('가을', '여름 뒤 자외선 누적', '자외선지수 가을 평균 4.2', '칙칙함', array['미백(톤)']::text[], 2),
  ('겨울', '저온·한파', '평균기온 0.5℃ · 한파 6.4일', '푸석함 · 탄력 저하', array['보습', '영양', '탄력']::text[], 0),
  ('겨울', '건조', '최소습도 30% 미만 31.2일', '극건조 · 각질', array['보습', '민감·장벽']::text[], 1),
  ('겨울', '초미세먼지', 'PM2.5 나쁨 이상 11.0일', '외부 자극으로 예민함', array['진정', '민감·장벽']::text[], 2);

insert into public.herbs (name, hanja, purposes, words, seasons, color,
  scent_score, scent_note, gb_score, gb_note, preempt_score, preempt_note, hanbang_score, hanbang_note,
  rival_score, rival_note, origin_score, origin_note, func,
  hanbang_gate_status, hanbang_gate_note, type_gate_status, type_gate_note, sort_order) values
  ('쑥', '艾葉', array['진정', '쿨링']::text[], '진정에 도움, 쿨링감, 산뜻함', array['봄']::text[], '#9DB08A', 1, '향 강 · 특유한 방향', 1, '경북 상위권 아님 (전남 89.8%)', 1, '선점 강함 · 한율, 아임프롬', 1, '한율이 쑥 크림·세럼·토너·미스트 보유', 2, '아임프롬 에센스 ml당 240원이 우리 세럼(380원)보다 낮음', 2, '아임프롬이 ''강화'' 산지를 내세움', null, null, null, null, null, 0),
  ('어성초', '魚腥草', array['진정', '쿨링', '모공·피지']::text[], '진정에 도움, 쿨링감, 피지 관리, 보송함', array['여름']::text[], '#8FB9A8', 1, '향 강 · 비비면 비린내', 4, '경북 48.1% (1위)', 1, '선점 강함 · 아누아, 아비브', 5, '한방 브랜드 제품 없음', 5, '아누아 토너 ml당 100원 > 우리 토너 75원', 5, '경쟁 제품이 산지를 내세우지 않음', null, null, null, null, null, 1),
  ('인삼', '人蔘', array['보습', '영양', '탄력']::text[], '촉촉함, 영양, 윤기, 탄력 있어 보이는', array['겨울']::text[], '#E3C9A0', 3, '향 중 · 특유한 냄새', null, '생산 통계가 따로 있어 확인 필요', 1, '선점 강함 · 조선미녀, 설화수, 플렌티플랜트', 1, '설화수·조선미녀 제품 있음', 5, '조선미녀 ml당 567원 > 우리 세럼 380원', 5, '경쟁 제품이 산지를 내세우지 않음', null, null, null, null, null, 2),
  ('홍삼', '紅蔘', array['영양', '탄력']::text[], '영양, 윤기, 탄력 있어 보이는', array['겨울']::text[], '#B5655A', 3, '향 중 · 특유한 냄새', null, '생산 통계 없음', 5, '스킨케어로는 약함 · 랩1899', 1, '다나한(한방) 홍삼 제품 있음', 5, '랩1899 ml당 960원 > 우리 세럼 380원', null, '경쟁 제품 산지 강조 확인 필요', null, null, null, null, null, 3),
  ('당귀', '當歸', array['영양']::text[], '영양, 윤기, 매끄러움', array['가을', '겨울']::text[], '#A88C7D', 5, '향 약 · 약간 특유한 냄새', 4, '경북 30.8% (2위)', 5, '선점 약함 · 경쟁 제품 찾지 못함', 5, '한방 브랜드 제품 없음', 5, '경쟁 제품 없음', 5, '경쟁 제품 없음', null, null, null, null, null, 4),
  ('감초', '甘草', array['진정', '민감·장벽', '미백(톤)']::text[], '진정에 도움, 장벽 보습, 맑아 보이는 피부톤', array['봄', '여름', '가을', '겨울']::text[], '#A9BFA3', 5, '향 약 · 약간 특유한 냄새', 3, '경북 13.3% (2위)', 3, '선점 보통 · 잇츠스킨, 루트리, 아크웰 (기능성 보고 16건, 2026년 8월 6건)', 5, '한방 브랜드 제품 없음', 5, '잇츠스킨 ml당 513원 > 우리 세럼 380원', 5, '경쟁 제품이 산지를 내세우지 않음', '유용성감초추출물이 미백 고시 성분이라 보고로 가능 (원료 규격 확인 필요)', null, null, null, null, 5),
  ('병풀', '', array['진정', '민감·장벽']::text[], '진정에 도움, 장벽 보습', array['봄', '여름']::text[], '#7FA88A', null, '향 미확인 (공정서에 약재 항목 없음)', null, '생산 통계 없음', 1, '선점 강함 · 스킨1004, 브링그린', 5, '한방 브랜드 제품 없음', 2, '브링그린 토너 ml당 60원이 우리 토너(75원)보다 낮음', 2, '스킨1004가 ''마다가스카르'' 산지를 내세움', null, 'UNKNOWN', '공정서 약재가 아니라 ''한방 원료''로 소개할 근거 확인 필요', null, null, 6),
  ('황기', '黃芪', array['영양']::text[], '영양, 윤기, 매끄러움', array['가을', '겨울']::text[], '#E2CB7E', 5, '향 약 · 특유한 냄새 약간', 3, '경북 20.1% (3위)', 5, '선점 약함 · 경쟁 제품 찾지 못함', 5, '한방 브랜드 제품 없음', 5, '경쟁 제품 없음', 5, '경쟁 제품 없음', null, null, null, null, null, 7),
  ('작약', '芍藥', array['미백(톤)']::text[], '맑아 보이는 피부톤, 생기', array['봄', '가을']::text[], '#E8B9C0', 3, '향 중 · 특유한 냄새', 5, '경북 58.0% (1위)', 5, '선점 약함 · 구달 앰플 1개', 5, '한방 브랜드 제품 없음', 5, '구달 ml당 760원 > 우리 세럼 380원', 5, '경쟁 제품이 산지를 내세우지 않음', '작약은 고시 성분이 아니라 고시 성분(예: 나이아신아마이드)을 따로 배합해 보고', null, null, null, null, 8),
  ('오미자', '五味子', array['보습']::text[], '촉촉함, 수분 공급', array['여름', '가을']::text[], '#D9B8AE', 5, '향 약 · 냄새 약간', 4, '경북 40.7% (1위)', 5, '스킨케어로는 약함 · 파넬 워시오프 세럼 1개', 5, '한방 브랜드 제품 없음', 5, '파넬 ml당 1,367원 > 우리 세럼 380원', 5, '경쟁 제품이 산지를 내세우지 않음', null, null, null, null, null, 9),
  ('오가피', '五加皮', array['민감·장벽', '탄력']::text[], '장벽 보습, 탄력 있어 보이는', array['봄', '겨울']::text[], '#8C7A9B', 3, '향 중 · 특유한 냄새', 1, '경북 상위권 아님 (충남 30.8%)', null, '경쟁 제품 조사 대상 밖', null, '확인 필요', null, '확인 필요', null, '확인 필요', null, null, null, null, null, 10),
  ('길경', '桔梗', array['모공·피지']::text[], '피부·모공 노폐물 세정, 피지 관리', array['여름']::text[], '#C9B7D6', 5, '향 약 · 특유한 냄새 약간', 3, '경북 19.6% (2위)', null, '경쟁 제품 조사 대상 밖', null, '확인 필요', null, '확인 필요', null, '확인 필요', null, null, null, 'FAIL', '원료 후보표에서 클렌저용 원료로 분류 · 토너·세럼·크림 기초라인에는 맞지 않음', 11);

insert into public.herb_designs (herb, main, cap, liquid, motif, from_label) values
  ('쑥', '#F0F9E9', '#83B966', '#F3F6F0', 'leaf', '맑은 라이트 그린'),
  ('어성초', '#E4FAF0', '#268C65', '#F0F8F6', 'leaf', '라이트 민트 · 선명한 그린'),
  ('인삼', '#FFF7E5', '#D4AE61', '#FAF8F1', 'root', '밝은 아이보리 · 허니 포인트'),
  ('홍삼', '#FFF0F1', '#E47888', '#F8F0F1', 'root', '라이트 핑크 · 코랄 포인트'),
  ('당귀', '#FFF6E2', '#C7AC78', '#F8F5EF', 'root', '밝은 크림 아이보리 · 샌드 베이지'),
  ('감초', '#FFF8E8', '#C8AD73', '#FFF9ED', 'root', '크림 아이보리 · 옅은 허니 베이지'),
  ('병풀', '#ECFBF0', '#57B983', '#F1F7F3', 'leaf', '맑은 화이트 · 시카 그린'),
  ('황기', '#FFFBE6', '#DEC05B', '#FAF9EF', 'root', '밝은 화이트 · 버터 옐로'),
  ('작약', '#FFFBFD', '#F0AECF', '#FBF5F8', 'flower', '클린 화이트 · 맑은 페일 핑크'),
  ('오미자', '#FFE9F3', '#EB80AF', '#F8EDF2', 'berry', '라이트 핑크 · 프레시 로즈'),
  ('오가피', '#F4EEFF', '#B297DC', '#F6F3F9', 'root', '맑은 라벤더'),
  ('길경', '#E9F5FF', '#6BADE0', '#F2F5FA', 'flower', '클리어 스카이 블루');

insert into public.trend_tiers (id, name, cadence, rule, sort_order) values
  ('signal', '실시간 신호', '매주', '숫자로 나오는 최근 흐름. 트렌드 한마디의 주 근거', 0),
  ('case', '업계 사례', '매일~매주', '실제로 나온 제품·움직임. ''이런 사례가 있다''로만 사용', 1),
  ('background', '배경 자료', '연 1~2회', '큰 방향 설명용. ''지금 뜬다''·''판매 증가''로 바꿔 말하지 않음', 2);

insert into public.trend_sources (id, name, url, type, tier, sort_order) values
  ('google-trends', 'Google Trends', 'https://trends.google.com/trends/explore', '검색 관심', 'signal', 0),
  ('spate', 'Spate', 'https://www.spate.nyc/resources/reports', '검색·소셜 분석', 'signal', 1),
  ('cosme', '@cosme 랭킹', 'https://s.cosme.net/ranking', '일본 제품 리뷰·랭킹', 'signal', 2),
  ('naver-datalab', '네이버 데이터랩 (검색어 트렌드·쇼핑인사이트)', 'https://datalab.naver.com/', '국내 검색·쇼핑 관심', 'signal', 3),
  ('nedrug', '의약품안전나라 (기능성화장품 보고)', 'https://nedrug.mfds.go.kr/', '기능성 제품 보고 현황', 'signal', 4),
  ('hwahae', '화해 랭킹', 'https://www.hwahae.co.kr/rankings', '리뷰 기반 랭킹', 'signal', 5),
  ('oliveyoung-ranking', '올리브영 판매 랭킹', 'https://www.oliveyoung.co.kr/store/main/getBestList.do', '판매 랭킹', 'signal', 6),
  ('kosis-online', '통계청 온라인쇼핑동향 (KOSIS)', 'https://kosis.kr/', '화장품 온라인 거래액 (매월)', 'signal', 7),
  ('customs-trade', '관세청 수출입 무역통계', 'https://tradedata.go.kr/', '화장품 수출 (매월)', 'signal', 8),
  ('oliveyoung', '올리브영', 'https://corp.oliveyoung.com/ko/newsroom/press', '공식 콘텐츠·판매랭킹', 'case', 9),
  ('jangup', '장업신문', 'https://www.jangup.com/', '업계 기사', 'case', 10),
  ('cosmetics-business', 'Cosmetics Business', 'https://www.cosmeticsbusiness.com/cosmetics-business-reveals-the-top-5-skin-care-2', '업계 기사·제품 사례', 'case', 11),
  ('cosmorning', '코스모닝', 'https://www.cosmorning.com/', '국내 업계 기사', 'case', 12),
  ('thebk', '뷰티경제', 'https://www.thebk.co.kr/', '국내 업계 기사', 'case', 13),
  ('mintel', 'Mintel · GNPD', 'https://www.mintel.com/insights/beauty-and-personal-care/', '시장 전망·신제품 데이터', 'background', 14),
  ('niq', 'NielsenIQ', 'https://nielseniq.com/global/en/insights/report/2026/niq-state-of-global-beauty-2026/', '구매·시장 데이터', 'background', 15),
  ('mckinsey', 'McKinsey — State of Beauty', 'https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/state-of-beauty', '시장·채널 전망', 'background', 16),
  ('cosmotrends', 'Cosmoprof × BEAUTYSTREAMS — CosmoTrends', 'https://lp.cosmoprof.com/hubfs/BEAUTYSTREAMS_CosmoProfWorldwideBologna_CosmoTrends_2026_compressed.pdf', '전시·제품 혁신', 'background', 17),
  ('pinterest', 'Pinterest Predicts', 'https://business.pinterest.com/en-gb/pinterest-predicts/', '시각 트렌드·검색 전망', 'background', 18),
  ('kcii', '대한화장품산업연구원', 'https://www.kcii.re.kr/', '국내 산업 보고서', 'background', 19),
  ('kotra', 'KOTRA 해외시장뉴스', 'https://dream.kotra.or.kr/', '국가별 시장 동향', 'background', 20),
  ('opensurvey', '오픈서베이 뷰티 트렌드 리포트', 'https://blog.opensurvey.co.kr/trendreport/beauty-2026/', '국내 소비자 조사', 'background', 21);

-- 뷰티 트렌드 수집본: 같은 updatedAt 행이 없을 때만 넣어요.
insert into public.beauty_trend_snapshots (updated_at, payload)
select '2026-11-13T01:44:27Z'::timestamptz, '{"version":1,"updatedAt":"2026-11-13T01:44:27Z","intervalMinutes":60,"lookbackDays":90,"sourceChecks":[{"id":"google-trends","source":"Google Trends","url":"https://trends.google.com/trends/explore","checkedAt":"2026-11-13T02:41:55Z","status":"unavailable","http":429,"note":"자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"},{"id":"spate","source":"Spate","url":"https://www.spate.nyc/resources/reports","checkedAt":"2026-11-13T02:41:56Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"cosme","source":"@cosme 랭킹","url":"https://s.cosme.net/ranking","checkedAt":"2026-11-13T02:41:56Z","status":"unavailable","http":403,"note":"자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"},{"id":"naver-datalab","source":"네이버 데이터랩 (검색어 트렌드·쇼핑인사이트)","url":"https://datalab.naver.com/","checkedAt":"2026-11-13T02:41:56Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"nedrug","source":"의약품안전나라 (기능성화장품 보고)","url":"https://nedrug.mfds.go.kr/","checkedAt":"2026-11-13T02:41:56Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"hwahae","source":"화해 랭킹","url":"https://www.hwahae.co.kr/rankings","checkedAt":"2026-11-13T02:41:57Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"oliveyoung-ranking","source":"올리브영 판매 랭킹","url":"https://www.oliveyoung.co.kr/store/main/getBestList.do","checkedAt":"2026-11-13T02:41:57Z","status":"unavailable","http":403,"note":"자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"},{"id":"kosis-online","source":"통계청 온라인쇼핑동향 (KOSIS)","url":"https://kosis.kr/","checkedAt":"2026-11-13T02:41:57Z","status":"checked","http":302,"note":"허용된 주소로 이동 (kosis.kr)"},{"id":"customs-trade","source":"관세청 수출입 무역통계","url":"https://tradedata.go.kr/","checkedAt":"2026-11-13T02:41:57Z","status":"checked","http":302,"note":"허용된 주소로 이동 (tradedata.go.kr)"},{"id":"oliveyoung","source":"올리브영","url":"https://corp.oliveyoung.com/ko/newsroom/press","checkedAt":"2026-11-13T02:41:57Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"jangup","source":"장업신문","url":"https://www.jangup.com/","checkedAt":"2026-11-13T02:41:57Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"cosmetics-business","source":"Cosmetics Business","url":"https://www.cosmeticsbusiness.com/cosmetics-business-reveals-the-top-5-skin-care-2","checkedAt":"2026-11-13T02:41:57Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"cosmorning","source":"코스모닝","url":"https://www.cosmorning.com/","checkedAt":"2026-11-13T02:41:58Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"thebk","source":"뷰티경제","url":"https://www.thebk.co.kr/","checkedAt":"2026-11-13T02:41:59Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"mintel","source":"Mintel · GNPD","url":"https://www.mintel.com/insights/beauty-and-personal-care/","checkedAt":"2026-11-13T02:42:00Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"niq","source":"NielsenIQ","url":"https://nielseniq.com/global/en/insights/report/2026/niq-state-of-global-beauty-2026/","checkedAt":"2026-11-13T02:42:00Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"mckinsey","source":"McKinsey — State of Beauty","url":"https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/state-of-beauty","checkedAt":"2026-11-13T02:42:01Z","status":"unavailable","http":403,"note":"자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"},{"id":"cosmotrends","source":"Cosmoprof × BEAUTYSTREAMS — CosmoTrends","url":"https://lp.cosmoprof.com/hubfs/BEAUTYSTREAMS_CosmoProfWorldwideBologna_CosmoTrends_2026_compressed.pdf","checkedAt":"2026-11-13T02:42:01Z","status":"checked","http":200,"note":"PDF 보고서 열림"},{"id":"pinterest","source":"Pinterest Predicts","url":"https://business.pinterest.com/en-gb/pinterest-predicts/","checkedAt":"2026-11-13T02:42:01Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"kcii","source":"대한화장품산업연구원","url":"https://www.kcii.re.kr/","checkedAt":"2026-11-13T02:42:03Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"kotra","source":"KOTRA 해외시장뉴스","url":"https://dream.kotra.or.kr/","checkedAt":"2026-11-13T02:42:03Z","status":"checked","http":200,"note":"공개 페이지 열림"},{"id":"opensurvey","source":"오픈서베이 뷰티 트렌드 리포트","url":"https://blog.opensurvey.co.kr/trendreport/beauty-2026/","checkedAt":"2026-11-13T02:42:04Z","status":"checked","http":200,"note":"공개 페이지 열림"}],"items":[{"id":"oy-editorial-311","source":"올리브영","kind":"공식 브랜드 콘텐츠","title":"DEEP DIVE NEWS 앵커로 변신한 코르티스","url":"https://corp.oliveyoung.com/ko/newsroom/editorial/311","publishedAt":"2026-10-26","checkedAt":"2026-11-13T01:44:27Z","eventPeriod":"2026-08-14~2026-08-25 팝업 사례","summary":"수분·진정 제품을 피부 고민별로 탐색하는 체험 사례와 산뜻한 사용감·속보습을 강조한 세럼을 소개했다. 현재 판매 증가나 시장 전체의 선호를 입증하는 자료는 아니다.","tags":["수분","진정","산뜻한 사용감","속보습"]},{"id":"jangup-100295","source":"장업신문","kind":"업계 기사","title":"‘건조주의보 발령’… 가을철 환절기, 스킨케어 핵심 ‘보습’","url":"https://www.jangup.com/news/articleView.html?idxno=100295","publishedAt":"2026-10-28","checkedAt":"2026-11-13T01:44:27Z","summary":"가을 환절기 보습 루틴과 보습 지속감을 강조하는 제품 사례를 다뤘다. 소비자 전체의 구매 선호를 측정한 조사로 해석하지 않는다.","tags":["환절기","보습","지속감"]},{"id":"jangup-100226","source":"장업신문","kind":"업계 기사","title":"가을 야외활동 증가 다양한 기능성 ‘선케어’ 주목","url":"https://www.jangup.com/news/articleView.html?idxno=100226","publishedAt":"2026-10-21","checkedAt":"2026-11-13T01:44:27Z","summary":"야외 활동·데일리 용도에 따른 선케어 세분화와 유분 관리·보송한 사용감 등의 제품 사례를 소개했다. 선케어 자료를 기초 제품의 자외선 차단 효능 근거로 사용하지 않는다.","tags":["자외선","유분","보송한 사용감"]}],"insights":{"봄":{"line":"봄 기초라인은 ‘순한 진정과 장벽 보습’을 중심으로 잡아보세요. 가벼운 보습 제형과 편안한 사용감을 먼저 비교하면 좋아요.","tip":"토너·세럼·크림의 역할을 나누고, 환절기에도 부담 없이 쓰기 좋은 사용감을 차별점으로 검토해 보세요.","evidenceIds":["oy-editorial-311","jangup-100295"]},"여름":{"line":"여름 기초라인은 ‘수분은 채우고, 마무리는 산뜻하게’를 방향으로 잡아보세요. 가벼운 토너·세럼과 젤 크림 조합부터 검토하면 좋아요.","tip":"샘플을 비교할 때 흡수감·끈적임·덧바른 뒤 밀림을 우선 확인하고, 산뜻한 수분·진정을 핵심 메시지로 잡아보세요.","evidenceIds":["oy-editorial-311","jangup-100226"]},"가을":{"line":"가을 기초라인은 ‘겹쳐 바르는 수분 보습과 편안한 마무리’를 제안해 보세요. 토너·세럼·크림이 단계별로 다른 역할을 갖도록 구성하면 좋아요.","tip":"토너·세럼의 레이어링 사용감과 크림의 마무리감을 함께 비교해, 건조함이 시작되는 계절에 맞는 루틴을 설계해 보세요.","evidenceIds":["jangup-100295","jangup-100226"]},"겨울":{"line":"겨울 기초라인은 ‘오래가는 보습과 편안한 사용감’을 중심으로 잡아보세요. 크림을 중심 제품으로 두고 토너·세럼이 보완하는 구성을 검토하면 좋아요.","tip":"보습 지속감과 끈적임의 균형을 먼저 비교하고, 낮에도 쓰기 좋은 조합과 밤에 충분히 바르는 조합을 나눠 제안해 보세요.","evidenceIds":["jangup-100295","oy-editorial-311"]}}}'::jsonb
where not exists (select 1 from public.beauty_trend_snapshots where updated_at = '2026-11-13T01:44:27Z'::timestamptz);

commit;
