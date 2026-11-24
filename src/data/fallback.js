/* Supabase에 연결되지 않았을 때 쓰는 기본 데이터예요.
   supabase/seed.sql 은 이 파일로 만들어요 (npm run seed:sql). 데이터를 바꾸면 SQL도 다시 만들어 주세요. */

/* 계절 기후 → 피부 고민 → 피부 목적. issues: [기후 이슈, 근거 수치, 피부 고민, 피부 목적[]] */
export const SEASONS = {
  "봄":  { eng: "Spring", icon: "🌸", issues: [
    ["건조한 공기", "최소습도 30% 미만 41.9일", "당김 · 속건조", ["보습", "민감·장벽"]],
    ["황사·미세먼지", "황사 5.4일 · PM10 나쁨 7.0일", "외부 자극으로 예민함", ["진정", "민감·장벽"]],
    ["큰 일교차", "일교차 평균 12.1℃", "환절기 예민함", ["진정", "민감·장벽"]],
    ["자외선 증가", "자외선지수 3월 4.3 → 5월 6.7", "칙칙한 톤", ["미백(톤)"]] ] },
  "여름": { eng: "Summer", icon: "🌊", issues: [
    ["폭염·열대야", "폭염 10.6일 (대구 25.4일)", "열감 · 땀", ["쿨링", "진정"]],
    ["장마·고습", "평균습도 76.7%", "번들거림 · 피지 · 모공", ["모공·피지"]],
    ["강한 자외선", "자외선지수 여름 평균 7.5", "햇볕 노출 · 톤 고민", ["미백(톤)"]] ] },
  "가을": { eng: "Autumn", icon: "🍂", issues: [
    ["습도 하락", "최소습도 30% 미만 4.3 → 16.1일", "건조 시작 · 당김", ["보습"]],
    ["일교차", "일교차 평균 10.9℃", "환절기 예민함", ["진정", "민감·장벽"]],
    ["여름 뒤 자외선 누적", "자외선지수 가을 평균 4.2", "칙칙함", ["미백(톤)"]] ] },
  "겨울": { eng: "Winter", icon: "❄️", issues: [
    ["저온·한파", "평균기온 0.5℃ · 한파 6.4일", "푸석함 · 탄력 저하", ["보습", "영양", "탄력"]],
    ["건조", "최소습도 30% 미만 31.2일", "극건조 · 각질", ["보습", "민감·장벽"]],
    ["초미세먼지", "PM2.5 나쁨 이상 11.0일", "외부 자극으로 예민함", ["진정", "민감·장벽"]] ] }
};

