/* 트렌드 자료가 어느 계절에 맞는 뷰티 트렌드인지 판단해요 (화면 app.js 와 자동 수집 server/trends/collect.js 가 같이 써요).
   "계절에 맞는다" = 기사에 계절이 적혀 있다는 뜻이 아니라, 기사 속 피부 고민·제형이 그 계절 피부 고민(SEASONS 의 기후 이슈)에 맞는다는 뜻이에요.
   - 자동 수집 자료: seasons 칸 그대로 (AI가 계절별 피부 고민을 기준으로 정해요). 빈 목록 = 특정 계절에 두드러지지 않는 트렌드.
   - 예전 자료(seasons 칸 없음): 계절 이름이 적혀 있거나, 그 계절에만 두드러진 고민 키워드(예: 겨울 = 영양·탄력·각질)가 맞으면 그 계절로 봐요.
   계절별 기획 포인트는 그 계절에 맞는 자료만 근거로 써요. */
export const SEASON_NAMES = ["봄", "여름", "가을", "겨울"];

/* 계절마다 그 계절에 두드러진 피부 고민 키워드 (SEASONS 기후 이슈의 고민·목적에서 뽑은 것 중, 여러 계절에 다 있는 진정·보습 같은 말은 빼요) */
export const SEASON_KEYWORDS = {
  "봄": ["당김", "속건조", "환절기", "톤업"],
  "여름": ["쿨링", "열감", "땀", "피지", "모공", "번들", "산뜻", "보송", "자외선", "선케어"],
  "가을": ["환절기", "건조 시작", "레이어링"],
  "겨울": ["영양", "탄력", "각질", "극건조", "푸석", "고보습", "리치", "장벽"]
};

/** 수집 AI에게 줄 계절별 피부 고민 안내 (SEASONS 자료에서 만들어요) */
export function seasonGuide(seasons) {
  return SEASON_NAMES.filter(s => seasons?.[s]).map(s => `- ${s}: ${seasons[s].issues.map(([title, , concern, purposes]) => `${title}(${concern} → ${(purposes || []).join("·")})`).join(" / ")}`);
}

export function seasonsOf(item, extraText = "") {
  if (!item) return [];
  if (Array.isArray(item.seasons)) return item.seasons.filter(s => SEASON_NAMES.includes(s));
  const text = `${item.title || ""} ${item.summary || ""} ${item.easy || ""} ${(item.tags || []).join(" ")} ${extraText}`;
  const named = SEASON_NAMES.filter(s => (s === "봄" ? /(^|[^돌])봄/.test(text) : text.includes(s))); // '돌봄'은 봄이 아니에요
  // 계절이 적힌 자료(예: '가을 환절기')는 그 계절 자료로만 봐요
  if (named.length) return named;
  return SEASON_NAMES.filter(s => SEASON_KEYWORDS[s].some(k => text.includes(k)));
}

export const matchesSeason = (item, season, extraText = "") => seasonsOf(item, extraText).includes(season);
