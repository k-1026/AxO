/* 에이전트 프롬프트·스키마 공통 조각. AI는 글만 쓰고 숫자는 코드 값을 써요. */
import { extrasOf, qty } from "../../src/config/rules.js";

export const STRING = { type: "STRING" };
export const STRINGS = { type: "ARRAY", items: STRING };
export const BOOLEAN = { type: "BOOLEAN" };
export const isStringArray = v => Array.isArray(v) && v.every(x => typeof x === "string");

const lineOf = c => (c && c.l) || c;

/* 후보 한 줄을 프롬프트용 글로 바꿔요 */
export function describeLine(cand, season, data) {
  const l = lineOf(cand);
  const memo = k => (l[k] && l[k][1]) || "미확인";
  const pending = extrasOf(l).map(x => x.name);
  const items = (l.lineup || []).map(([type, name, ml, price]) => `${name} ${qty(type, ml)} ${price.toLocaleString("ko-KR")}원`).join(", ");
  return [
    `계절: ${season}`,
    `원료: ${l.herb}(${l.hanja || "한자 미확인"})`,
    `피부 목적: ${l.purpose}`,
    `쓸 수 있는 말: ${l.words || "미확인"}`,
    `산지 메모: ${memo("gb")}`,
    `경쟁 메모: ${memo("rival")} / ${memo("preempt")}`,
    `한방 브랜드 메모: ${memo("hanbang")}`,
    `제품 목록: ${items}${pending.length ? ` (+ ${pending.join(", ")}: 가격 준비 중, 용기 샘플 없음)` : ""}`,
    `기능성 심사 필요: ${l.functional ? "예" : "아니요"}`,
    ...describeTrends(season, data)
  ].join("\n");
}

/* 계절 피부 이슈(통계)와 수집한 뷰티 트렌드를 프롬프트용 줄로 바꿔요. 자료가 없으면 빈 목록이에요.
   기획안이 타깃·방향을 정하거나 바꿀 때 근거로 써요. */
export function describeTrends(season, data) {
  const out = [];
  const issues = data?.SEASONS?.[season]?.issues || [];
  if (issues.length) out.push(`${season} 피부 이슈: ${issues.map(([title, stat, concern]) => `${title}(${stat}, 고민: ${concern})`).join(" / ")}`);
  const bt = data?.BEAUTY_TRENDS;
  const ins = bt?.insights?.[season];
  if (ins) out.push(`${season} 뷰티 트렌드 방향: ${ins.line} ${ins.tip || ""}`.trim());
  const items = (bt?.items || []).slice(0, 5);
  if (items.length) out.push(`최근 뷰티 트렌드 자료: ${items.map(i => `${i.source} 「${i.title}」(${(i.tags || []).join("·")})`).join(" / ")}`);
  return out;
}

export const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: { approved: BOOLEAN, issues: STRINGS },
  required: ["approved", "issues"]
};

/* AI 검토 프롬프트: 코드 규칙이 못 잡는 어색한 표현·근거 없는 단정을 봐요 */
export function buildReviewPrompt(content, cand, season, data) {
  return [
    "당신은 한방 뷰티 화장품 출시 기획안을 검토하는 심사자예요.",
    "아래 후보 정보와 기획안을 비교해서, 다음을 확인해 주세요.",
    "- 의약품처럼 낫는다는 효능 표현이 있는지",
    "- 후보 정보에 없는 사실·숫자·원료를 지어냈는지",
    "- 말투가 어색하거나 앞뒤가 맞지 않는지",
    "문제가 없으면 approved를 true로, 있으면 false로 하고 issues에 고칠 점을 한 줄씩(최대 5개) 적어 주세요.",
    "",
    "[후보 정보]",
    describeLine(cand, season, data),
    "",
    "[기획안]",
    JSON.stringify(content, null, 1)
  ].join("\n");
}

/* AI 검토 결과 정리: issues는 글만 최대 5개, approved는 false일 때만 false */
export function cleanReview(raw) {
  const issues = isStringArray(raw?.issues) ? raw.issues.map(s => s.trim()).filter(Boolean).slice(0, 5) : [];
  return { approved: raw?.approved !== false, issues };
}