/* 원료 후보 48종 (기존 12종 + 원료 후보표 50종 추가분 36종, 피부 효과 근거가 없는 결명자·향부자 제외) + 원료별 경쟁제품. 점수는 [점수(1~5 또는 null), 근거] */
export const HERBS = [
  { herb: "쑥", hanja: "艾葉", purposes: ["진정", "쿨링"], words: "진정에 도움, 쿨링감, 산뜻함", seasons: ["봄"], color: "#9DB08A",
    scent: [1, "향 강 · 특유한 방향"], gb: [1, "경북 상위권 아님 (전남 89.8%)"], preempt: [1, "선점 강함 · 한율, 아임프롬"],
    hanbang: [1, "한율이 쑥 크림·세럼·토너·미스트 보유"], rival: [2, "아임프롬 에센스 ml당 240원이 우리 세럼(380원)보다 낮음"], origin: [2, "아임프롬이 '강화' 산지를 내세움"] },
  { herb: "어성초", hanja: "魚腥草", purposes: ["진정", "쿨링", "모공·피지"], words: "진정에 도움, 쿨링감, 피지 관리, 보송함", seasons: ["여름"], color: "#8FB9A8",
    scent: [1, "향 강 · 비비면 비린내"], gb: [4, "경북 48.1% (1위)"], preempt: [1, "선점 강함 · 아누아, 아비브"],
    hanbang: [5, "한방 브랜드 제품 없음"], rival: [5, "아누아 토너 ml당 100원 > 우리 토너 75원"], origin: [5, "경쟁 제품이 산지를 내세우지 않음"] },
  { herb: "인삼", hanja: "人蔘", purposes: ["보습", "영양", "탄력"], words: "촉촉함, 영양, 윤기, 탄력 있어 보이는", seasons: ["겨울"], color: "#E3C9A0",
    scent: [3, "향 중 · 특유한 냄새"], gb: [null, "생산 통계가 따로 있어 확인 필요"], preempt: [1, "선점 강함 · 조선미녀, 설화수, 플렌티플랜트"],
    hanbang: [1, "설화수·조선미녀 제품 있음"], rival: [5, "조선미녀 ml당 567원 > 우리 세럼 380원"], origin: [5, "경쟁 제품이 산지를 내세우지 않음"] },
  { herb: "홍삼", hanja: "紅蔘", purposes: ["영양", "탄력"], words: "영양, 윤기, 탄력 있어 보이는", seasons: ["겨울"], color: "#B5655A",
    scent: [3, "향 중 · 특유한 냄새"], gb: [null, "생산 통계 없음"], preempt: [5, "스킨케어로는 약함 · 랩1899"],
    hanbang: [1, "다나한(한방) 홍삼 제품 있음"], rival: [5, "랩1899 ml당 960원 > 우리 세럼 380원"], origin: [null, "경쟁 제품 산지 강조 확인 필요"] },
  { herb: "당귀", hanja: "當歸", purposes: ["영양"], words: "영양, 윤기, 매끄러움", seasons: ["가을", "겨울"], color: "#A88C7D",
    scent: [5, "향 약 · 약간 특유한 냄새"], gb: [4, "경북 30.8% (2위)"], preempt: [5, "선점 약함 · 경쟁 제품 찾지 못함"],
    hanbang: [5, "한방 브랜드 제품 없음"], rival: [5, "경쟁 제품 없음"], origin: [5, "경쟁 제품 없음"] },
  { herb: "감초", hanja: "甘草", purposes: ["진정", "민감·장벽", "미백(톤)"], words: "진정에 도움, 장벽 보습, 맑아 보이는 피부톤", seasons: ["봄", "여름", "가을", "겨울"], color: "#A9BFA3",
    scent: [5, "향 약 · 약간 특유한 냄새"], gb: [3, "경북 13.3% (2위)"], preempt: [3, "선점 보통 · 잇츠스킨, 루트리, 아크웰 (기능성 보고 16건, 2026년 8월 6건)"],
    hanbang: [5, "한방 브랜드 제품 없음"], rival: [5, "잇츠스킨 ml당 513원 > 우리 세럼 380원"], origin: [5, "경쟁 제품이 산지를 내세우지 않음"],
    func: "유용성감초추출물이 미백 고시 성분이라 보고로 가능 (원료 규격 확인 필요)" },
  { herb: "병풀", hanja: "", purposes: ["진정", "민감·장벽"], words: "진정에 도움, 장벽 보습", seasons: ["봄", "여름"], color: "#7FA88A",
    scent: [null, "향 미확인 (공정서에 약재 항목 없음)"], gb: [null, "생산 통계 없음"], preempt: [1, "선점 강함 · 스킨1004, 브링그린"],
    hanbang: [5, "한방 브랜드 제품 없음"], rival: [2, "브링그린 토너 ml당 60원이 우리 토너(75원)보다 낮음"], origin: [2, "스킨1004가 '마다가스카르' 산지를 내세움"],
    hanbangGate: ["UNKNOWN", "공정서 약재가 아니라 '한방 원료'로 소개할 근거 확인 필요"] },
  { herb: "황기", hanja: "黃芪", purposes: ["영양"], words: "영양, 윤기, 매끄러움", seasons: ["가을", "겨울"], color: "#E2CB7E",
    scent: [5, "향 약 · 특유한 냄새 약간"], gb: [3, "경북 20.1% (3위)"], preempt: [5, "선점 약함 · 경쟁 제품 찾지 못함"],
    hanbang: [5, "한방 브랜드 제품 없음"], rival: [5, "경쟁 제품 없음"], origin: [5, "경쟁 제품 없음"] },
  { herb: "작약", hanja: "芍藥", purposes: ["미백(톤)"], words: "맑아 보이는 피부톤, 생기", seasons: ["봄", "가을"], color: "#E8B9C0",
    scent: [3, "향 중 · 특유한 냄새"], gb: [5, "경북 58.0% (1위)"], preempt: [5, "선점 약함 · 구달 앰플 1개"],
    hanbang: [5, "한방 브랜드 제품 없음"], rival: [5, "구달 ml당 760원 > 우리 세럼 380원"], origin: [5, "경쟁 제품이 산지를 내세우지 않음"],
    func: "작약은 고시 성분이 아니라 고시 성분(예: 나이아신아마이드)을 따로 배합해 보고" },
  { herb: "오미자", hanja: "五味子", purposes: ["보습"], words: "촉촉함, 수분 공급", seasons: ["여름", "가을"], color: "#D9B8AE",
    scent: [5, "향 약 · 냄새 약간"], gb: [4, "경북 40.7% (1위)"], preempt: [5, "스킨케어로는 약함 · 파넬 워시오프 세럼 1개"],
    hanbang: [5, "한방 브랜드 제품 없음"], rival: [5, "파넬 ml당 1,367원 > 우리 세럼 380원"], origin: [5, "경쟁 제품이 산지를 내세우지 않음"] },
  { herb: "오가피", hanja: "五加皮", purposes: ["민감·장벽", "탄력"], words: "장벽 보습, 탄력 있어 보이는", seasons: ["봄", "겨울"], color: "#8C7A9B",
    scent: [3, "향 중 · 특유한 냄새"], gb: [1, "경북 상위권 아님 (충남 30.8%)"], preempt: [null, "경쟁 제품 조사 대상 밖"],
    hanbang: [null, "확인 필요"], rival: [null, "확인 필요"], origin: [null, "확인 필요"] },
  { herb: "길경", hanja: "桔梗", purposes: ["모공·피지"], words: "피부·모공 노폐물 세정, 피지 관리", seasons: ["여름"], color: "#C9B7D6",
    scent: [5, "향 약 · 특유한 냄새 약간"], gb: [3, "경북 19.6% (2위)"], preempt: [null, "경쟁 제품 조사 대상 밖"],
    hanbang: [null, "확인 필요"], rival: [null, "확인 필요"], origin: [null, "확인 필요"],
    typeGate: ["FAIL", "원료 후보표에서 클렌저용 원료로 분류 · 토너·세럼·크림 기초라인에는 맞지 않음"] },
  /* ── 원료 후보표 50종에서 추가한 36종 (2026-11-24). 경쟁 점수는 미조사라 null, 목적은 '피부 효과 [연구]' 칸 기준 ── */
  { herb: "구기자", hanja: "枸杞子", purposes: ["미백(톤)","탄력","진정"], words: "맑아 보이는 피부톤, 탄력 있어 보이는, 진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#C8463A",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (충남 81.6%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "산수유", hanja: "山茱萸", purposes: ["영양"], words: "영양, 윤기", seasons: ["겨울"], color: "#B8322E",
    scent: [5,"향 약"], gb: [3,"경북 10.6% (2위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "복분자", hanja: "覆盆子", purposes: ["영양"], words: "영양, 윤기", seasons: ["겨울"], color: "#6B2A3A",
    scent: [5,"향 거의 없음"], gb: [1,"경북 상위권 아님 (전북 88.0%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "천궁", hanja: "川芎", purposes: ["탄력"], words: "탄력 있어 보이는", seasons: ["겨울"], color: "#B89A6A",
    scent: [3,"향 중 · 특유한 냄새"], gb: [5,"경북 93.1% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "지황", hanja: "地黃", purposes: ["미백(톤)","탄력"], words: "맑아 보이는 피부톤, 탄력 있어 보이는", seasons: ["봄","여름","가을","겨울"], color: "#5A3A2E",
    scent: [3,"향 중 · 특유한 냄새"], gb: [5,"경북 52.0% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbangGate: ["UNKNOWN","피부 효과 연구가 숙지황(가공품) 기준이라 확인 필요"] },
  { herb: "백지", hanja: "白芷", purposes: ["미백(톤)"], words: "맑아 보이는 피부톤", seasons: ["봄","여름","가을"], color: "#D9CDB0",
    scent: [3,"향 중 · 특유한 냄새"], gb: [5,"경북 50.0% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "백출", hanja: "白朮", purposes: ["미백(톤)"], words: "맑아 보이는 피부톤", seasons: ["봄","여름","가을"], color: "#D9C9A3",
    scent: [3,"향 중 · 특유한 냄새"], gb: [4,"경북 42.9% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "산약", hanja: "山藥", purposes: ["보습","탄력"], words: "촉촉함, 탄력 있어 보이는", seasons: ["봄","가을","겨울"], color: "#E6DCC6",
    scent: [5,"향 거의 없음"], gb: [5,"경북 78.3% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "맥문동", hanja: "麥門冬", purposes: ["보습"], words: "촉촉함", seasons: ["봄","가을","겨울"], color: "#D8CFA0",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (충남 96.8%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "의이인", hanja: "薏苡仁", purposes: ["미백(톤)"], words: "맑아 보이는 피부톤", seasons: ["봄","여름","가을"], color: "#E6DFCF",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (경기 39.1%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbangGate: ["UNKNOWN","피부 효과 연구가 율무 뿌리 기준이라 확인 필요"] },
  { herb: "감국", hanja: "甘菊", purposes: ["진정"], words: "진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#E8C547",
    scent: [1,"향 강"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "금은화", hanja: "金銀花", purposes: ["진정","영양"], words: "진정에 도움, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#EAD9A0",
    scent: [5,"향 약"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbangGate: ["UNKNOWN","진정 근거가 꽃 오일 연구라 확인 필요"] },
  { herb: "상백피", hanja: "桑白皮", purposes: ["미백(톤)","영양"], words: "맑아 보이는 피부톤, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#DCCFB4",
    scent: [5,"향 약"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "상엽", hanja: "桑葉", purposes: ["진정","영양"], words: "진정에 도움, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#7E9B5A",
    scent: [5,"향 거의 없음"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "갈근", hanja: "葛根", purposes: ["미백(톤)","영양"], words: "맑아 보이는 피부톤, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#C9B28E",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (경남·전남 소량)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "치자", hanja: "梔子", purposes: ["진정","민감·장벽"], words: "진정에 도움, 장벽 보습", seasons: ["봄","여름","가을","겨울"], color: "#E8A33A",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (전남 81.0%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "황금", hanja: "黃芩", purposes: ["미백(톤)","진정","모공·피지","영양"], words: "맑아 보이는 피부톤, 진정에 도움, 피지 관리, 보송함, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#E3C34A",
    scent: [5,"향 거의 없음"], gb: [1,"경북 상위권 아님 (전남 100%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "황백", hanja: "黃柏", purposes: ["미백(톤)"], words: "맑아 보이는 피부톤", seasons: ["봄","여름","가을"], color: "#E0C23C",
    scent: [5,"향 약"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "녹두", hanja: "綠豆", purposes: ["진정"], words: "진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#6E9E5A",
    scent: [5,"향 거의 없음"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "대추", hanja: "大棗", purposes: ["보습","탄력","진정"], words: "촉촉함, 탄력 있어 보이는, 진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#9E2B25",
    scent: [5,"향 약"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "진피", hanja: "陳皮", purposes: ["진정"], words: "진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#E08A2E",
    scent: [3,"향 중 · 특유한 냄새"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "두충", hanja: "杜仲", purposes: ["민감·장벽"], words: "장벽 보습", seasons: ["봄","가을","겨울"], color: "#6E5A44",
    scent: [3,"향 중 · 특유한 냄새"], gb: [5,"경북 59.8% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbangGate: ["UNKNOWN","피부 효과 연구가 혼합 추출물뿐이라 확인 필요 (배합목적: 피부보호제)"] },
  { herb: "자근", hanja: "紫根", purposes: ["탄력","영양"], words: "탄력 있어 보이는, 영양, 윤기", seasons: ["겨울"], color: "#6B2E5A",
    scent: [5,"향 약"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "목단피", hanja: "牡丹皮", purposes: ["진정"], words: "진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#D9A6B8",
    scent: [3,"향 중 · 특유한 냄새"], gb: [3,"경북 1톤 (생산량 매우 적음)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbangGate: ["UNKNOWN","피부 효과 연구가 성분(페오놀) 기준이라 확인 필요"] },
  { herb: "하수오", hanja: "何首烏", purposes: ["영양","모공·피지"], words: "영양, 윤기, 피지 관리, 보송함", seasons: ["여름","겨울"], color: "#8A4B3A",
    scent: [5,"향 거의 없음"], gb: [1,"경북 상위권 아님 (경남 21.1%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "백수오", hanja: "白首烏", purposes: ["영양"], words: "영양, 윤기", seasons: ["겨울"], color: "#EAE2D4",
    scent: [5,"향 거의 없음"], gb: [5,"경북 56.5% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "사삼", hanja: "沙參", purposes: ["미백(톤)","영양"], words: "맑아 보이는 피부톤, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#E3D9C3",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (전북 71.5%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbangGate: ["UNKNOWN","피부 효과 연구가 잔대 순(새싹) 기준이라 확인 필요"] },
  { herb: "삼백초", hanja: "三白草", purposes: ["영양"], words: "영양, 윤기", seasons: ["겨울"], color: "#A9C29A",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (경남 47.6%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "구절초", hanja: "九折草", purposes: ["진정","미백(톤)","영양"], words: "진정에 도움, 맑아 보이는 피부톤, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#EBD3E2",
    scent: [1,"향 강"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "하엽", hanja: "荷葉", purposes: ["미백(톤)","탄력","영양"], words: "맑아 보이는 피부톤, 탄력 있어 보이는, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#6F9A6B",
    scent: [3,"향 중 · 특유한 냄새"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "우슬", hanja: "牛膝", purposes: ["진정","탄력","영양"], words: "진정에 도움, 탄력 있어 보이는, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#B89878",
    scent: [5,"향 약"], gb: [4,"경북 47.7% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "천마", hanja: "天麻", purposes: ["진정","영양"], words: "진정에 도움, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#D8C7A4",
    scent: [5,"향 약"], gb: [1,"경북 상위권 아님 (전북 88.7%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbangGate: ["UNKNOWN","피부 효과 연구가 발효 추출물 기준이라 확인 필요"] },
  { herb: "고삼", hanja: "苦參", purposes: ["모공·피지","진정","영양"], words: "피지 관리, 보송함, 진정에 도움, 영양, 윤기", seasons: ["봄","여름","가을","겨울"], color: "#C9B48A",
    scent: [3,"향 중 · 특유한 냄새"], gb: [null,"생산 통계 없음"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "단삼", hanja: "丹參", purposes: ["미백(톤)","탄력","진정"], words: "맑아 보이는 피부톤, 탄력 있어 보이는, 진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#A6392E",
    scent: [1,"향 강"], gb: [1,"경북 상위권 아님 (충북 86.8%)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "현삼", hanja: "玄參", purposes: ["진정"], words: "진정에 도움", seasons: ["봄","여름","가을","겨울"], color: "#3E2F2A",
    scent: [1,"향 강"], gb: [5,"경북 100% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] },
  { herb: "자소엽", hanja: "紫蘇葉", purposes: ["영양"], words: "영양, 윤기", seasons: ["겨울"], color: "#7A3E6B",
    scent: [3,"향 중 · 특유한 냄새"], gb: [5,"경북 66.7% (1위)"], preempt: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], hanbang: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], rival: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"], origin: [null,"경쟁 제품 미조사 (원료 후보표 50종 추가분)"] }
];

/* 원료별 패키지 디자인 제안 */
export const DESIGN = {
  "쑥": {
    "main": "#F0F9E9",
    "cap": "#83B966",
    "liquid": "#F3F6F0",
    "motif": "leaf",
    "from": "맑은 라이트 그린"
  },
  "어성초": {
    "main": "#E4FAF0",
    "cap": "#268C65",
    "liquid": "#F0F8F6",
    "motif": "leaf",
    "from": "라이트 민트 · 선명한 그린"
  },
  "인삼": {
    "main": "#FFF7E5",
    "cap": "#D4AE61",
    "liquid": "#FAF8F1",
    "motif": "root",
    "from": "밝은 아이보리 · 허니 포인트"
  },
  "홍삼": {
    "main": "#FFF0F1",
    "cap": "#E47888",
    "liquid": "#F8F0F1",
    "motif": "root",
    "from": "라이트 핑크 · 코랄 포인트"
  },
  "당귀": {
    "main": "#FFF6E2",
    "cap": "#C7AC78",
    "liquid": "#F8F5EF",
    "motif": "root",
    "from": "밝은 크림 아이보리 · 샌드 베이지"
  },
  "감초": {
    "main": "#FFF8E8",
    "cap": "#C8AD73",
    "liquid": "#FFF9ED",
    "motif": "root",
    "from": "크림 아이보리 · 옅은 허니 베이지"
  },
  "병풀": {
    "main": "#ECFBF0",
    "cap": "#57B983",
    "liquid": "#F1F7F3",
    "motif": "leaf",
    "from": "맑은 화이트 · 시카 그린"
  },
  "황기": {
    "main": "#FFFBE6",
    "cap": "#DEC05B",
    "liquid": "#FAF9EF",
    "motif": "root",
    "from": "밝은 화이트 · 버터 옐로"
  },
  "작약": {
    "main": "#FFFBFD",
    "cap": "#F0AECF",
    "liquid": "#FBF5F8",
    "motif": "flower",
    "from": "클린 화이트 · 맑은 페일 핑크"
  },
  "오미자": {
    "main": "#FFE9F3",
    "cap": "#EB80AF",
    "liquid": "#F8EDF2",
    "motif": "berry",
    "from": "라이트 핑크 · 프레시 로즈"
  },
  "오가피": {
    "main": "#F4EEFF",
    "cap": "#B297DC",
    "liquid": "#F6F3F9",
    "motif": "root",
    "from": "맑은 라벤더"
  },
  "길경": {
    "main": "#E9F5FF",
    "cap": "#6BADE0",
    "liquid": "#F2F5FA",
    "motif": "flower",
    "from": "클리어 스카이 블루"
  },
  /* 원료 후보표 50종 추가분: 원료 색에서 만든 기본 팔레트 */
  "구기자": { "main": "#F7E3E1", "cap": "#C8463A", "liquid": "#FBF2F1", "motif": "berry", "from": "구기자 레드" },
  "산수유": { "main": "#F4E0E0", "cap": "#B8322E", "liquid": "#FAF1F0", "motif": "berry", "from": "산수유 레드" },
  "복분자": { "main": "#E9DFE1", "cap": "#6B2A3A", "liquid": "#F5F0F1", "motif": "berry", "from": "딥 베리" },
  "천궁": { "main": "#F4F0E9", "cap": "#B89A6A", "liquid": "#FAF8F5", "motif": "root", "from": "웜 샌드" },
  "지황": { "main": "#E6E1E0", "cap": "#5A3A2E", "liquid": "#F3F1F0", "motif": "root", "from": "딥 브라운" },
  "백지": { "main": "#F9F8F3", "cap": "#D9CDB0", "liquid": "#FCFCF9", "motif": "root", "from": "아이보리 베이지" },
  "백출": { "main": "#F9F7F1", "cap": "#D9C9A3", "liquid": "#FCFBF9", "motif": "root", "from": "라이트 샌드" },
  "산약": { "main": "#FBFAF6", "cap": "#E6DCC6", "liquid": "#FDFDFB", "motif": "root", "from": "크림 아이보리" },
  "맥문동": { "main": "#F9F8F1", "cap": "#D8CFA0", "liquid": "#FCFCF8", "motif": "root", "from": "페일 옐로" },
  "의이인": { "main": "#FBFAF8", "cap": "#E6DFCF", "liquid": "#FDFDFC", "motif": "berry", "from": "오트 베이지" },
  "감국": { "main": "#FCF6E3", "cap": "#E8C547", "liquid": "#FDFBF2", "motif": "flower", "from": "국화 옐로" },
  "금은화": { "main": "#FCF9F1", "cap": "#EAD9A0", "liquid": "#FEFCF8", "motif": "flower", "from": "허니 크림" },
  "상백피": { "main": "#FAF8F4", "cap": "#DCCFB4", "liquid": "#FDFCFA", "motif": "root", "from": "뽕나무 베이지" },
  "상엽": { "main": "#ECF0E6", "cap": "#7E9B5A", "liquid": "#F6F8F3", "motif": "leaf", "from": "뽕잎 그린" },
  "갈근": { "main": "#F7F3EE", "cap": "#C9B28E", "liquid": "#FBFAF7", "motif": "root", "from": "칡 베이지" },
  "치자": { "main": "#FCF1E1", "cap": "#E8A33A", "liquid": "#FDF9F1", "motif": "berry", "from": "치자 오렌지" },
  "황금": { "main": "#FBF6E4", "cap": "#E3C34A", "liquid": "#FDFBF2", "motif": "root", "from": "골든 옐로" },
  "황백": { "main": "#FAF6E2", "cap": "#E0C23C", "liquid": "#FDFBF1", "motif": "root", "from": "황벽 옐로" },
  "녹두": { "main": "#E9F0E6", "cap": "#6E9E5A", "liquid": "#F5F8F3", "motif": "berry", "from": "녹두 그린" },
  "대추": { "main": "#F0DFDE", "cap": "#9E2B25", "liquid": "#F8F0F0", "motif": "berry", "from": "대추 레드" },
  "진피": { "main": "#FAEDE0", "cap": "#E08A2E", "liquid": "#FDF7F0", "motif": "berry", "from": "귤피 오렌지" },
  "두충": { "main": "#E9E6E3", "cap": "#6E5A44", "liquid": "#F5F3F2", "motif": "root", "from": "우드 브라운" },
  "자근": { "main": "#E9E0E6", "cap": "#6B2E5A", "liquid": "#F5F0F3", "motif": "root", "from": "자근 퍼플" },
  "목단피": { "main": "#F9F2F4", "cap": "#D9A6B8", "liquid": "#FCF9FA", "motif": "root", "from": "모란 핑크" },
  "하수오": { "main": "#EDE4E1", "cap": "#8A4B3A", "liquid": "#F7F2F1", "motif": "root", "from": "적갈색" },
  "백수오": { "main": "#FCFBF9", "cap": "#EAE2D4", "liquid": "#FEFDFC", "motif": "root", "from": "밀크 아이보리" },
  "사삼": { "main": "#FBF9F6", "cap": "#E3D9C3", "liquid": "#FDFCFB", "motif": "root", "from": "잔대 베이지" },
  "삼백초": { "main": "#F2F6F0", "cap": "#A9C29A", "liquid": "#F9FBF8", "motif": "leaf", "from": "세이지 그린" },
  "구절초": { "main": "#FCF8FB", "cap": "#EBD3E2", "liquid": "#FEFCFD", "motif": "flower", "from": "구절초 핑크" },
  "하엽": { "main": "#E9F0E9", "cap": "#6F9A6B", "liquid": "#F5F8F5", "motif": "leaf", "from": "연잎 그린" },
  "우슬": { "main": "#F4F0EB", "cap": "#B89878", "liquid": "#FAF8F6", "motif": "root", "from": "토프 브라운" },
  "천마": { "main": "#F9F7F1", "cap": "#D8C7A4", "liquid": "#FCFBF9", "motif": "root", "from": "천마 베이지" },
  "고삼": { "main": "#F7F4ED", "cap": "#C9B48A", "liquid": "#FBFAF7", "motif": "root", "from": "카키 베이지" },
  "단삼": { "main": "#F2E1E0", "cap": "#A6392E", "liquid": "#F9F1F0", "motif": "root", "from": "단삼 레드" },
  "현삼": { "main": "#E2E0DF", "cap": "#3E2F2A", "liquid": "#F1F0F0", "motif": "root", "from": "현삼 다크 브라운" },
  "자소엽": { "main": "#EBE2E9", "cap": "#7A3E6B", "liquid": "#F6F1F5", "motif": "leaf", "from": "차조기 퍼플" }
};

/* 원료별 검색 흐름 (네이버 데이터랩). 수집본이 아직 없어요. */
export const HERB_TREND = null;

/* 뷰티 트렌드 수집본 */
export const BEAUTY_TRENDS = {
  "version": 1,
  "updatedAt": "2026-11-13T01:44:27Z",
  "intervalMinutes": 60,
  "lookbackDays": 90,
  "sourceChecks": [
    {
      "id": "google-trends",
      "source": "Google Trends",
      "url": "https://trends.google.com/trends/explore",
      "checkedAt": "2026-11-13T02:41:55Z",
      "status": "unavailable",
      "http": 429,
      "note": "자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"
    },
    {
      "id": "spate",
      "source": "Spate",
      "url": "https://www.spate.nyc/resources/reports",
      "checkedAt": "2026-11-13T02:41:56Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "cosme",
      "source": "@cosme 랭킹",
      "url": "https://s.cosme.net/ranking",
      "checkedAt": "2026-11-13T02:41:56Z",
      "status": "unavailable",
      "http": 403,
      "note": "자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"
    },
    {
      "id": "naver-datalab",
      "source": "네이버 데이터랩 (검색어 트렌드·쇼핑인사이트)",
      "url": "https://datalab.naver.com/",
      "checkedAt": "2026-11-13T02:41:56Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "nedrug",
      "source": "의약품안전나라 (기능성화장품 보고)",
      "url": "https://nedrug.mfds.go.kr/",
      "checkedAt": "2026-11-13T02:41:56Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "hwahae",
      "source": "화해 랭킹",
      "url": "https://www.hwahae.co.kr/rankings",
      "checkedAt": "2026-11-13T02:41:57Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "oliveyoung-ranking",
      "source": "올리브영 판매 랭킹",
      "url": "https://www.oliveyoung.co.kr/store/main/getBestList.do",
      "checkedAt": "2026-11-13T02:41:57Z",
      "status": "unavailable",
      "http": 403,
      "note": "자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"
    },
    {
      "id": "kosis-online",
      "source": "통계청 온라인쇼핑동향 (KOSIS)",
      "url": "https://kosis.kr/",
      "checkedAt": "2026-11-13T02:41:57Z",
      "status": "checked",
      "http": 302,
      "note": "허용된 주소로 이동 (kosis.kr)"
    },
    {
      "id": "customs-trade",
      "source": "관세청 수출입 무역통계",
      "url": "https://tradedata.go.kr/",
      "checkedAt": "2026-11-13T02:41:57Z",
      "status": "checked",
      "http": 302,
      "note": "허용된 주소로 이동 (tradedata.go.kr)"
    },
    {
      "id": "oliveyoung",
      "source": "올리브영",
      "url": "https://corp.oliveyoung.com/ko/newsroom/press",
      "checkedAt": "2026-11-13T02:41:57Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "jangup",
      "source": "장업신문",
      "url": "https://www.jangup.com/",
      "checkedAt": "2026-11-13T02:41:57Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "cosmetics-business",
      "source": "Cosmetics Business",
      "url": "https://www.cosmeticsbusiness.com/cosmetics-business-reveals-the-top-5-skin-care-2",
      "checkedAt": "2026-11-13T02:41:57Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "cosmorning",
      "source": "코스모닝",
      "url": "https://www.cosmorning.com/",
      "checkedAt": "2026-11-13T02:41:58Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "thebk",
      "source": "뷰티경제",
      "url": "https://www.thebk.co.kr/",
      "checkedAt": "2026-11-13T02:41:59Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "mintel",
      "source": "Mintel · GNPD",
      "url": "https://www.mintel.com/insights/beauty-and-personal-care/",
      "checkedAt": "2026-11-13T02:42:00Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "niq",
      "source": "NielsenIQ",
      "url": "https://nielseniq.com/global/en/insights/report/2026/niq-state-of-global-beauty-2026/",
      "checkedAt": "2026-11-13T02:42:00Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "mckinsey",
      "source": "McKinsey — State of Beauty",
      "url": "https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/state-of-beauty",
      "checkedAt": "2026-11-13T02:42:01Z",
      "status": "unavailable",
      "http": 403,
      "note": "자동 접근 차단 → 내용 판단에서 제외, 우회하지 않음"
    },
    {
      "id": "cosmotrends",
      "source": "Cosmoprof × BEAUTYSTREAMS — CosmoTrends",
      "url": "https://lp.cosmoprof.com/hubfs/BEAUTYSTREAMS_CosmoProfWorldwideBologna_CosmoTrends_2026_compressed.pdf",
      "checkedAt": "2026-11-13T02:42:01Z",
      "status": "checked",
      "http": 200,
      "note": "PDF 보고서 열림"
    },
    {
      "id": "pinterest",
      "source": "Pinterest Predicts",
      "url": "https://business.pinterest.com/en-gb/pinterest-predicts/",
      "checkedAt": "2026-11-13T02:42:01Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "kcii",
      "source": "대한화장품산업연구원",
      "url": "https://www.kcii.re.kr/",
      "checkedAt": "2026-11-13T02:42:03Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "kotra",
      "source": "KOTRA 해외시장뉴스",
      "url": "https://dream.kotra.or.kr/",
      "checkedAt": "2026-11-13T02:42:03Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    },
    {
      "id": "opensurvey",
      "source": "오픈서베이 뷰티 트렌드 리포트",
      "url": "https://blog.opensurvey.co.kr/trendreport/beauty-2026/",
      "checkedAt": "2026-11-13T02:42:04Z",
      "status": "checked",
      "http": 200,
      "note": "공개 페이지 열림"
    }
  ],
  "items": [
    {
      "id": "oy-editorial-311",
      "source": "올리브영",
      "kind": "공식 브랜드 콘텐츠",
      "title": "DEEP DIVE NEWS 앵커로 변신한 코르티스",
      "url": "https://corp.oliveyoung.com/ko/newsroom/editorial/311",
      "publishedAt": "2026-10-26",
      "checkedAt": "2026-11-13T01:44:27Z",
      "eventPeriod": "2026-08-14~2026-08-25 팝업 사례",
      "summary": "수분·진정 제품을 피부 고민별로 탐색하는 체험 사례와 산뜻한 사용감·속보습을 강조한 세럼을 소개했다. 현재 판매 증가나 시장 전체의 선호를 입증하는 자료는 아니다.",
      "tags": [
        "수분",
        "진정",
        "산뜻한 사용감",
        "속보습"
      ]
    },
    {
      "id": "jangup-100295",
      "source": "장업신문",
      "kind": "업계 기사",
      "title": "‘건조주의보 발령’… 가을철 환절기, 스킨케어 핵심 ‘보습’",
      "url": "https://www.jangup.com/news/articleView.html?idxno=100295",
      "publishedAt": "2026-10-28",
      "checkedAt": "2026-11-13T01:44:27Z",
      "summary": "가을 환절기 보습 루틴과 보습 지속감을 강조하는 제품 사례를 다뤘다. 소비자 전체의 구매 선호를 측정한 조사로 해석하지 않는다.",
      "tags": [
        "환절기",
        "보습",
        "지속감"
      ]
    },
    {
      "id": "jangup-100226",
      "source": "장업신문",
      "kind": "업계 기사",
      "title": "가을 야외활동 증가 다양한 기능성 ‘선케어’ 주목",
      "url": "https://www.jangup.com/news/articleView.html?idxno=100226",
      "publishedAt": "2026-10-21",
      "checkedAt": "2026-11-13T01:44:27Z",
      "summary": "야외 활동·데일리 용도에 따른 선케어 세분화와 유분 관리·보송한 사용감 등의 제품 사례를 소개했다. 선케어 자료를 기초 제품의 자외선 차단 효능 근거로 사용하지 않는다.",
      "tags": [
        "자외선",
        "유분",
        "보송한 사용감"
      ]
    }
  ],
  "insights": {
    "봄": {
      "line": "봄 기초라인은 ‘순한 진정과 장벽 보습’을 중심으로 잡아보세요. 가벼운 보습 제형과 편안한 사용감을 먼저 비교하면 좋아요.",
      "tip": "토너·세럼·크림의 역할을 나누고, 환절기에도 부담 없이 쓰기 좋은 사용감을 차별점으로 검토해 보세요.",
      "evidenceIds": [
        "oy-editorial-311",
        "jangup-100295"
      ]
    },
    "여름": {
      "line": "여름 기초라인은 ‘수분은 채우고, 마무리는 산뜻하게’를 방향으로 잡아보세요. 가벼운 토너·세럼과 젤 크림 조합부터 검토하면 좋아요.",
      "tip": "샘플을 비교할 때 흡수감·끈적임·덧바른 뒤 밀림을 우선 확인하고, 산뜻한 수분·진정을 핵심 메시지로 잡아보세요.",
      "evidenceIds": [
        "oy-editorial-311",
        "jangup-100226"
      ]
    },
    "가을": {
      "line": "가을 기초라인은 ‘겹쳐 바르는 수분 보습과 편안한 마무리’를 제안해 보세요. 토너·세럼·크림이 단계별로 다른 역할을 갖도록 구성하면 좋아요.",
      "tip": "토너·세럼의 레이어링 사용감과 크림의 마무리감을 함께 비교해, 건조함이 시작되는 계절에 맞는 루틴을 설계해 보세요.",
      "evidenceIds": [
        "jangup-100295",
        "jangup-100226"
      ]
    },
    "겨울": {
      "line": "겨울 기초라인은 ‘오래가는 보습과 편안한 사용감’을 중심으로 잡아보세요. 크림을 중심 제품으로 두고 토너·세럼이 보완하는 구성을 검토하면 좋아요.",
      "tip": "보습 지속감과 끈적임의 균형을 먼저 비교하고, 낮에도 쓰기 좋은 조합과 밤에 충분히 바르는 조합을 나눠 제안해 보세요.",
      "evidenceIds": [
        "jangup-100295",
        "oy-editorial-311"
      ]
    }
  }
};

/* 트렌드 수집 에이전트가 확인하는 출처 */
export const TREND_SOURCES = [{"id":"google-trends","name":"Google Trends","url":"https://trends.google.com/trends/explore","type":"검색 관심","tier":"signal"},{"id":"spate","name":"Spate","url":"https://www.spate.nyc/resources/reports","type":"검색·소셜 분석","tier":"signal"},{"id":"cosme","name":"@cosme 랭킹","url":"https://s.cosme.net/ranking","type":"일본 제품 리뷰·랭킹","tier":"signal"},{"id":"naver-datalab","name":"네이버 데이터랩 (검색어 트렌드·쇼핑인사이트)","url":"https://datalab.naver.com/","type":"국내 검색·쇼핑 관심","tier":"signal"},{"id":"nedrug","name":"의약품안전나라 (기능성화장품 보고)","url":"https://nedrug.mfds.go.kr/","type":"기능성 제품 보고 현황","tier":"signal"},{"id":"hwahae","name":"화해 랭킹","url":"https://www.hwahae.co.kr/rankings","type":"리뷰 기반 랭킹","tier":"signal"},{"id":"oliveyoung-ranking","name":"올리브영 판매 랭킹","url":"https://www.oliveyoung.co.kr/store/main/getBestList.do","type":"판매 랭킹","tier":"signal"},{"id":"kosis-online","name":"통계청 온라인쇼핑동향 (KOSIS)","url":"https://kosis.kr/","type":"화장품 온라인 거래액 (매월)","tier":"signal"},{"id":"customs-trade","name":"관세청 수출입 무역통계","url":"https://tradedata.go.kr/","type":"화장품 수출 (매월)","tier":"signal"},{"id":"oliveyoung","name":"올리브영","url":"https://corp.oliveyoung.com/ko/newsroom/press","type":"공식 콘텐츠·판매랭킹","tier":"case"},{"id":"jangup","name":"장업신문","url":"https://www.jangup.com/","type":"업계 기사","tier":"case"},{"id":"cosmetics-business","name":"Cosmetics Business","url":"https://www.cosmeticsbusiness.com/cosmetics-business-reveals-the-top-5-skin-care-2","type":"업계 기사·제품 사례","tier":"case"},{"id":"cosmorning","name":"코스모닝","url":"https://www.cosmorning.com/","type":"국내 업계 기사","tier":"case"},{"id":"thebk","name":"뷰티경제","url":"https://www.thebk.co.kr/","type":"국내 업계 기사","tier":"case"},{"id":"mintel","name":"Mintel · GNPD","url":"https://www.mintel.com/insights/beauty-and-personal-care/","type":"시장 전망·신제품 데이터","tier":"background"},{"id":"niq","name":"NielsenIQ","url":"https://nielseniq.com/global/en/insights/report/2026/niq-state-of-global-beauty-2026/","type":"구매·시장 데이터","tier":"background"},{"id":"mckinsey","name":"McKinsey — State of Beauty","url":"https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/state-of-beauty","type":"시장·채널 전망","tier":"background"},{"id":"cosmotrends","name":"Cosmoprof × BEAUTYSTREAMS — CosmoTrends","url":"https://lp.cosmoprof.com/hubfs/BEAUTYSTREAMS_CosmoProfWorldwideBologna_CosmoTrends_2026_compressed.pdf","type":"전시·제품 혁신","tier":"background"},{"id":"pinterest","name":"Pinterest Predicts","url":"https://business.pinterest.com/en-gb/pinterest-predicts/","type":"시각 트렌드·검색 전망","tier":"background"},{"id":"kcii","name":"대한화장품산업연구원","url":"https://www.kcii.re.kr/","type":"국내 산업 보고서","tier":"background"},{"id":"kotra","name":"KOTRA 해외시장뉴스","url":"https://dream.kotra.or.kr/","type":"국가별 시장 동향","tier":"background"},{"id":"opensurvey","name":"오픈서베이 뷰티 트렌드 리포트","url":"https://blog.opensurvey.co.kr/trendreport/beauty-2026/","type":"국내 소비자 조사","tier":"background"}];
export const TREND_TIERS = {"signal":{"name":"실시간 신호","cadence":"매주","rule":"숫자로 나오는 최근 흐름. 트렌드 한마디의 주 근거"},"case":{"name":"업계 사례","cadence":"매일~매주","rule":"실제로 나온 제품·움직임. '이런 사례가 있다'로만 사용"},"background":{"name":"배경 자료","cadence":"연 1~2회","rule":"큰 방향 설명용. '지금 뜬다'·'판매 증가'로 바꿔 말하지 않음"}};
