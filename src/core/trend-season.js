/* 트렌드 자료가 어느 계절 자료인지 판단해요 (화면 app.js 와 자동 수집 server/trends/collect.js 가 같이 써요).
   - 자동 수집 자료: seasons 칸 그대로 (AI가 기사에 계절·계절 상황이 적힌 경우만 넣어요). 빈 목록 = 계절 무관.
   - 예전 자료(seasons 칸 없음): 제목·요약·쉬운 말에 계절 이름이 적혀 있을 때만 그 계절로 봐요.
   계절별 기획 포인트는 그 계절 자료만 근거로 써요. 다른 계절 기사로 겨울 기획 포인트를 만들지 않게요. */
export const SEASON_NAMES = ["봄", "여름", "가을", "겨울"];

export function seasonsOf(item, extraText = "") {
  if (!item) return [];
  if (Array.isArray(item.seasons)) return item.seasons.filter(s => SEASON_NAMES.includes(s));
  const text = `${item.title || ""} ${item.summary || ""} ${item.easy || ""} ${extraText}`;
  return SEASON_NAMES.filter(s => (s === "봄" ? /(^|[^돌])봄/.test(text) : text.includes(s))); // '돌봄'은 봄이 아니에요
}

export const matchesSeason = (item, season, extraText = "") => seasonsOf(item, extraText).includes(season);
