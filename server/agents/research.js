/* 후보 생성 에이전트: 후보를 고르고, 근거 메모를 AI가 정리해요. 숫자는 코드 값만 써요. */
import { findLine } from "../../src/core/candidates.js";
import { STRINGS, isStringArray, describeLine } from "./prompt.js";
import { BANNED_PHRASES, selectLine } from "../../src/config/rules.js";

export class InvalidCandidateError extends Error {
  constructor(msg) { super(msg); this.name = "InvalidCandidateError"; }
}

/* 계절·원료·피부 목적에 맞는 후보를 찾아요. 없으면 throw */
export function pickCandidate(data, { season, herb, purpose }, now) {
  const cand = findLine(data, season, herb, purpose, now);
  if (!cand) throw new InvalidCandidateError(`후보를 찾지 못했어요: ${season} · ${herb} · ${purpose}`);
  return cand;
}

/* 사용자가 고른 제품으로 후보 라인을 바꿔요. products 가 없으면(예전 기획안·선택 없음) 추천 구성이에요. */
export class InvalidSelectionError extends Error {
  constructor(msg) { super(msg); this.name = "InvalidSelectionError"; }
}
export function applySelection(cand, products) {
  const { line, error } = selectLine(cand.l, products ?? undefined);
  if (error) throw new InvalidSelectionError(error);
  return { ...cand, l: line };
}

/* 저장된 기획안의 제품 목록(이름·용량·정가·상태)을 그대로 후보 라인에 다시 씌워요.
   가격 기준표가 나중에 바뀌어도(예: 가격 준비 중이던 클렌저에 정가가 생김) 예전 기획안의 숫자는 그대로 두고, 수정할 때 검증이 어긋나지 않게 해요.
   저장된 제품 목록이 없거나 형식이 맞지 않으면 지금 기준으로 다시 짠 후보를 그대로 돌려줘요. */
export function keepSavedProducts(cand, products) {
  if (!Array.isArray(products) || !products.length) return cand;
  const ok = x => x && typeof x.name === "string" && typeof x.type === "string";
  if (!products.every(ok)) return cand;
  const ready = products.filter(x => Number.isFinite(x.ml) && Number.isFinite(x.price));
  if (!ready.length) return cand;
  const lineup = ready.map(x => [x.type, x.name, x.ml, x.price]);
  const extras = products.filter(x => !ready.includes(x)).map(x => ({ type: x.type, name: x.name }));
  return { ...cand, l: { ...cand.l, lineup, extra: undefined, extras } };
}

export const RESEARCH_SCHEMA = {
  type: "OBJECT",
  properties: { notes: STRINGS },
  required: ["notes"]
};

export function buildResearchPrompt(cand, season, data) {
  return [
    "당신은 한방 뷰티 화장품 출시 기획을 돕는 자료 정리 담당이에요.",
    "아래 후보 정보만 근거로, 기획안을 쓸 때 참고할 근거 메모를 3~5개 적어 주세요.",
    "- 메모는 한 줄씩, 존댓말로 써 주세요.",
    "- 후보 정보에 없는 사실·수치는 쓰지 마세요. 가격·용량 같은 숫자도 쓰지 마세요.",
    "- 후보 원료 말고 다른 원료는 언급하지 마세요.",
    `- 의약품처럼 낫는다는 표현은 쓰지 마세요 (${BANNED_PHRASES.join(", ")}).`,
    "",
    "[후보 정보]",
    describeLine(cand, season, data)
  ].join("\n");
}

/* 메모는 글만, 빈 줄은 빼고 최대 5개 */
export function cleanNotes(raw) {
  return isStringArray(raw?.notes) ? raw.notes.map(s => s.trim()).filter(Boolean).slice(0, 5) : [];
}
